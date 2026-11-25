// ==========================================
// PLN Drive - Driver.gs
// Bergantung pada Kode.gs: SPREADSHEET_ID dan getSesi(sid).
// Isi: (1) HELPER BERSAMA role Driver (dipakai semua file DriverXxx.gs berikutnya), (2) fungsi Beranda.
// Helper ada di objek DRV supaya tidak bentrok dengan file role lain.
// ==========================================

function includeDriver_(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

const DRV = {
  ZONA: 'Asia/Jakarta',
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
      h.forEach((k, i) => o[k] = DRV.WAKTU.indexOf(k) > -1 ? t[r][i] : v[r][i]);
      out.push(o);
    }
    return out;
  },
  sama(a, b) { return a != null && b != null && String(a).trim() !== '' && String(a).trim() === String(b).trim(); },
  st(s) { return String(s || '').trim().toLowerCase(); },
  kosong(s) { return String(s == null ? '' : s).trim() === ''; },
  tgl(s) { return (String(s).match(/\d{4}-\d{2}-\d{2}/) || [''])[0]; },
  jam(s) { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; },
  iso(s) {
    const m = String(s).match(/(\d{4}-\d{2}-\d{2})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? m[1] + 'T' + m[2].padStart(2, '0') + ':' + m[3] + ':' + (m[4] || '00') + '+07:00' : '';
  }
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

    // Tugas (hanya kolom yang dibutuhkan yang dikirim ke browser)
    const bentuk = b => {
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
    };
    const urut = (a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam);
    const tugas = milikku(DRV.baca(ss, 'BOOKING')).map(bentuk);
    const berjalan = tugas.filter(t => DRV.st(t.status) === 'berjalan').sort(urut);
    const disetujui = tugas.filter(t => DRV.st(t.status) === 'disetujui' && t.tanggal >= hari).sort(urut);
    const hariIni = disetujui.filter(t => t.tanggal === hari);
    const saatIni = berjalan[0] || hariIni[0] || null;

    return {
      ok: true, hari: hari, profilDriverAda: !!drv,
      pengguna: { nama: user.nama || 'Pengguna' },
      statusDriver: drv ? String(drv.STATUS_DRIVER || '') : '',
      total: selesai.length, jarak: jarak, rata: selesai.length ? jarak / selesai.length : 0,
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