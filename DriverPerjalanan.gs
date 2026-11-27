// ==========================================
// PLNDinas - DriverPerjalanan.gs (role Driver: modal Mulai, Selesai, Total Perjalanan)
// Fungsi publik berawalan "driver" dan menerima sid sebagai argumen pertama (identitas dari sesi, bukan dari klien).
// Fungsi bantu berawalan "pjl" dan berakhiran "_" supaya tidak bentrok dengan file .gs lain.
// Bergantung pada Kode.gs: SPREADSHEET_ID, getSesi(), teks_(), huruf_()
// Bergantung pada Driver.gs: DRV, driverBisaDitugaskan_()
// ==========================================

// Nama sheet dan kolom. Kolom dibaca berdasarkan NAMA header (urutan bebas, tidak ada kolom yang ditambahkan otomatis).
// Kalau nama kolom di sheet-mu berbeda, ubah di sini.
var PJL = {
  SHEET_BOOKING: 'BOOKING', SHEET_PERJALANAN: 'PERJALANAN', SHEET_MOBIL: 'MOBIL', SHEET_DRIVER: 'DRIVER',
  FOLDER_FOTO: 'FOTO_ODOMETER_PLN_DRIVE',        // dibuat otomatis di Drive, hanya pemilik script yang bisa membuka
  STATUS_SETUJU: 'Disetujui', STATUS_JALAN: 'Berjalan', STATUS_SELESAI: 'Selesai',
  MAKS_FOTO_BYTE: 4 * 1024 * 1024,
  MAKS_DAFTAR: 50,
  KOLOM_WAKTU: ['WAKTU_MULAI', 'WAKTU_SELESAI'],
  FORMAT_WAKTU: 'yyyy-mm-dd hh:mm:ss'
};

// ---------- Fungsi publik ----------

// Dipakai form Mulai: km terakhir mobil untuk tugas ini
function driverSiapMulai(sid, idBooking) {
  try {
    var u = pjlDriver_(sid); if (!u.ok) return u;
    var b = pjlTabel_(PJL.SHEET_BOOKING, ['ID_BOOKING', 'ID_DRIVER', 'ID_MOBIL']);
    var i = pjlCari_(b, 'ID_BOOKING', idBooking);
    if (i === -1 || huruf_(b.data[i][b.h.ID_DRIVER]) !== huruf_(u.idDriver)) return pjlGagal_('Tugas tidak ditemukan.');
    var m = pjlTabel_(PJL.SHEET_MOBIL, ['ID_MOBIL', 'KM_TERAKHIR']);
    var j = pjlCari_(m, 'ID_MOBIL', b.data[i][b.h.ID_MOBIL]);
    var km = j === -1 ? '' : m.data[j][m.h.KM_TERAKHIR];
    return { ok: true, kmTerakhir: km === '' ? null : Number(km) };
  } catch (err) { return pjlGagal_(err.message); }
}

