'use strict';
/* Proksi Claude: permintaan Messages API dari aplikasi dosen diteruskan ke Anthropic memakai
   kunci API milik server (kunci tidak pernah dikirim ke perangkat dosen). Parameter disaring,
   model dibatasi sesuai pengaturan admin, dan pemakaian token dicatat per pengguna. */
const { Anthropic, APIError, APIUserAbortError, APIConnectionError } = require('@anthropic-ai/sdk');

/* USD per 1 juta token: [masukan, keluaran, baca cache, tulis cache] — perkiraan untuk kuota */
const PRICES = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-sonnet-5-5': [2, 10, 0.1, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-sonnet-5': [2, 10, 0.2, 2.5]
};
const MODEL_NAMES = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5' };
const KNOWN_MODELS = Object.keys(MODEL_NAMES);
const ALLOWED_BETAS = ['server-side-fallback-2026-07-01'];
const PASS_KEYS = ['model', 'max_tokens', 'messages', 'system', 'thinking', 'output_config', 'stop_sequences', 'cache_control'];
const BLOCKED_KEYS = ['tools', 'tool_choice', 'mcp_servers', 'container', 'temperature', 'top_p', 'top_k', 'service_tier', 'speed', 'inference_geo', 'thread', 'context_management', 'diagnostics'];

function priceFor(model) {
  const m = String(model || '');
  if (PRICES[m]) return PRICES[m];
  if (/haiku/.test(m)) return PRICES['claude-haiku-5-5'];
  if (/sonnet/.test(m)) return PRICES['claude-sonnet-5-5'];
  return PRICES['claude-opus-5']; // model lain: pakai tarif yang lebih tinggi agar kuota aman
}
function estimateCost(model, u) {
  const p = priceFor(model);
  u = u || {};
  return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[2] + (u.cache_creation_input_tokens || 0) * p[3]) / 1e6;
}

/* galat berformat Messages API agar SDK di peramban menampilkannya dengan benar */
function apiErr(status, type, message) {
  const e = new Error(message);
  e.status = status; e.apiType = type; e.apiMessage = message;
  return e;
}
const SP = '[Server Pusat] ';

let client = null, clientSig = '';
function getClient(key, baseURL) {
  const sig = key + '|' + (baseURL || '');
  if (!client || clientSig !== sig) {
    const opts = { apiKey: key, maxRetries: 2, timeout: 20 * 60 * 1000 };
    if (baseURL) opts.baseURL = baseURL;
    client = new Anthropic(opts);
    clientSig = sig;
  }
  return client;
}

function buildParams(body, policy, user) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiErr(400, 'invalid_request_error', SP + 'Isi permintaan tidak valid.');
  for (const k of BLOCKED_KEYS) if (k in body) throw apiErr(400, 'invalid_request_error', SP + 'Parameter "' + k + '" tidak diizinkan melalui server pusat.');
  if (policy.allowedModels.indexOf(body.model) < 0) {
    throw apiErr(403, 'permission_error', SP + 'Model ' + body.model + ' tidak diizinkan admin. Pilih salah satu: ' + policy.allowedModels.join(', ') + '.');
  }
  if (!Array.isArray(body.messages) || !body.messages.length) throw apiErr(400, 'invalid_request_error', SP + 'Daftar pesan kosong.');
  const params = {};
  for (const k of PASS_KEYS) if (body[k] !== undefined) params[k] = body[k];
  const cap = body.stream ? policy.maxTokensCap : Math.min(policy.maxTokensCap, 16000);
  params.max_tokens = Math.max(1, Math.min(parseInt(body.max_tokens, 10) || 16000, cap));
  params.metadata = { user_id: 'mrp-' + user.id }; // pengenal pengguna tanpa data pribadi
  return params;
}

function parseBetas(header) {
  return String(header || '').split(',').map((s) => s.trim()).filter((b) => ALLOWED_BETAS.indexOf(b) >= 0);
}

function errorInfo(e) {
  if (e && e.apiType) return { status: e.status, type: e.apiType, message: e.apiMessage };
  if (e instanceof APIUserAbortError) return { status: 499, type: 'api_error', message: 'Dibatalkan.' };
  if (e instanceof APIError && e.status) {
    const inner = e.error && e.error.error;
    return { status: e.status, type: (inner && inner.type) || 'api_error', message: (inner && inner.message) || e.message, retryAfter: e.headers && (typeof e.headers.get === 'function' ? e.headers.get('retry-after') : e.headers['retry-after']) };
  }
  if (e instanceof APIConnectionError) return { status: 502, type: 'api_error', message: SP + 'Server tidak dapat menghubungi layanan Claude. Periksa koneksi internet server.' };
  return { status: 500, type: 'api_error', message: SP + 'Kesalahan internal proksi: ' + (e && e.message ? e.message : String(e)) };
}

