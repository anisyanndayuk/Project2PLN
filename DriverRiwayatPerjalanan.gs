// ==========================================
// PLN Drive - DriverRiwayat.gs (role Driver: halaman Riwayat Perjalanan)
// Bergantung pada Driver.gs: DRV, driverSesi_()
// Fungsi publik: driverRiwayat(sid, bulan, tahun). bulan 0 = semua bulan, tahun 0 = semua tahun (berdasarkan tanggal selesai).
// Hanya perjalanan milik driver yang login (identitas dari sesi) dan sudah selesai (WAKTU_SELESAI terisi).
// ==========================================

var RWY = { MAKS_DAFTAR: 100 };

function driverRiwayat(sid, bulan, tahun) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;
    bulan = Number(bulan) || 0; tahun = Number(tahun) || 0;

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hari = Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
    const kosong = { ok: true, hari: hari, profilDriverAda: false, jumlah: 0, jarak: 0, rataDurasi: 0, tahun: [], daftar: [], terpotong: false };
    const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, user.id));
    if (!drv) return kosong;

    const booking = {}, mobil = {}, orang = {};
    DRV.baca(ss, 'BOOKING').forEach(b => booking[String(b.ID_BOOKING).trim()] = b);
    DRV.baca(ss, 'MOBIL').forEach(m => mobil[String(m.ID_MOBIL).trim()] = m);
    DRV.baca(ss, 'PENGGUNA').forEach(u => orang[String(u.ID_PENGGUNA).trim()] = u);

    const tahunAda = {}, terpilih = [];
    DRV.baca(ss, 'PERJALANAN').forEach(p => {
      if (!DRV.sama(p.ID_DRIVER, drv.ID_DRIVER) || DRV.kosong(p.WAKTU_SELESAI)) return;
      const tanggal = DRV.tgl(p.WAKTU_SELESAI);
      if (!tanggal) return;
      const th = Number(tanggal.slice(0, 4)), bl = Number(tanggal.slice(5, 7));
      tahunAda[th] = true;
      if ((tahun && th !== tahun) || (bulan && bl !== bulan)) return;

      const b = booking[String(p.ID_BOOKING).trim()] || {};
      const m = mobil[String(p.ID_MOBIL || b.ID_MOBIL || '').trim()] || {}, o = orang[String(b.ID_PEMOHON || '').trim()] || {};
      const kmAwal = Number(p.KM_AWAL) || 0, kmAkhir = Number(p.KM_AKHIR) || 0;
      terpilih.push({
        urut: String(p.WAKTU_SELESAI), id: String(p.ID_BOOKING),
        tanggal: tanggal, jamMulai: DRV.jam(p.WAKTU_MULAI), jamSelesai: DRV.jam(p.WAKTU_SELESAI),
        tujuan: String(b.TUJUAN || ''), keperluan: String(b.KEPERLUAN || ''),
        pemohon: o.NAMA || '-', bagian: String(b.BAGIAN || o.BAGIAN || ''), penumpang: Number(b.JUMLAH_PENUMPANG) || 0,
        mobil: String(m.JENIS || ''), plat: String(m.PLAT || ''),
        kmAwal: kmAwal, kmAkhir: kmAkhir,
        jarak: Number(p.JARAK_KM) || Math.max(0, kmAkhir - kmAwal),
        durasiMenit: Number(p.DURASI_MENIT) || 0,
        catatan: String(p.CATATAN_KENDALA || '').trim()
      });
    });

    terpilih.sort((a, c) => c.urut.localeCompare(a.urut));
    const jarak = terpilih.reduce((n, x) => n + x.jarak, 0);
    const adaDurasi = terpilih.filter(x => x.durasiMenit > 0);
    const rata = adaDurasi.length ? Math.round(adaDurasi.reduce((n, x) => n + x.durasiMenit, 0) / adaDurasi.length) : 0;
    const daftar = terpilih.slice(0, RWY.MAKS_DAFTAR).map(x => { delete x.urut; return x; });
    return {
      ok: true, hari: hari, profilDriverAda: true, jumlah: terpilih.length, jarak: jarak, rataDurasi: rata,
      tahun: Object.keys(tahunAda).map(Number).sort((a, c) => c - a), daftar: daftar, terpotong: terpilih.length > daftar.length
    };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal membaca database: ' + e.message };
  }
}