// Driver menekan Mulai: foto odometer + km awal. Jam diambil dari server, bukan dari perangkat driver.
function driverMulai(sid, d) {
  var lock = LockService.getScriptLock();
  var terkunci = false;
  try {
    var u = pjlDriver_(sid); if (!u.ok) return u;
    d = d || {};
    var km = pjlAngka_(d.kmAwal);
    if (km === null) return pjlGagal_('Km awal harus berupa angka bulat.');
    if (!d.foto) return pjlGagal_('Foto odometer awal wajib diunggah.');
    var izin = pjlIzin_(u);                         // Nonaktif, SIM Perlu Dicek, atau SIM kedaluwarsa tidak boleh memulai perjalanan
    if (!izin.bisa) return pjlGagal_('Perjalanan belum bisa dimulai. ' + izin.alasan, izin.kode);

    lock.waitLock(15000); terkunci = true;
    var b = pjlTabel_(PJL.SHEET_BOOKING, ['ID_BOOKING', 'ID_DRIVER', 'ID_MOBIL', 'STATUS']);
    var kolJadwal = b.h.WAKTU_BERANGKAT !== undefined ? 'WAKTU_BERANGKAT' : 'TGL_BERANGKAT';   // sheet BOOKING memakai WAKTU_BERANGKAT
    if (b.h[kolJadwal] === undefined) throw new Error('Kolom WAKTU_BERANGKAT tidak ada di sheet BOOKING.');
    var p = pjlTabel_(PJL.SHEET_PERJALANAN, ['ID_PERJALANAN', 'ID_BOOKING', 'ID_DRIVER', 'ID_MOBIL', 'WAKTU_MULAI', 'KM_AWAL', 'FOTO_AWAL', 'WAKTU_SELESAI']);
    var m = pjlTabel_(PJL.SHEET_MOBIL, ['ID_MOBIL', 'KM_TERAKHIR']);

    var i = pjlCari_(b, 'ID_BOOKING', d.idBooking);
    if (i === -1 || huruf_(b.data[i][b.h.ID_DRIVER]) !== huruf_(u.idDriver)) return pjlGagal_('Tugas tidak ditemukan.');
    var bk = b.data[i];
    if (huruf_(bk[b.h.STATUS]) !== huruf_(PJL.STATUS_SETUJU)) return pjlGagal_('Perjalanan ini tidak berstatus Disetujui.');
    if (pjlTglIso_(bk[b.h[kolJadwal]]) !== pjlHariIni_()) return pjlGagal_('Perjalanan hanya bisa dimulai pada hari keberangkatan.');

    var idMobil = bk[b.h.ID_MOBIL];
    for (var k = 0; k < p.data.length; k++) {          // tidak boleh ada perjalanan lain yang masih berjalan (driver atau mobil yang sama)
      var r = p.data[k];
      if (teks_(r[p.h.WAKTU_MULAI]) === '' || teks_(r[p.h.WAKTU_SELESAI]) !== '') continue;
      if (huruf_(r[p.h.ID_DRIVER]) === huruf_(u.idDriver)) return pjlGagal_('Anda masih memiliki perjalanan yang berjalan. Selesaikan dulu.');
      if (idMobil !== '' && huruf_(r[p.h.ID_MOBIL]) === huruf_(idMobil)) return pjlGagal_('Mobil ini sedang dipakai perjalanan lain.');
    }
    var j = pjlCari_(m, 'ID_MOBIL', idMobil);
    var kmSebelumnya = j === -1 ? '' : m.data[j][m.h.KM_TERAKHIR];
    if (kmSebelumnya !== '' && km < Number(kmSebelumnya)) {
      return pjlGagal_('Km awal tidak boleh lebih kecil dari km terakhir mobil (' + Number(kmSebelumnya) + ').');
    }

    var linkFoto = pjlSimpanFoto_(d.foto, 'awal_' + teks_(d.idBooking));
    pjlTambahBaris_(p, {
      ID_PERJALANAN: pjlIdBaru_(p, 'PJL'), ID_BOOKING: bk[b.h.ID_BOOKING], ID_DRIVER: u.idDriver, ID_MOBIL: idMobil,
      WAKTU_MULAI: new Date(), KM_MOBIL_SEBELUMNYA: kmSebelumnya, KM_AWAL: km, FOTO_AWAL: linkFoto
    });
    pjlTulis_(b, i, 'STATUS', PJL.STATUS_JALAN);
    pjlUbahStatusDriver_(u, ['', 'siap tugas'], 'Bertugas');
    return { ok: true };
  } catch (err) {
    return pjlGagal_('Gagal menyimpan: ' + err.message);
  } finally {
    if (terkunci) { try { lock.releaseLock(); } catch (x) {} }
  }
}