function sendApiError(res, info) {
  if (res.headersSent) return;
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (info.retryAfter) headers['Retry-After'] = String(info.retryAfter);
  res.writeHead(info.status === 499 ? 400 : info.status, headers);
  res.end(JSON.stringify({ type: 'error', error: { type: info.type, message: info.message } }));
}

const active = new Map(); // userId -> jumlah permintaan berjalan

/* ctx: { req, res, user, body, policy, apiKey, baseURL, record(model, usage, ok, ms, err) } */
async function handleMessages(ctx) {
  const { req, res, user, body, policy } = ctx;
  const t0 = Date.now();
  let params;
  try {
    params = buildParams(body, policy, user);
  } catch (e) { return sendApiError(res, errorInfo(e)); }
  const running = active.get(user.id) || 0;
  if (running >= policy.maxConcurrent) {
    return sendApiError(res, { status: 429, type: 'rate_limit_error', message: SP + 'Terlalu banyak permintaan AI bersamaan dari akun Anda. Tunggu sebentar.', retryAfter: 5 });
  }
  active.set(user.id, running + 1);
  const betas = parseBetas(req.headers['anthropic-beta']);
  if (betas.length && body.fallbacks !== undefined) params.fallbacks = body.fallbacks;
  const anthropic = getClient(ctx.apiKey, ctx.baseURL);
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  let model = params.model;
  const usage = {};
  let recorded = false;
  const record = (ok, err) => {
    if (recorded) return; recorded = true;
    ctx.record(model, usage, ok, Date.now() - t0, err);
  };
  try {
    if (body.stream) {
      const stream = betas.length
        ? anthropic.beta.messages.stream(Object.assign({}, params, { betas: betas }), { signal: ac.signal })
        : anthropic.messages.stream(params, { signal: ac.signal });
      let started = false;
      // komentar SSE berkala menjaga koneksi (proksi balik/peramban) saat model berpikir lama
      const keepAlive = setInterval(() => { if (started && !res.writableEnded && !res.destroyed) res.write(': ping\n\n'); }, 15000);
      try {
        for await (const ev of stream) {
          if (!started) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
            started = true;
          }
          if (ev.type === 'message_start' && ev.message) { model = ev.message.model || model; Object.assign(usage, ev.message.usage || {}); }
          else if (ev.type === 'message_delta' && ev.usage) Object.assign(usage, ev.usage);
          if (res.destroyed) { ac.abort(); break; }
          res.write('event: ' + ev.type + '\ndata: ' + JSON.stringify(ev) + '\n\n');
        }
        const final = await stream.finalMessage();
        if (final && final.usage) Object.assign(usage, final.usage);
        if (final && final.model) model = final.model;
        record(true);
        res.end();
      } catch (e) {
        const info = errorInfo(e);
        record(false, info.message);
        if (!started) sendApiError(res, info);
        else if (!res.writableEnded) {
          res.write('event: error\ndata: ' + JSON.stringify({ type: 'error', error: { type: info.type, message: info.message } }) + '\n\n');
          res.end();
        }
      } finally { clearInterval(keepAlive); }
    } else {
      const msg = betas.length
        ? await anthropic.beta.messages.create(Object.assign({}, params, { betas: betas }), { signal: ac.signal })
        : await anthropic.messages.create(params, { signal: ac.signal });
      if (msg.usage) Object.assign(usage, msg.usage);
      model = msg.model || model;
      record(true);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(msg));
    }
  } catch (e) {
    const info = errorInfo(e);
    record(false, info.message);
    sendApiError(res, info);
  } finally {
    const n = (active.get(user.id) || 1) - 1;
    if (n > 0) active.set(user.id, n); else active.delete(user.id);
  }
}

/* GET /v1/models/:id — dipakai tombol "Uji koneksi" di aplikasi */
async function handleModel(ctx, id) {
  const { res, policy } = ctx;
  if (policy.allowedModels.indexOf(id) < 0) return sendApiError(res, { status: 404, type: 'not_found_error', message: SP + 'Model ' + id + ' tidak tersedia di server pusat.' });
  try {
    const m = await getClient(ctx.apiKey, ctx.baseURL).models.retrieve(id);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(m));
  } catch (e) { sendApiError(res, errorInfo(e)); }
}

/* uji kunci dari panel admin */
async function testKey(apiKey, baseURL, model) {
  const m = await getClient(apiKey, baseURL).models.retrieve(model);
  return m.display_name || m.id;
}

module.exports = { handleMessages, handleModel, testKey, estimateCost, priceFor, errorInfo, KNOWN_MODELS, MODEL_NAMES, SP };
