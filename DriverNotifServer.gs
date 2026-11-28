// ==========================================
// PLN Drive - DriverNotifServer.gs (role Driver: notifikasi di lonceng navbar)
// Bergantung pada Driver.gs: DRV, driverSesi_, driverBisaDitugaskan_, driverBentukTugas_, dan DriverRatingServer.gs (RTG)
// Fungsi publik: driverNotifikasi(sid), driverNotifBaca(sid, daftarId)
//
// Notifikasi DIHITUNG dari data yang sudah ada (tidak ada sheet baru), jadi selalu sesuai kondisi terkini:
//   Tugas dibatalkan / ditolak, Tugas terlewat, Penugasan baru (disetujui dalam 72 jam terakhir, dari WAKTU_KEPUTUSAN), Tugas hari ini, SIM habis / hampir habis, Rating baru.
// Tiap notifikasi punya id yang stabil (misal "tugas-B12"). Status "sudah dibaca" disimpan per pengguna di Script Properties
// (kunci notifbaca_<ID_PENGGUNA>, berisi daftar id). Identitas selalu dari sesi di server, tidak dari kiriman browser.
// ==========================================

var NTF = {
  MAKS: 30,                 // maksimum notifikasi yang dikirim ke browser
  JAM_BARU: 72,             // penugasan baru: disetujui admin dalam sekian jam terakhir (dihitung dari WAKTU_KEPUTUSAN)
  HARI_BATAL: 7,            // tugas dibatalkan: yang tanggalnya dalam sekian hari terakhir
  HARI_RATING: 14,          // rating baru: yang dinilai dalam sekian hari terakhir (perlu kolom tanggal di sheet RATING)
  MAKS_TERSIMPAN: 300,      // batas jumlah id dibaca yang disimpan per pengguna
  BATAL: ['dibatalkan', 'ditolak', 'batal']
};

function ntfKunci_(idUser) { return 'notifbaca_' + String(idUser).trim(); }