// Driver menekan Selesai: foto odometer akhir + km akhir + catatan. Jarak dan durasi dihitung server.
function driverSelesai(sid, d) {
  var lock = LockService.getScriptLock();
  var terkunci = false;
  try {
    var u = pjlDriver_(sid); if (!u.ok) return u;
    d = d || {};
    var km = pjlAngka_(d.kmAkhir);
    if (km === null) return pjlGagal_('Km akhir harus berupa angka bulat.');
    if (!d.foto) return pjlGagal_('Foto odometer akhir wajib diunggah.');

    lock.waitLock(15000); terkunci = true;
    var b = pjlTabel_(PJL.SHEET_BOOKING, ['ID_BOOKING', 'STATUS']);
    var p = pjlTabel_(PJL.SHEET_PERJALANAN, ['ID_BOOKING', 'ID_DRIVER', 'WAKTU_MULAI', 'KM_AWAL', 'WAKTU_SELESAI', 'KM_AKHIR', 'FOTO_AKHIR', 'JARAK_KM', 'DURASI_MENIT', 'CATATAN_KENDALA']);

    var idx = -1;
    for (var k = 0; k < p.data.length; k++) {
      var r = p.data[k];
      if (huruf_(r[p.h.ID_BOOKING]) === huruf_(d.idBooking) && huruf_(r[p.h.ID_DRIVER]) === huruf_(u.idDriver) && teks_(r[p.h.WAKTU_SELESAI]) === '') { idx = k; break; }
    }
    if (idx === -1) return pjlGagal_('Tidak ada perjalanan berjalan untuk tugas ini.');
    var kmAwal = Number(p.data[idx][p.h.KM_AWAL]) || 0;
    if (km < kmAwal) return pjlGagal_('Km akhir tidak boleh lebih kecil dari km awal');

    var mulai = new Date(p.data[idx][p.h.WAKTU_MULAI]), selesai = new Date();
    var jarak = km - kmAwal, durasi = Math.max(0, Math.round((selesai - mulai) / 60000));
    var linkFoto = pjlSimpanFoto_(d.foto, 'akhir_' + teks_(d.idBooking));

    pjlTulisWaktu_(p, idx, 'WAKTU_SELESAI', selesai);
    pjlTulis_(p, idx, 'KM_AKHIR', km);
    pjlTulis_(p, idx, 'FOTO_AKHIR', linkFoto);
    pjlTulis_(p, idx, 'JARAK_KM', jarak);
    pjlTulis_(p, idx, 'DURASI_MENIT', durasi);
    pjlTulis_(p, idx, 'CATATAN_KENDALA', teks_(d.catatan).substring(0, 500));

    var i = pjlCari_(b, 'ID_BOOKING', d.idBooking);
    if (i !== -1) pjlTulis_(b, i, 'STATUS', PJL.STATUS_SELESAI);
    pjlPerbaruiKmMobil_(p.data[idx], p, km);
    pjlUbahStatusDriver_(u, ['bertugas'], 'Siap Tugas');

    return { ok: true, jarak: jarak, durasiMenit: durasi, mulai: pjlJam_(mulai), selesai: pjlJam_(selesai) };
  } catch (err) {
    return pjlGagal_('Gagal menyimpan: ' + err.message);
  } finally {
    if (terkunci) { try { lock.releaseLock(); } catch (x) {} }
  }
}

// Modal Total Perjalanan / Total Jarak: bulan 0 = semua bulan, tahun 0 = semua tahun (berdasarkan waktu selesai)
function driverRiwayatRingkas(sid, bulan, tahun) {
  try {
    var u = pjlDriver_(sid); if (!u.ok) return u;
    bulan = Number(bulan) || 0; tahun = Number(tahun) || 0;
    var p = pjlTabel_(PJL.SHEET_PERJALANAN, ['ID_BOOKING', 'ID_DRIVER', 'WAKTU_SELESAI', 'KM_AWAL', 'KM_AKHIR', 'JARAK_KM', 'DURASI_MENIT']);
    var b = pjlTabel_(PJL.SHEET_BOOKING, ['ID_BOOKING', 'TUJUAN']);
    var tujuan = {};
    b.data.forEach(function (r) { tujuan[huruf_(r[b.h.ID_BOOKING])] = teks_(r[b.h.TUJUAN]); });

    var hasil = [], jumlah = 0, jarak = 0, tahunAda = {};
    p.data.forEach(function (r) {
      if (huruf_(r[p.h.ID_DRIVER]) !== huruf_(u.idDriver) || teks_(r[p.h.WAKTU_SELESAI]) === '') return;
      var w = new Date(r[p.h.WAKTU_SELESAI]);
      if (isNaN(w.getTime())) return;
      var th = Number(Utilities.formatDate(w, 'Asia/Jakarta', 'yyyy')), bl = Number(Utilities.formatDate(w, 'Asia/Jakarta', 'M'));
      tahunAda[th] = true;
      if ((tahun && th !== tahun) || (bulan && bl !== bulan)) return;
      var j = Number(r[p.h.JARAK_KM]) || 0;
      jumlah++; jarak += j;
      hasil.push({ t: w.getTime(), tanggal: Utilities.formatDate(w, 'Asia/Jakarta', 'yyyy-MM-dd'), tujuan: tujuan[huruf_(r[p.h.ID_BOOKING])] || '',
                   jarak: j, durasiMenit: Number(r[p.h.DURASI_MENIT]) || 0, kmAwal: Number(r[p.h.KM_AWAL]) || 0, kmAkhir: Number(r[p.h.KM_AKHIR]) || 0 });
    });
    hasil.sort(function (a, c) { return c.t - a.t; });
    var daftar = hasil.slice(0, PJL.MAKS_DAFTAR).map(function (x) { delete x.t; return x; });
    var tahunUrut = Object.keys(tahunAda).map(Number).sort(function (a, c) { return c - a; });
    return { ok: true, jumlah: jumlah, jarak: jarak, daftar: daftar, tahun: tahunUrut };
  } catch (err) { return pjlGagal_(err.message); }
}

