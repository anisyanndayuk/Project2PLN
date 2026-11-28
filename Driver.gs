// ==========================================
// PLN Drive - Driver.gs
// Bergantung pada Kode.gs: SPREADSHEET_ID dan getSesi(sid).
// Isi: (1) HELPER BERSAMA role Driver (dipakai semua file DriverXxx.gs berikutnya),
//      (2) aturan "bisa ditugaskan atau tidak", (3) pembentuk tugas bersama, (4) fungsi Beranda, (5) fungsi Tugas Saya.
// Helper ada di objek DRV supaya tidak bentrok dengan file role lain.
//
// Skema sheet DRIVER: ID_DRIVER, ID_PENGGUNA, JENIS_DRIVER (Tetap / Pengganti), STATUS_DRIVER, MASA_BERLAKU_SIM
//   STATUS_AKUN (Ya / Tidak): Tidak = driver sudah resign, datanya tetap disimpan. Kosong dianggap Ya. JENIS_SIM boleh ada, diabaikan.
//   Nama lama STATUS juga masih terbaca.
//   STATUS: Siap Tugas | Bertugas | Nonaktif | SIM Perlu Dicek
//   Siap Tugas / Nonaktif diisi admin. Bertugas diisi sistem (saat Mulai, kembali ke Siap Tugas saat Selesai).
//   SIM Perlu Dicek dihitung otomatis dari MASA_BERLAKU_SIM (admin juga boleh mengisinya manual).
// ==========================================