function ntfBacaTersimpan_(idUser) {
  try {
    const t = PropertiesService.getScriptProperties().getProperty(ntfKunci_(idUser));
    const a = t ? JSON.parse(t) : [];
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}

// Waktu sel (objek Date atau teks "dd/MM/yyyy HH:mm:ss" / "yyyy-MM-dd HH:mm:ss", zona WIB) menjadi milidetik. NaN bila tidak terbaca.
function ntfWaktu_(v) {
  if (DRV.kosong(v)) return NaN;
  const tgl = DRV.tglBebas(v);
  if (!tgl) return NaN;
  const jam = v instanceof Date ? Utilities.formatDate(v, DRV.ZONA, 'HH:mm') : DRV.jam(v);
  return Date.parse(tgl + 'T' + (jam || '00:00') + ':00+07:00');
}

// "baru saja", "2 jam lalu", "kemarin", "2 hari lalu"
function ntfLalu_(ms) {
  const menit = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (menit < 2) return 'baru saja';
  if (menit < 60) return menit + ' menit lalu';
  const jam = Math.floor(menit / 60);
  if (jam < 24) return jam + ' jam lalu';
  const hari = Math.floor(jam / 24);
  return hari === 1 ? 'kemarin' : hari + ' hari lalu';
}

function ntfHari_(tgl, n) {  // tanggal yyyy-MM-dd digeser n hari
  return Utilities.formatDate(new Date(Date.parse(tgl + 'T00:00:00Z') + n * 86400000), 'UTC', 'yyyy-MM-dd');
}

// Susun daftar notifikasi (tanpa status dibaca). Urutan: yang penting dulu.
function ntfSusun_(ss, user) {
  const hari = Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
  const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, user.id));
  const hasil = [];
  const tambah = (urut, id, jenis, judul, teks, hal) => hasil.push({ urut: urut, id: id, jenis: jenis, judul: judul, teks: teks, hal: hal });
  if (!drv) return { hari: hari, daftar: [] };

  const mobil = {}, orang = {};
  DRV.baca(ss, 'MOBIL').forEach(m => mobil[String(m.ID_MOBIL).trim()] = m);
  DRV.baca(ss, 'PENGGUNA').forEach(u => orang[String(u.ID_PENGGUNA).trim()] = u);
  const perj = DRV.baca(ss, 'PERJALANAN').filter(p => DRV.sama(p.ID_DRIVER, drv.ID_DRIVER));
  const tugas = DRV.baca(ss, 'BOOKING').filter(b => DRV.sama(b.ID_DRIVER, drv.ID_DRIVER)).map(b => {
    const t = driverBentukTugas_(b, mobil, orang, perj);
    t.keputusan = ntfWaktu_(b.WAKTU_KEPUTUSAN);                                   // kapan admin menyetujui / menugaskan
    t.alasan = String(b.ALASAN_BATAL || b.ALASAN_TOLAK || '').trim();             // alasan bila dibatalkan / ditolak
    return t;
  });
  const ket = t => (t.tujuan || 'Perjalanan dinas') + ' · ' + t.jam + ' WIB';
  const tglId = t => t.tanggal.slice(8, 10) + '/' + t.tanggal.slice(5, 7);

  // 1. Dibatalkan / ditolak (baru-baru ini)
  const batasBatal = ntfHari_(hari, -NTF.HARI_BATAL);
  tugas.filter(t => NTF.BATAL.indexOf(DRV.st(t.status)) >= 0 && t.tanggal >= batasBatal)
    .forEach(t => tambah(10, 'batal-' + t.id, 'batal', DRV.st(t.status) === 'ditolak' ? 'Tugas ditolak' : 'Tugas dibatalkan', ket(t) + ' (' + tglId(t) + ') tidak jadi dilaksanakan.' + (t.alasan ? ' Alasan: ' + t.alasan + '.' : ''), 'riwayat'));

  // 2. Terlewat (masih Disetujui tetapi tanggalnya sudah lewat)
  tugas.filter(t => DRV.st(t.status) === 'disetujui' && t.tanggal && t.tanggal < hari)
    .forEach(t => tambah(20, 'lewat-' + t.id, 'peringatan', 'Tugas belum dimulai', ket(t) + ' (' + tglId(t) + ') sudah lewat. Hubungi admin.', 'tugas'));

  // 3. SIM
  const sim = DRV.tglBebas(drv.MASA_BERLAKU_SIM);
  if (sim) {
    const sisa = DRV.selisihHari(hari, sim);
    if (sisa < 0) tambah(15, 'sim-habis-' + sim, 'peringatan', 'SIM sudah kedaluwarsa', 'Anda tidak dapat ditugaskan sebelum SIM diperpanjang.', 'profil');
    else if (sisa <= 30) tambah(40, 'sim-30-' + sim, 'sim', 'SIM hampir habis', sisa === 0 ? 'SIM berakhir hari ini. Segera perpanjang.' : 'Masa berlaku SIM tinggal ' + sisa + ' hari. Segera perpanjang.', 'profil');
  }

  // 4. Tugas hari ini, dan penugasan BARU: disetujui admin dalam JAM_BARU jam terakhir (WAKTU_KEPUTUSAN) dan belum lewat.
  //    Tugas yang sudah lama disetujui tidak dianggap baru (tetap ada di Tugas Saya). Tanpa WAKTU_KEPUTUSAN tidak bisa dinilai baru.
  const sekarang = Date.now(), batasBaru = sekarang - NTF.JAM_BARU * 3600000;
  const aktif = tugas.filter(t => DRV.st(t.status) === 'disetujui' && t.tanggal >= hari)
    .sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
  aktif.filter(t => t.tanggal === hari).forEach(t => tambah(30, 'hari-' + t.id, 'tugas', 'Tugas hari ini', ket(t) + (t.plat ? ' · ' + t.plat : ''), 'tugas'));
  aktif.filter(t => t.tanggal !== hari && t.keputusan >= batasBaru && t.keputusan <= sekarang + 3600000)
    .sort((a, b) => b.keputusan - a.keputusan)   // yang paling baru ditugaskan di atas
    .forEach(t => tambah(25, 'tugas-' + t.id, 'tugas', 'Penugasan baru', 'Ditugaskan ' + ntfLalu_(t.keputusan) + ' · ' + ket(t) + ' (' + tglId(t) + ')' + (t.pemohon && t.pemohon !== '-' ? ' · ' + t.pemohon : ''), 'tugas'));

  // 5. Rating baru: hanya bila sheet RATING punya kolom tanggal (tanpa tanggal tidak bisa dibedakan mana yang baru)
  const batasRating = ntfHari_(hari, -NTF.HARI_RATING);
  DRV.baca(ss, 'RATING').forEach((r, i) => {
    if (!DRV.sama(r.ID_DRIVER, drv.ID_DRIVER)) return;
    const nilai = Math.round(Number(r.NILAI));
    if (!(nilai >= 1 && nilai <= 5)) return;
    let tgl = '';
    for (const k of RTG.KOLOM_TANGGAL) if (r[k] !== undefined && !DRV.kosong(r[k])) { tgl = DRV.tglBebas(r[k]); break; }
    if (!tgl || tgl < batasRating) return;
    const b = r.ID_BOOKING ? ntfBooking_(tugas, r.ID_BOOKING) : null;
    tambah(60, 'rating-' + (r.ID_RATING || r.ID_BOOKING || ('baris' + i)), 'rating', 'Penilaian baru: ' + nilai + ' bintang', b && b.tujuan ? 'Untuk perjalanan ' + b.tujuan + '.' : 'Dari pemohon setelah perjalanan selesai.', 'rating');
  });

  hasil.sort((a, b) => a.urut - b.urut);
  return { hari: hari, daftar: hasil.slice(0, NTF.MAKS) };
}

