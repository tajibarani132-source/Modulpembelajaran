// Membangun berkas vendor yang tidak tersedia siap pakai:
//  1. app/vendor/anthropic-sdk.js  -> bundel IIFE dari @anthropic-ai/sdk
//  2. app/vendor/standard-fonts/Times.js -> metrik AFM font Times (standar PDF)
//     dimasukkan ke virtual file system pdfmake 0.2.x.
// Jalankan: node tools/build-vendor.js
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'app', 'vendor');

async function buildSdk() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'sdk-entry.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'eof',
    outfile: path.join(vendor, 'anthropic-sdk.js'),
  });
  console.log('OK anthropic-sdk.js', fs.statSync(path.join(vendor, 'anthropic-sdk.js')).size, 'bytes');
}

function buildTimes() {
  const afmDir = path.join(__dirname, 'afm');
  const names = ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'];
  const entries = names.map((n) => {
    const text = fs.readFileSync(path.join(afmDir, n + '.afm'), 'utf8');
    return `  ${JSON.stringify('data/' + n + '.afm')}: ${JSON.stringify(text)}`;
  });
  const js = `/* Metrik AFM Adobe Core 14 (Times) dari pdfkit, untuk font standar PDF di pdfmake 0.2.x */
(function (g) {
  var files = {
${entries.join(',\n')}
  };
  g.pdfMake = g.pdfMake || {};
  g.pdfMake.vfs = g.pdfMake.vfs || {};
  for (var k in files) { g.pdfMake.vfs[k] = files[k]; }
  g.pdfMake.fonts = g.pdfMake.fonts || {};
  g.pdfMake.fonts.Times = { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' };
  g.__TIMES_AFM__ = files;
})(typeof window !== 'undefined' ? window : globalThis);
`;
  const out = path.join(vendor, 'standard-fonts', 'Times.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, js);
  console.log('OK standard-fonts/Times.js', fs.statSync(out).size, 'bytes');
}

(async () => {
  buildTimes();
  await buildSdk();
})().catch((e) => { console.error(e); process.exit(1); });