function includeDriver_(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

const DRV = {
  ZONA: 'Asia/Jakarta',
  PERINGATAN_SIM_HARI: 30,
  // Kolom waktu dibaca sebagai teks tampilan (format sel: yyyy-mm-dd hh:mm[:ss]) agar bebas masalah zona waktu
  WAKTU: ['WAKTU_BERANGKAT', 'WAKTU_TIBA_ESTIMASI', 'JAM_TIBA_ESTIMASI', 'WAKTU_MULAI', 'WAKTU_SELESAI'],

  baca(ss, nama) {
    const sh = ss.getSheetByName(nama);
    if (!sh || sh.getLastRow() < 2) return [];
    const rg = sh.getDataRange(), v = rg.getValues(), t = rg.getDisplayValues();
    const h = v[0].map(x => String(x).trim().toUpperCase()), out = [];
    for (let r = 1; r < v.length; r++) {
      if (String(v[r][0]).trim() === '') continue;
      const o = {};
      h.forEach((k, i) => o[k] = DRV.WAKTU.indexOf(k) > -1 ? DRV.waktuTeks(v[r][i], t[r][i]) : v[r][i]);
      out.push(o);
    }
    return out;
  },
  // Status driver: kolom STATUS_DRIVER (nama lama STATUS tetap terbaca)
  statusDrv(d) { return d ? (d.STATUS_DRIVER !== undefined ? d.STATUS_DRIVER : d.STATUS) : ''; },
  // Sel waktu -> teks 'yyyy-MM-dd HH:mm:ss' (zona Jakarta). Sel bertipe tanggal dipakai langsung, jadi format tampilan
  // sheet (dd/mm/yyyy atau yyyy-mm-dd) dan zona waktu spreadsheet tidak berpengaruh. Sel teks dibaca apa adanya.
  waktuTeks(v, tampil) {
    if (v instanceof Date && !isNaN(v.getTime()) && v.getFullYear() >= 1950) return Utilities.formatDate(v, DRV.ZONA, 'yyyy-MM-dd HH:mm:ss');
    return String(tampil == null ? '' : tampil);
  },
  sama(a, b) { return a != null && b != null && String(a).trim() !== '' && String(a).trim() === String(b).trim(); },
  st(s) { return String(s || '').trim().toLowerCase(); },
  kosong(s) { return String(s == null ? '' : s).trim() === ''; },
  tgl(s) { return DRV.tglBebas(s); },
  jam(s) { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; },
  iso(s) {
    const d = DRV.tgl(s), m = String(s).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return d && m ? d + 'T' + m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00') + '+07:00' : '';
  },
  // Tanggal dari sel apa pun (objek Date, teks yyyy-mm-dd, atau dd/mm/yyyy) menjadi yyyy-mm-dd. Kosong bila tidak terbaca.
  tglBebas(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, DRV.ZONA, 'yyyy-MM-dd');
    const s = String(v == null ? '' : v).trim();
    let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
  },
  // Selisih hari dari tanggal a ke b (yyyy-mm-dd); positif bila b setelah a
  selisihHari(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
};

// Pengecek sesi bersama. Panggil di AWAL setiap fungsi publik driver:
//   const sesi = driverSesi_(sid); if (sesi.galat) return sesi.galat; const user = sesi.user;
function driverSesi_(sid) {
  const user = getSesi(sid);
  if (!user) return { galat: { ok: false, kode: 'SESI', pesan: 'Sesi berakhir. Silakan masuk lagi.' } };
  if (user.peran !== 'Driver') return { galat: { ok: false, kode: 'AKSES', pesan: 'Halaman ini khusus driver.' } };
  return { user: user };
}

// ==========================================
// ATURAN: BISA DITUGASKAN ATAU TIDAK
// Satu sumber aturan untuk Beranda, Mulai Perjalanan, dan daftar pilihan driver di halaman admin.
//   drv  : satu baris sheet DRIVER (hasil DRV.baca) atau undefined
//   hari : tanggal hari ini yyyy-MM-dd
// Hasil: { bisa, kode, alasan, peringatan }
//   bisa=false -> alasan berisi kalimat untuk ditampilkan. bisa=true -> peringatan boleh berisi pesan (SIM hampir habis).
// Yang memblokir: Nonaktif, SIM Perlu Dicek (manual), SIM sudah lewat. Siap Tugas dan Bertugas tidak memblokir.
// ==========================================
function driverBisaDitugaskan_(drv, hari) {
  hari = hari || Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
  if (!drv) return { bisa: false, kode: 'BELUM_TERDAFTAR', alasan: 'Akun ini belum terdaftar di sheet DRIVER, jadi data tugas belum bisa ditampilkan.', peringatan: '' };
  // STATUS_AKUN = Tidak (resign): data driver tetap disimpan, tetapi tidak boleh ditugaskan lagi. Kosong dianggap aktif.
  if (/^(tidak|false|no|0|nonaktif)$/i.test(String(drv.STATUS_AKUN == null ? '' : drv.STATUS_AKUN).trim())) return { bisa: false, kode: 'RESIGN', alasan: 'Akun driver ini sudah tidak aktif. Hubungi admin.', peringatan: '' };
  const st = DRV.st(DRV.statusDrv(drv)), sim = DRV.tglBebas(drv.MASA_BERLAKU_SIM);
  if (st === 'nonaktif') return { bisa: false, kode: 'NONAKTIF', alasan: 'Status Anda Nonaktif (cuti atau berhalangan). Hubungi admin.', peringatan: '' };
  if (st === 'sim perlu dicek') return { bisa: false, kode: 'SIM_DICEK', alasan: 'SIM Anda perlu dicek admin sebelum bisa ditugaskan.', peringatan: '' };
  let peringatan = '';
  if (!sim) {
    peringatan = 'Masa berlaku SIM belum tercatat. Hubungi admin.';
  } else {
    const sisa = DRV.selisihHari(hari, sim);
    if (sisa < 0) return { bisa: false, kode: 'SIM_KEDALUWARSA', alasan: 'SIM Anda sudah kedaluwarsa. Hubungi admin untuk pemeriksaan.', peringatan: '' };
    if (sisa === 0) peringatan = 'SIM Anda berakhir hari ini. Segera perpanjang.';
    else if (sisa <= DRV.PERINGATAN_SIM_HARI) peringatan = 'SIM Anda habis dalam ' + sisa + ' hari. Segera perpanjang.';
  }
  return { bisa: true, kode: '', alasan: '', peringatan: peringatan };
}

// ==========================================
// PEMBENTUK TUGAS (dipakai Beranda dan Tugas Saya supaya bentuk datanya sama)
// Hanya kolom yang dibutuhkan yang dikirim ke browser.
// ==========================================
function driverBentukTugas_(b, mobil, orang, perj) {
  const m = mobil[String(b.ID_MOBIL).trim()] || {}, o = orang[String(b.ID_PEMOHON).trim()] || {};
  const p = DRV.st(b.STATUS) === 'berjalan' ? perj.find(x => DRV.sama(x.ID_BOOKING, b.ID_BOOKING) && DRV.kosong(x.WAKTU_SELESAI)) : null;
  return {
    id: String(b.ID_BOOKING), status: String(b.STATUS).trim(),
    tanggal: DRV.tgl(b.WAKTU_BERANGKAT), jam: DRV.jam(b.WAKTU_BERANGKAT),
    tiba: DRV.jam(b.WAKTU_TIBA_ESTIMASI || b.JAM_TIBA_ESTIMASI),
    tujuan: String(b.TUJUAN || ''), keperluan: String(b.KEPERLUAN || ''),
    penumpang: Number(b.JUMLAH_PENUMPANG) || 0,
    pemohon: o.NAMA || '-', bagian: String(b.BAGIAN || o.BAGIAN || ''), hp: String(o.NO_HP || ''),
    mobil: String(m.JENIS || ''), plat: String(m.PLAT || ''),
    mulai: p ? DRV.iso(p.WAKTU_MULAI) : '', kmAwal: p ? Number(p.KM_AWAL) || 0 : 0
  };
}

// ==========================================
// FITUR BERANDA
// ==========================================

// Identitas HANYA dari sesi di server (sid), tidak pernah dari data kiriman browser.
function driverBeranda(sid) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hari = Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
    const idUser = user.id;

    const semuaOrang = DRV.baca(ss, 'PENGGUNA');
    const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, idUser));
    const idDrv = drv ? drv.ID_DRIVER : null;
    const milikku = rows => idDrv ? rows.filter(r => DRV.sama(r.ID_DRIVER, idDrv)) : [];

    const mobil = {}, orang = {};
    DRV.baca(ss, 'MOBIL').forEach(m => mobil[String(m.ID_MOBIL).trim()] = m);
    semuaOrang.forEach(u => orang[String(u.ID_PENGGUNA).trim()] = u);

    // Statistik
    const perj = milikku(DRV.baca(ss, 'PERJALANAN'));
    const selesai = perj.filter(p => !DRV.kosong(p.WAKTU_SELESAI));
    const jarak = selesai.reduce((s, p) => s + (Number(p.JARAK_KM) || 0), 0);
    const nilai = milikku(DRV.baca(ss, 'RATING')).map(r => Number(r.NILAI)).filter(n => n > 0);
    // Angka bulan ini (berdasarkan tanggal selesai) dan sisa masa berlaku SIM, untuk kartu info di Beranda
    const bulanIni = hari.slice(0, 7);
    const selesaiBulan = selesai.filter(p => String(DRV.tgl(p.WAKTU_SELESAI) || '').slice(0, 7) === bulanIni);
    const jarakBulan = selesaiBulan.reduce((s, p) => s + (Number(p.JARAK_KM) || 0), 0);
    const simTgl = drv ? DRV.tglBebas(drv.MASA_BERLAKU_SIM) : '';

    // Tugas
    const bentuk = b => driverBentukTugas_(b, mobil, orang, perj);
    const urut = (a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam);
    const tugas = milikku(DRV.baca(ss, 'BOOKING')).map(bentuk);
    const berjalan = tugas.filter(t => DRV.st(t.status) === 'berjalan').sort(urut);
    const disetujui = tugas.filter(t => DRV.st(t.status) === 'disetujui' && t.tanggal >= hari).sort(urut);
    const hariIni = disetujui.filter(t => t.tanggal === hari);
    const saatIni = berjalan[0] || hariIni[0] || null;

    return {
      ok: true, hari: hari, profilDriverAda: !!drv,
      pengguna: { nama: user.nama || 'Pengguna' },
      jenisDriver: drv ? String(drv.JENIS_DRIVER || '') : '',      // Tetap / Pengganti
      statusDriver: drv ? String(DRV.statusDrv(drv) || '') : '',           // Siap Tugas / Bertugas / Nonaktif / SIM Perlu Dicek
      penugasan: driverBisaDitugaskan_(drv, hari),
      total: selesai.length, jarak: jarak, rata: selesai.length ? jarak / selesai.length : 0,
      bulanIni: selesaiBulan.length, jarakBulan: jarakBulan,
      simSisaHari: simTgl ? DRV.selisihHari(hari, simTgl) : null,
      rating: nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null, ulasan: nilai.length,
      statusHariIni: berjalan.length ? 'bertugas' : hariIni.length ? 'ada' : 'kosong', jumlahHariIni: hariIni.length,
      state: berjalan.length ? 'berjalan' : hariIni.length ? 'siap' : 'kosong',
      saatIni: saatIni,
      mendatang: disetujui.filter(t => !saatIni || t.id !== saatIni.id).slice(0, 3),
      totalTugas: berjalan.length + disetujui.length
    };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal membaca database: ' + e.message };
  }
}