function ntfBooking_(tugas, id) { return tugas.find(t => String(t.id) === String(id).trim()) || null; }

// ---- Publik: daftar notifikasi + jumlah belum dibaca ----
function driverNotifikasi(sid) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const s = ntfSusun_(ss, user);
    const baca = {};
    ntfBacaTersimpan_(user.id).forEach(id => baca[id] = true);
    const daftar = s.daftar.map(n => ({ id: n.id, jenis: n.jenis, judul: n.judul, teks: n.teks, hal: n.hal, dibaca: !!baca[n.id] }));
    return { ok: true, hari: s.hari, daftar: daftar, belumDibaca: daftar.filter(n => !n.dibaca).length };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal memuat notifikasi: ' + e.message };
  }
}

// ---- Publik: tandai dibaca. daftarId = array id, atau 'semua'. Hanya id yang memang ada di daftar saat ini yang diterima. ----
function driverNotifBaca(sid, daftarId) {
  const kunci = LockService.getScriptLock();
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const user = sesi.user;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const ada = ntfSusun_(ss, user).daftar.map(n => n.id);
    const pilih = daftarId === 'semua' ? ada : (Array.isArray(daftarId) ? daftarId.map(String).filter(id => ada.indexOf(id) >= 0) : []);
    kunci.waitLock(5000);
    // simpan hanya id yang masih ada di daftar saat ini (yang sudah tidak relevan dibuang), dibatasi jumlahnya
    const lama = ntfBacaTersimpan_(user.id).filter(id => ada.indexOf(id) >= 0);
    const baru = lama.concat(pilih.filter(id => lama.indexOf(id) < 0)).slice(-NTF.MAKS_TERSIMPAN);
    PropertiesService.getScriptProperties().setProperty(ntfKunci_(user.id), JSON.stringify(baru));
    return { ok: true, belumDibaca: ada.filter(id => baru.indexOf(id) < 0).length };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal menyimpan: ' + e.message };
  } finally {
    try { kunci.releaseLock(); } catch (e) {}
  }
}