// ---------- Fungsi bantu (privat) ----------

function pjlGagal_(pesan, kode) { return { ok: false, pesan: pesan, kode: kode || '' }; }

// Sesi harus valid dan berperan Driver. idDriver dicari di sheet DRIVER lewat ID_PENGGUNA (bila tidak ada, dipakai ID pengguna).
function pjlDriver_(sid) {
  var s = getSesi(sid);
  if (!s) return pjlGagal_('Sesi berakhir. Silakan masuk lagi.', 'SESI');
  if (s.peran !== 'Driver') return pjlGagal_('Akses ditolak.', 'AKSES');
  var idDriver = s.id;
  try {
    var t = pjlTabel_(PJL.SHEET_DRIVER, ['ID_DRIVER', 'ID_PENGGUNA']);
    var i = pjlCari_(t, 'ID_PENGGUNA', s.id);
    if (i !== -1 && teks_(t.data[i][t.h.ID_DRIVER]) !== '') idDriver = teks_(t.data[i][t.h.ID_DRIVER]);
  } catch (e) { /* sheet DRIVER belum siap: pakai ID pengguna */ }
  return { ok: true, user: s, idDriver: idDriver };
}

// Izin menugaskan driver (Nonaktif / SIM) memakai aturan bersama di Driver.gs
function pjlIzin_(u) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var drv = DRV.baca(ss, PJL.SHEET_DRIVER).find(function (d) { return DRV.sama(d.ID_PENGGUNA, u.user.id); });
  return driverBisaDitugaskan_(drv, pjlHariIni_());
}

// Ubah kolom STATUS_DRIVER di sheet DRIVER hanya bila isinya sekarang salah satu nilai di "dari" (huruf kecil).
// Supaya status Nonaktif yang diisi admin tidak tertimpa. Gagal di sini tidak membatalkan perjalanan.
function pjlUbahStatusDriver_(u, dari, ke) {
  try {
    var t = pjlTabel_(PJL.SHEET_DRIVER, ['ID_PENGGUNA']);
    var kol = t.h.STATUS_DRIVER !== undefined ? 'STATUS_DRIVER' : (t.h.STATUS !== undefined ? 'STATUS' : '');
    if (!kol) return;
    var i = pjlCari_(t, 'ID_PENGGUNA', u.user.id);
    if (i === -1) return;
    if (dari.indexOf(huruf_(t.data[i][t.h[kol]])) !== -1) pjlTulis_(t, i, kol, ke);
  } catch (e) { Logger.log('Gagal mengubah STATUS driver: ' + e.message); }
}