// ==========================================
// FITUR TUGAS SAYA
// Semua tugas aktif milik driver ini (Berjalan dan Disetujui). Yang sudah Selesai ada di Riwayat Perjalanan.
// Tiap tugas diberi kategori: berjalan | hari_ini | mendatang | terlewat
//   terlewat = status masih Disetujui tetapi tanggalnya sudah lewat (admin perlu menindaklanjuti).
// Urutan: Berjalan, Hari ini, Mendatang (terdekat dulu), Terlewat (terbaru dulu).
// Pemfilteran tab dan pembagian halaman dikerjakan di browser.
// ==========================================
function driverTugas(sid) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hari = Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
    const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, user.id));
    const kosong = { semua: 0, berjalan: 0, hariIni: 0, mendatang: 0, terlewat: 0 };
    if (!drv) return { ok: true, hari: hari, profilDriverAda: false, penugasan: driverBisaDitugaskan_(null, hari), tugas: [], jumlah: kosong };

    const mobil = {}, orang = {};
    DRV.baca(ss, 'MOBIL').forEach(m => mobil[String(m.ID_MOBIL).trim()] = m);
    DRV.baca(ss, 'PENGGUNA').forEach(u => orang[String(u.ID_PENGGUNA).trim()] = u);
    const perj = DRV.baca(ss, 'PERJALANAN').filter(p => DRV.sama(p.ID_DRIVER, drv.ID_DRIVER));

    const urutNaik = (a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam);
    const peringkat = { berjalan: 0, hari_ini: 1, mendatang: 2, terlewat: 3 };
    const tugas = DRV.baca(ss, 'BOOKING')
      .filter(b => DRV.sama(b.ID_DRIVER, drv.ID_DRIVER) && ['berjalan', 'disetujui'].indexOf(DRV.st(b.STATUS)) > -1)
      .map(b => {
        const t = driverBentukTugas_(b, mobil, orang, perj);
        t.kategori = DRV.st(t.status) === 'berjalan' ? 'berjalan'
          : !t.tanggal ? 'mendatang' : t.tanggal === hari ? 'hari_ini' : t.tanggal > hari ? 'mendatang' : 'terlewat';
        return t;
      })
      .sort((a, b) => peringkat[a.kategori] - peringkat[b.kategori] || (a.kategori === 'terlewat' ? urutNaik(b, a) : urutNaik(a, b)));

    const hitung = k => tugas.filter(t => t.kategori === k).length;
    return {
      ok: true, hari: hari, profilDriverAda: true, penugasan: driverBisaDitugaskan_(drv, hari), tugas: tugas,
      jumlah: { semua: tugas.length, berjalan: hitung('berjalan'), hariIni: hitung('hari_ini'), mendatang: hitung('mendatang'), terlewat: hitung('terlewat') }
    };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal membaca database: ' + e.message };
  }
}