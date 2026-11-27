// ==========================================
// PLN Drive - DriverRatingServer.gs (role Driver: halaman Rating Saya)
// Bergantung pada Driver.gs: DRV, driverSesi_()
// Fungsi publik: driverRating(sid). Hanya membaca rating milik driver yang login (identitas dari sesi).
// Nama file sengaja tidak sama dengan file HTML (Apps Script tidak mengizinkan nama dasar yang sama).
//
// Sheet RATING: kolom wajib ID_DRIVER dan NILAI (1-5). Kolom lain bersifat opsional dan dikenali dengan nama berikut
// (ambil yang pertama ada): ulasan = ULASAN / KOMENTAR / KOMEN / CATATAN, tanggal = WAKTU_RATING / TANGGAL_RATING / TANGGAL / WAKTU / CREATED_AT,
// ID_BOOKING (untuk tujuan perjalanan) dan ID_PEMOHON (untuk nama pemberi rating).
// ==========================================

var RTG = {
  MAKS_DAFTAR: 200,
  KOLOM_ULASAN: ['ULASAN', 'KOMENTAR', 'KOMEN', 'CATATAN'],
  KOLOM_TANGGAL: ['WAKTU_RATING', 'TANGGAL_RATING', 'TANGGAL', 'WAKTU', 'CREATED_AT']
};

function driverRating(sid) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sebaran = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const kosong = { ok: true, profilDriverAda: false, rata: null, jumlah: 0, jumlahUlasan: 0, sebaran: sebaran, daftar: [], terpotong: false };
    const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, user.id));
    if (!drv) return kosong;

    const booking = {}, orang = {};
    DRV.baca(ss, 'BOOKING').forEach(b => booking[String(b.ID_BOOKING).trim()] = b);
    DRV.baca(ss, 'PENGGUNA').forEach(u => orang[String(u.ID_PENGGUNA).trim()] = u);
    const ambil = (r, daftar) => { for (const k of daftar) if (r[k] !== undefined && !DRV.kosong(r[k])) return r[k]; return ''; };

    const semua = [];
    DRV.baca(ss, 'RATING').forEach((r, i) => {
      if (!DRV.sama(r.ID_DRIVER, drv.ID_DRIVER)) return;
      const nilai = Math.round(Number(r.NILAI));
      if (!(nilai >= 1 && nilai <= 5)) return;
      const b = booking[String(r.ID_BOOKING || '').trim()] || {};
      const o = orang[String(r.ID_PEMOHON || b.ID_PEMOHON || '').trim()] || {};
      sebaran[nilai]++;
      semua.push({
        urut: i, nilai: nilai, ulasan: String(ambil(r, RTG.KOLOM_ULASAN)).trim(),
        tanggal: DRV.tglBebas(ambil(r, RTG.KOLOM_TANGGAL)), idBooking: String(r.ID_BOOKING || ''),
        tujuan: String(b.TUJUAN || ''), pemohon: o.NAMA || ''
      });
    });

    // Terbaru dulu: urut tanggal bila ada, selebihnya urutan baris (baris paling bawah = paling baru)
    semua.sort((a, c) => (c.tanggal || '').localeCompare(a.tanggal || '') || c.urut - a.urut);
    const rata = semua.length ? semua.reduce((n, x) => n + x.nilai, 0) / semua.length : null;
    const daftar = semua.slice(0, RTG.MAKS_DAFTAR).map(x => { delete x.urut; return x; });
    return {
      ok: true, profilDriverAda: true, rata: rata, jumlah: semua.length, jumlahUlasan: semua.filter(x => x.ulasan).length,
      sebaran: sebaran, daftar: daftar, terpotong: semua.length > daftar.length
    };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal membaca database: ' + e.message };
  }
}