// Baca sheet berdasarkan nama header. kolomWajib dicek ada, tetapi TIDAK ditambahkan otomatis.
function pjlTabel_(nama, kolomWajib) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(nama);
  if (!sheet) throw new Error('Sheet "' + nama + '" tidak ditemukan.');
  var lebar = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lebar).getValues()[0].map(function (x) { return String(x).trim().toUpperCase(); });
  var h = {};
  header.forEach(function (n, i) { if (n) h[n] = i; });
  (kolomWajib || []).forEach(function (n) {
    if (h[n] === undefined) throw new Error('Kolom ' + n + ' tidak ada di sheet ' + nama + '.');
  });
  var data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, lebar).getValues() : [];
  return { sheet: sheet, h: h, data: data, lebar: lebar };
}

function pjlCari_(t, kolom, nilai) {
  var n = huruf_(nilai);
  if (n === '') return -1;
  for (var i = 0; i < t.data.length; i++) if (huruf_(t.data[i][t.h[kolom]]) === n) return i;
  return -1;
}

function pjlTulis_(t, i, kolom, nilai) { t.sheet.getRange(i + 2, t.h[kolom] + 1).setValue(nilai); }

function pjlTambahBaris_(t, isi) {
  var row = new Array(t.lebar).fill('');
  Object.keys(isi).forEach(function (k) { if (t.h[k] !== undefined) row[t.h[k]] = isi[k]; });
  t.sheet.appendRow(row);
  var baru = t.sheet.getLastRow();
  PJL.KOLOM_WAKTU.forEach(function (k) {
    if (isi[k] !== undefined && t.h[k] !== undefined) t.sheet.getRange(baru, t.h[k] + 1).setNumberFormat(PJL.FORMAT_WAKTU);
  });
}

// Kolom waktu: format tampilan harus yyyy-mm-dd hh:mm:ss karena Driver.gs (Beranda) membacanya lewat getDisplayValues
function pjlTulisWaktu_(t, i, kolom, tanggal) {
  t.sheet.getRange(i + 2, t.h[kolom] + 1).setNumberFormat(PJL.FORMAT_WAKTU).setValue(tanggal);
}

function pjlIdBaru_(t, prefix) {
  var maks = 0;
  t.data.forEach(function (r) {
    var s = teks_(r[t.h.ID_PERJALANAN]);
    if (s.indexOf(prefix) === 0) { var n = parseInt(s.substring(prefix.length), 10); if (!isNaN(n) && n > maks) maks = n; }
  });
  return prefix + String(maks + 1).padStart(4, '0');
}

// Km akhir perjalanan menjadi KM_TERAKHIR mobil berikutnya
function pjlPerbaruiKmMobil_(barisPerjalanan, p, kmAkhir) {
  try {
    if (p.h.ID_MOBIL === undefined) return;
    var m = pjlTabel_(PJL.SHEET_MOBIL, ['ID_MOBIL', 'KM_TERAKHIR']);
    var j = pjlCari_(m, 'ID_MOBIL', barisPerjalanan[p.h.ID_MOBIL]);
    if (j !== -1) pjlTulis_(m, j, 'KM_TERAKHIR', kmAkhir);
  } catch (e) { Logger.log('Gagal memperbarui KM_TERAKHIR mobil: ' + e.message); }
}

function pjlAngka_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!/^\d{1,7}$/.test(s)) return null;
  return parseInt(s, 10);
}

function pjlHariIni_() { return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'); }
function pjlJam_(d) { return Utilities.formatDate(d, 'Asia/Jakarta', 'HH:mm'); }
function pjlTglIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
  return teks_(v).substring(0, 10);
}

// Foto disimpan di folder Drive milik pemilik script (tidak dibagikan). Sheet hanya menyimpan tautannya.
function pjlSimpanFoto_(dataUrl, nama) {
  var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Format foto tidak valid.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > PJL.MAKS_FOTO_BYTE) throw new Error('Ukuran foto terlalu besar.');
  var stempel = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd_HHmmss');
  var blob = Utilities.newBlob(bytes, m[1], String(nama).replace(/[^\w-]/g, '_') + '_' + stempel + '.jpg');
  var f = pjlFolderFoto_().createFile(blob);
  return 'https://drive.google.com/file/d/' + f.getId() + '/view';
}

function pjlFolderFoto_() {
  var it = DriveApp.getFoldersByName(PJL.FOLDER_FOTO);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PJL.FOLDER_FOTO);
}