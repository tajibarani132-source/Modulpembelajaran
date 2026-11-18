/* template.js — penyusun isi modul tanpa AI (mode offline).
   Menghasilkan struktur yang sama dengan keluaran AI, berbasis data RPS:
   kerangka akademik + panduan belajar terarah (bukan teori karangan). */
(function (g) {
  'use strict';
  var MRP = g.MRP, U = MRP.util;
  var T = (MRP.template = {});

  function pick(arr, i) { return arr[Math.abs(i) % arr.length]; }
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function lower(s) { return U.lowerPhrase(s); }

  T.konteks = function (prodi) {
    var p = String(prodi || '').toLowerCase();
    if (/dakwah|penyuluhan|pengembangan masyarakat/.test(p)) return { ruang: 'lembaga dan aktivitas dakwah', lembaga: 'lembaga dakwah', aktor: 'pengelola lembaga dakwah' };
    if (/komunikasi|penyiaran|jurnalistik/.test(p)) return { ruang: 'komunikasi dan media dakwah', lembaga: 'media dakwah', aktor: 'praktisi komunikasi Islam' };
    if (/konseling|bimbingan/.test(p)) return { ruang: 'layanan bimbingan dan konseling Islam', lembaga: 'lembaga layanan konseling', aktor: 'konselor' };
    if (/pendidikan|tarbiyah|tadris|guru|madrasah|pai|piaud|pgmi|mpi/.test(p)) return { ruang: 'satuan pendidikan dan pembelajaran', lembaga: 'madrasah atau sekolah', aktor: 'pendidik' };
    if (/ekonomi|bisnis|perbankan|keuangan|akuntansi|zakat|wakaf/.test(p)) return { ruang: 'lembaga keuangan dan bisnis syariah', lembaga: 'lembaga keuangan syariah', aktor: 'pengelola lembaga' };
    if (/hukum|syariah|ahwal|siyasah|muamalah/.test(p)) return { ruang: 'praktik hukum Islam di masyarakat', lembaga: 'lembaga peradilan atau hukum', aktor: 'praktisi hukum' };
    if (/tafsir|qur|hadis|akidah|filsafat|tasawuf|ushuluddin/.test(p)) return { ruang: 'kajian keislaman dan kehidupan masyarakat', lembaga: 'lembaga kajian keislaman', aktor: 'pengkaji' };
    return { ruang: 'kehidupan masyarakat muslim', lembaga: 'organisasi kemasyarakatan', aktor: 'praktisi' };
  };

  T.subtopics = function (m) {
    var src = U.clean(m.materi || '').replace(/^\s*materi\s*(pembelajaran)?\s*[:：]\s*/i, '');
    src = src.split(/\b(referensi|pustaka|sumber)\s*[:：]/i)[0];
    var parts = [];
    src.split('\n').forEach(function (line) {
      line.split(/;|,(?![^()]*\))|\s+-\s+/).forEach(function (p) {
        p = p.replace(/^\s*(\d+[.)]|[-•·])\s*/, '').replace(/[.:]+$/, '').trim();
        if (p && U.countWords(p) <= 14 && U.countWords(p) >= 1 && !/^(dll|dsb|dan lain-lain)$/i.test(p)) parts.push(p);
      });
    });
    var uniq = [];
    parts.forEach(function (p) {
      var t = MRP.parse.cleanTitle(p, 10);
      if (t && uniq.every(function (u) { return u.toLowerCase() !== t.toLowerCase(); })) uniq.push(t);
    });
    var topic = m.judul;
    uniq = uniq.filter(function (u) { return u.toLowerCase() !== String(topic || '').toLowerCase(); });
    return uniq.slice(0, 4);
  };

  function objectives(m, topic, subs, kx) {
    var src = [m.subCpmk, m.indikator].join('\n');
    var out = [];
    src.split(/\n|;\s+|\.\s+(?=[A-Z])/).forEach(function (s) {
      s = U.oneLine(s).replace(/\((sub[\s-]*)?c[mp]{2,3}k[^)]*\)/gi, '').trim().replace(/^(cpmk[\s-]*\d+\s*[,;:]?\s*)?(sub[\s-]*cpmk[\s-]*\d+\s*[:.,]?\s*)?/i, '').trim();
      s = s.replace(/^(indikator\s*[:：]\s*)/i, '').replace(/^(mahasiswa\s+)?(mampu|dapat)\s+/i, '').replace(/^(ketepatan|kemampuan|ketetapan)\s+(dalam\s+)?/i, '').trim();
      if (U.countWords(s) < 3 || U.countWords(s) > 40) return;
      s = U.upperFirst(s.replace(/[.;,]+$/, ''));
      if (!/^(Me|Ber|Di)/.test(s)) s = 'Memahami ' + lower(s);
      if (out.every(function (o) { return o.toLowerCase() !== s.toLowerCase(); })) out.push(s);
    });
    if (out.length < 3) {
      [
        'Menjelaskan pengertian, ruang lingkup, dan unsur pokok ' + lower(topic),
        subs[0] ? 'Menganalisis ' + lower(subs[0]) + (subs[1] ? ' dan ' + lower(subs[1]) : '') + ' secara kritis' : 'Menganalisis konsep dan teori yang berkaitan dengan ' + lower(topic),
        'Menerapkan pemahaman tentang ' + lower(topic) + ' dalam konteks ' + kx.ruang
      ].forEach(function (s) { if (out.length < 4) out.push(s); });
    }
    return out.slice(0, 4);
  }

  function refsFor(m, rps) {
    var list = rps.pustaka || [];
    var p = U.oneLine(m.pustaka || '');
    var nums = p.match(/\b\d{1,2}\b/g);
    var refs = [];
    if (nums && list.length && /^[\d,\s;&dan-]+$/i.test(p.replace(/pustaka|referensi|[:：]/gi, ''))) {
      nums.forEach(function (n) { var r = list[+n - 1]; if (r && refs.indexOf(r) < 0) refs.push(r); });
    } else if (p && U.countWords(p) > 3) {
      p.split(/;\s+|\n/).forEach(function (r) { r = U.oneLine(r); if (r.length > 12) refs.push(r); });
    }
    if (!refs.length) refs = list.slice(0, 3);
    return refs.slice(0, 4);
  }

  function activity(metode) {
    var s = String(metode || '').toLowerCase();
    if (/studi kasus|case/.test(s)) return 'kasus';
    if (/simulasi|role|bermain peran|praktik|praktek/.test(s)) return 'simulasi';
    if (/proyek|project|pjbl/.test(s)) return 'proyek';
    if (/observasi|lapangan|kunjungan/.test(s)) return 'observasi';
    if (/presentasi/.test(s)) return 'presentasi';
    if (/diskusi|kelompok|problem/.test(s)) return 'diskusi';
    return 'kasus';
  }

  var KONSEP_P1 = [
    'Secara konseptual, **{s}** merupakan bagian penting dalam kajian {t}. Pemahaman yang tepat terhadap {sl} membantu mahasiswa menempatkan materi ini dalam kerangka keilmuan {prodi} dan mengaitkannya dengan capaian pembelajaran mata kuliah {mk}.',
    'Pembahasan tentang **{s}** menjadi pintu masuk untuk memahami {t} secara utuh. Konsep ini perlu dipahami dari sisi pengertian, unsur pembentuk, dan ruang lingkupnya agar mahasiswa tidak keliru ketika menerapkannya dalam {ruang}.',
    '**{s}** dapat dipandang sebagai salah satu pokok bahasan yang menentukan kedalaman pemahaman terhadap {t}. Konsep ini berkaitan erat dengan praktik di {ruang}, sehingga penguasaannya menjadi bekal penting bagi lulusan Program Studi {prodi}.'
  ];
  var KONSEP_P2 = [
    'Untuk memperdalam bagian ini, telaah definisi {sl} pada referensi pertemuan, identifikasi unsur-unsur pokoknya, kemudian rumuskan pengertian operasional dengan bahasa sendiri. Bandingkan pula rumusan dari beberapa sumber untuk menemukan persamaan dan perbedaannya.',
    'Mahasiswa dianjurkan mencatat istilah kunci yang berkaitan dengan {sl}, menjelaskan hubungan antaristilah tersebut, dan menyusun contoh sederhana yang menggambarkan konsep tersebut dalam {ruang}.',
    'Langkah belajar yang disarankan adalah membaca uraian {sl} pada sumber rujukan, menandai gagasan utamanya, lalu mendiskusikan bagaimana konsep tersebut terlihat dalam praktik sehari-hari di {lembaga}.'
  ];

  T.meeting = function (rps, m, ctx) {
    ctx = ctx || {};
    var mk = ctx.mataKuliah || rps.mataKuliah || 'mata kuliah ini';
    var prodi = ctx.prodi || rps.prodi || 'terkait';
    var kx = T.konteks(prodi);
    var topic = m.judul || 'Materi Pertemuan';
    var subs = T.subtopics(m);
    var hi = hash(topic) + (ctx.index || 0);
    var words = ctx.words || 600, big = words >= 700, tiny = words < 360;
    var base = String(topic).replace(/^(pendahuluan|pengantar|konsep dasar|dasar-dasar|pengenalan|tinjauan umum)\s+/i, '') || topic;
    if (subs.length < 2) {
      subs = subs.concat(['Pengertian dan Ruang Lingkup ' + base, 'Unsur dan Karakteristik ' + base, base + ' dalam Konteks ' + U.titleCase(kx.ruang)]).slice(0, 3);
    }
    var fill = function (tpl, s) {
      return tpl.replace(/\{s\}/g, s).replace(/\{sl\}/g, lower(s)).replace(/\{t\}/g, lower(topic)).replace(/\{mk\}/g, mk)
        .replace(/\{prodi\}/g, prodi).replace(/\{ruang\}/g, kx.ruang).replace(/\{lembaga\}/g, kx.lembaga);
    };
    var refs = refsFor(m, rps);
    var act = activity(m.metode);
    var sub1 = subs[0], sub2 = subs[1] || subs[0];

    var konsep = subs.slice(0, big ? 3 : 2).map(function (s, i) {
      return { subjudul: s, isi: fill(pick(KONSEP_P1, hi + i), s) + (big ? '\n\n' + fill(pick(KONSEP_P2, hi + i + 1), s) : '') };
    });
    var refText = refs.length ? MRP.docmodel.shortRef(refs[0]).replace(/\.$/, '').slice(0, 120) : 'pustaka utama mata kuliah';
    var teori = [
      {
        subjudul: 'Landasan Teoretis',
        isi: 'Kajian teoretis tentang ' + lower(topic) + ' merujuk pada pustaka mata kuliah, antara lain ' + refText + '. Mahasiswa membandingkan pandangan para ahli, mengidentifikasi asumsi dasar setiap teori, dan menilai relevansinya bagi ' + kx.ruang + '.' + (tiny ? ' Pertanyaan pemandu: bagaimana teori tersebut diterapkan pada ' + kx.lembaga + ', serta apa kelebihan dan keterbatasannya?' : ' Pertanyaan pemandu:\n- Apa gagasan pokok teori atau model yang menjelaskan ' + lower(topic) + '?\n- Bagaimana teori tersebut diterapkan pada ' + kx.lembaga + ', serta apa kelebihan dan keterbatasannya?')
      },
      {
        subjudul: 'Perspektif Keislaman',
        isi: pick([
          'Pembahasan ' + lower(topic) + ' dapat dikaitkan dengan nilai Al-Qur\'an dan sunah, seperti amanah, musyawarah, keadilan, dan kemaslahatan. Telusuri dalil atau pandangan ulama yang relevan sebagai landasan etis dalam ' + kx.ruang + '.',
          'Prinsip ikhlas, amanah, ihsan, dan maslahat dapat dijadikan ukuran dalam menilai praktik ' + lower(topic) + ' di ' + kx.lembaga + '. Temukan rujukan ayat, hadis, atau pemikiran tokoh muslim yang berkaitan dan jelaskan relevansinya.'
        ], hi)
      }
    ];
    var praktikMap = {
      kasus: { p: 'Kegiatan praktik dilakukan melalui analisis kasus agar mahasiswa mampu menghubungkan konsep dan teori dengan persoalan nyata di ' + kx.lembaga + '.', l: ['Bentuk kelompok kecil (4–5 mahasiswa) dan pilih satu kasus nyata yang berkaitan dengan ' + lower(topic) + '.', 'Identifikasi fakta, aktor, dan persoalan utama dalam kasus tersebut.', 'Analisis kasus menggunakan konsep ' + lower(sub1) + ' dan teori yang telah dipelajari.', 'Rumuskan alternatif solusi beserta argumentasi akademiknya.', 'Sajikan hasil analisis dalam diskusi kelas dan catat masukan dari dosen serta kelompok lain.'] },
      diskusi: { p: 'Kegiatan praktik berupa diskusi terarah untuk menguji pemahaman konsep sekaligus melatih kemampuan berargumen secara ilmiah.', l: ['Baca kembali uraian konsep dan teori pada pertemuan ini.', 'Rumuskan dua pertanyaan kritis tentang ' + lower(topic) + '.', 'Diskusikan pertanyaan tersebut dalam kelompok dengan merujuk pada referensi.', 'Hubungkan hasil diskusi dengan pengalaman atau pengamatan di ' + kx.lembaga + '.', 'Simpulkan hasil diskusi dalam bentuk peta pikiran atau ringkasan satu halaman.'] },
      simulasi: { p: 'Kegiatan praktik dilakukan melalui simulasi atau bermain peran sehingga mahasiswa merasakan langsung penerapan ' + lower(topic) + '.', l: ['Pelajari skenario yang disiapkan dosen atau susun skenario sendiri berdasarkan materi.', 'Bagi peran anggota kelompok sesuai kebutuhan skenario.', 'Laksanakan simulasi dengan menerapkan konsep ' + lower(sub1) + '.', 'Lakukan refleksi: apa yang berhasil, apa kendalanya, dan bagaimana perbaikannya.', 'Tuliskan laporan singkat hasil simulasi dan refleksi.'] },
      proyek: { p: 'Kegiatan praktik berbentuk proyek mini agar mahasiswa menghasilkan produk nyata yang memanfaatkan pemahaman tentang ' + lower(topic) + '.', l: ['Tentukan sasaran dan tujuan proyek mini yang relevan dengan materi.', 'Susun rencana kerja, pembagian tugas, dan jadwal.', 'Kembangkan produk (rancangan program, media, atau dokumen) berdasarkan konsep yang dipelajari.', 'Uji atau mintakan tanggapan pihak terkait terhadap produk tersebut.', 'Presentasikan produk beserta dasar teoretisnya.'] },
      observasi: { p: 'Kegiatan praktik dilakukan melalui pengamatan langsung untuk melihat penerapan ' + lower(topic) + ' di lapangan.', l: ['Pilih satu ' + kx.lembaga + ' di sekitar tempat tinggal sebagai lokasi pengamatan.', 'Siapkan pedoman observasi atau wawancara berdasarkan konsep pertemuan ini.', 'Kumpulkan data melalui pengamatan, wawancara singkat, atau dokumen.', 'Bandingkan temuan lapangan dengan konsep dan teori yang dipelajari.', 'Laporkan temuan beserta rekomendasi perbaikan.'] },
      presentasi: { p: 'Kegiatan praktik berupa presentasi kelompok untuk melatih kemampuan menyusun dan menyampaikan gagasan akademik.', l: ['Bagi subtopik pertemuan kepada setiap kelompok.', 'Kaji subtopik menggunakan minimal dua referensi.', 'Susun bahan presentasi yang memuat konsep, teori, dan contoh penerapan.', 'Presentasikan dan tanggapi pertanyaan dari peserta lain.', 'Perbaiki bahan presentasi berdasarkan masukan diskusi.'] }
    };
    var pr = praktikMap[act];
    var praktik = {
      pengantar: pr.p,
      langkah: pr.l.slice(0, big ? 5 : tiny ? 3 : 4),
      contoh: pick([
        'Contoh penerapan: sebuah ' + kx.lembaga + ' di Kota Parepare ingin meningkatkan kualitas layanannya. Dengan memanfaatkan pemahaman tentang ' + lower(sub1) + ', mahasiswa dapat memetakan kondisi yang ada, menemukan kesenjangan, lalu merumuskan langkah perbaikan yang realistis.',
        'Contoh penerapan: ' + U.upperFirst(kx.aktor) + ' menghadapi persoalan yang berkaitan dengan ' + lower(topic) + '. Analisis persoalan tersebut menggunakan konsep ' + lower(sub1) + ' dan ' + lower(sub2) + ', kemudian tentukan langkah yang paling tepat beserta alasannya.'
      ], hi)
    };
    var processy = /proses|tahap|langkah|perencanaan|pelaksanaan|siklus|alur|prosedur|strategi|metode/i.test(topic + ' ' + m.materi);
    var visual = {
      jenis: processy && subs.length >= 3 ? 'alur' : 'peta_konsep',
      judul: (processy && subs.length >= 3 ? 'Alur ' : 'Peta Konsep ') + topic,
      pusat: topic,
      item: subs.slice(0, 5).map(function (s) {
        var mm = s.match(/^(.*?)\s*\((.*)\)\s*$/);
        return { label: mm ? mm[1] : s, keterangan: '', rincian: mm ? mm[2].split(/,\s*/).filter(function (x) { return !/^dll|dsb/i.test(x); }).slice(0, 4) : [] };
      })
    };
    var nextTitle = ctx.next ? ctx.next.judul : '';
    var waktu = (U.oneLine(m.metode).match(/(TM|BM|TT|PT)\s*[:=]?\s*[^;,\n]{3,40}/gi) || []).slice(0, 2).join('; ');
    return {
      judul: topic,
      pengantar: 'Pertemuan ini membahas ' + lower(topic) + ' sebagai bagian dari mata kuliah ' + mk + ', kemudian mengaitkannya dengan ' + kx.ruang + '.' + (big ? ' Materi disusun agar mahasiswa memahami ' + subs.slice(0, 3).map(lower).join(', ') + '.' : ''),
      tujuan: objectives(m, topic, subs, kx).slice(0, big ? 4 : 3),
      konsep: konsep,
      teori: teori,
      praktik: praktik,
      visual: visual,
      rangkuman: 'Pemahaman konsep dan teori ' + lower(topic) + ' menjadi dasar bagi penerapan yang efektif di ' + kx.ruang + '.' + (nextTitle ? ' Materi ini juga menjadi landasan bagi pertemuan berikutnya tentang ' + lower(nextTitle) + '.' : ''),
      tugas: {
        judul: { kasus: 'Analisis Kasus', diskusi: 'Ringkasan Hasil Diskusi', simulasi: 'Laporan Simulasi', proyek: 'Proyek Mini', observasi: 'Laporan Observasi', presentasi: 'Presentasi Kelompok' }[act] + ': ' + topic,
        petunjuk: 'Kerjakan tugas ini untuk memperdalam pemahaman tentang ' + lower(topic) + '.' + (m.kriteria ? ' Penilaian merujuk pada RPS: ' + U.truncateWords(U.oneLine(m.kriteria).replace(/\s*\/\s*/g, '; '), 18).replace(/[.;,]+$/, '') + '.' : ''),
        langkah: ['Pelajari kembali uraian konsep, teori, dan contoh praktik pada pertemuan ini, lalu kumpulkan minimal dua referensi yang relevan.', 'Kerjakan ' + { kasus: 'analisis kasus', diskusi: 'ringkasan diskusi', simulasi: 'laporan simulasi', proyek: 'proyek mini', observasi: 'laporan observasi', presentasi: 'bahan presentasi' }[act] + ' sesuai langkah praktik di atas.', 'Tulis hasilnya secara sistematis: pendahuluan, pembahasan, dan simpulan.', 'Kumpulkan tugas sesuai jadwal yang ditetapkan dosen.'],
        luaran: act === 'presentasi' ? 'Bahan presentasi (8–12 slide) dan ringkasan 2 halaman.' : 'Laporan tertulis 3–5 halaman (A4, Times New Roman 12, spasi 1,5) disertai daftar pustaka.',
        waktu: waktu || '1 minggu',
        penilaian: [{ aspek: 'Ketepatan konsep dan teori', bobot: 40 }, { aspek: 'Kedalaman analisis dan relevansi contoh', bobot: 40 }, { aspek: 'Sistematika penulisan dan bahasa', bobot: 20 }]
      },
      latihan: [
        (/^pengertian/i.test(sub1) ? 'Jelaskan ' + lower(sub1) : 'Jelaskan pengertian ' + lower(sub1)) + ' dan berikan contohnya dalam ' + kx.ruang + '!',
        sub2 !== sub1 ? 'Analisislah hubungan antara ' + lower(sub1) + ' dan ' + lower(sub2) + '!' : 'Analisislah unsur-unsur pokok ' + lower(sub1) + '!',
        'Identifikasi satu tantangan dalam penerapan ' + lower(topic) + ' pada ' + kx.lembaga + ' dan tawarkan solusinya berdasarkan teori yang dipelajari!'
      ],
      referensi: refs
    };
  };

  T.front = function (rps, ident) {
    var mk = ident.mataKuliah || rps.mataKuliah || 'Mata Kuliah';
    var prodi = ident.prodi || rps.prodi || '';
    var fak = ident.fakultas || rps.fakultas || '';
    var desk = rps.deskripsi ? rps.deskripsi : 'Mata kuliah ' + mk + ' membekali mahasiswa dengan pemahaman konseptual, teoretis, dan praktis yang relevan dengan bidang ' + (prodi || 'keilmuan program studi') + '. Perkuliahan dirancang berbasis capaian pembelajaran sehingga mahasiswa tidak hanya memahami teori, tetapi juga mampu menerapkannya dalam konteks nyata.';
    return {
      kata_pengantar: 'Puji syukur ke hadirat Allah Swt. atas limpahan rahmat dan karunia-Nya sehingga Modul Pembelajaran Mata Kuliah ' + mk + ' ini dapat diselesaikan. Selawat dan salam semoga senantiasa tercurah kepada Nabi Muhammad saw., teladan utama dalam menuntut dan mengamalkan ilmu.\n\nModul ini disusun berdasarkan Rencana Pembelajaran Semester (RPS) mata kuliah ' + mk + (prodi ? ' pada Program Studi ' + prodi.replace(/^program studi\s+/i, '') : '') + (fak ? ', ' + fak : '') + ', Institut Agama Islam Negeri (IAIN) Parepare. Setiap pertemuan memuat tujuan pembelajaran, uraian konsep dan teori, kegiatan praktik, visualisasi materi, panduan tugas, serta latihan sehingga dapat digunakan mahasiswa sebagai bahan belajar mandiri maupun pendamping perkuliahan.\n\nPenyusun menyadari bahwa modul ini masih memiliki kekurangan. Oleh karena itu, kritik dan saran yang membangun sangat diharapkan untuk penyempurnaan modul pada masa mendatang. Semoga modul ini bermanfaat dan menjadi amal jariah bagi semua pihak yang terlibat.',
      deskripsi: desk,
      petunjuk: [
        'Bacalah tujuan pembelajaran pada awal setiap pertemuan agar arah belajar menjadi jelas.',
        'Pelajari uraian materi secara berurutan, mulai dari konsep, teori, hingga praktik.',
        'Gunakan gambar dan bagan untuk memahami hubungan antarkonsep.',
        'Kerjakan panduan tugas sesuai petunjuk dan kumpulkan tepat waktu.',
        'Jawablah soal latihan untuk mengukur pemahaman sebelum melanjutkan ke pertemuan berikutnya.',
        'Perdalam materi melalui referensi yang dicantumkan pada setiap pertemuan dan daftar pustaka.'
      ],
      penutup: 'Modul Pembelajaran Mata Kuliah ' + mk + ' ini disusun sebagai panduan belajar yang sistematis bagi mahasiswa. Melalui konsep, teori, praktik, dan tugas pada setiap pertemuan, mahasiswa diharapkan mampu mencapai capaian pembelajaran mata kuliah secara utuh.\n\nKeberhasilan belajar sangat ditentukan oleh kesungguhan mahasiswa dalam membaca, berdiskusi, dan mengerjakan tugas. Mahasiswa dianjurkan memperkaya pemahaman melalui sumber belajar lain yang relevan dan terpercaya. Semoga modul ini memberikan manfaat bagi pengembangan keilmuan dan pengabdian di tengah masyarakat.'
    };
  };
})(window);
