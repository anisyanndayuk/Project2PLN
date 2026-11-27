// ==========================================
// BookTrip PLN - Pemohon.gs (Dashboard Pemohon: Beranda, Rating, Profil)
// Memakai fungsi bantu dari Kode.gs: bukaSheet_, bukaTabel_, getSesi, teks_, cariBaris_,
// tulis_, hashPassword_, cekPassword_, DAFTAR_BAGIAN, SESI_DETIK.
// ==========================================
// Header sheet lain (sesuai DB_PINJAM_MOBIL). Kolom yang belum ada ditambahkan otomatis di kanan.
const KOLOM_BOOKING = ['ID_BOOKING', 'WAKTU_PENGAJUAN', 'ID_PEMOHON', 'BAGIAN', 'WAKTU_BERANGKAT', 'WAKTU_TIBA_ESTIMASI',
  'TUJUAN', 'KEPERLUAN', 'JUMLAH_PENUMPANG', 'STATUS', 'ID_MOBIL', 'ID_DRIVER', 'ID_ADMIN', 'WAKTU_KEPUTUSAN', 'ALASAN_TOLAK'];
const KOLOM_MOBIL = ['ID_MOBIL', 'PLAT', 'JENIS', 'KAPASITAS', 'ASAL', 'ID_DRIVER_TETAP', 'STATUS', 'KETERANGAN', 'KM_TERAKHIR'];
const KOLOM_DRIVER = ['ID_DRIVER', 'ID_PENGGUNA', 'STATUS_DRIVER', 'JENIS_SIM', 'MASA_BERLAKU_SIM', 'PENGALAMAN_TAHUN',
  'RUTE_DIKUASAI', 'SERTIFIKASI', 'AKTIF'];
const KOLOM_RATING = ['ID_RATING', 'ID_BOOKING', 'ID_DRIVER', 'ID_PEMOHON', 'TANGGAL', 'NILAI', 'KOMENTAR'];
const TZ = 'Asia/Jakarta';
const STATUS_AKTIF = ['Diajukan', 'Disetujui', 'Berjalan'];


// ==========================================
// DASHBOARD PEMOHON
// ==========================================
// (Daftar halaman & pemuat halaman ada di Kode.gs: HALAMAN dan loadPageContent)

function sesiPemohon_(sid) {
  var u = getSesi(sid);
  return u && u.peran === 'Pemohon' ? u : null;
}

// Memecah nilai tanggal-waktu (Date dari Sheets, atau teks) menjadi tanggal 'yyyy-MM-dd' dan jam 'HH:mm'
function waktuBagian_(v) {
  if (v instanceof Date) {
    return { tgl: Utilities.formatDate(v, TZ, 'yyyy-MM-dd'), jam: Utilities.formatDate(v, TZ, 'HH:mm') };
  }
  var s = teks_(v), m, dua = function (x) { return ('0' + x).slice(-2); };
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s))) {
    return { tgl: m[1] + '-' + m[2] + '-' + m[3], jam: m[4] ? dua(m[4]) + ':' + m[5] : '' };
  }
  if ((m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ ,]+(\d{1,2})[.:](\d{2}))?/.exec(s))) {   // dd/MM/yyyy
    return { tgl: m[3] + '-' + dua(m[2]) + '-' + dua(m[1]), jam: m[4] ? dua(m[4]) + ':' + m[5] : '' };
  }
  return { tgl: '', jam: '' };
}

function ringkasBooking_(r, bk, mobil, driver) {
  var m = mobil[teks_(r[bk.h.ID_MOBIL])], d = driver[teks_(r[bk.h.ID_DRIVER])];
  var brk = waktuBagian_(r[bk.h.WAKTU_BERANGKAT]), tiba = waktuBagian_(r[bk.h.WAKTU_TIBA_ESTIMASI]);
  return {
    id: teks_(r[bk.h.ID_BOOKING]),
    tanggal: brk.tgl,
    jamBerangkat: brk.jam,
    jamTiba: tiba.jam,
    tujuan: teks_(r[bk.h.TUJUAN]),
    keperluan: teks_(r[bk.h.KEPERLUAN]),
    status: teks_(r[bk.h.STATUS]) || 'Diajukan',
    idDriver: teks_(r[bk.h.ID_DRIVER]),
    mobil: m || null,
    driver: d || null
  };
}

// Data Beranda: ringkasan, semua booking milik pemohon, perjalanan mendatang, perlu dinilai
function getBerandaPemohon(sid) {
  try {
    var u = sesiPemohon_(sid);
    if (!u) return { status: 'error', message: 'Sesi berakhir. Silakan masuk lagi.' };
    var bk = bukaSheet_('BOOKING', KOLOM_BOOKING);
    var mb = bukaSheet_('MOBIL', KOLOM_MOBIL);
    var dr = bukaSheet_('DRIVER', KOLOM_DRIVER);
    var rt = bukaSheet_('RATING', KOLOM_RATING);
    var pg = bukaTabel_();

    var mobil = {};
    mb.data.forEach(function (r) {
      mobil[teks_(r[mb.h.ID_MOBIL])] = { nama: teks_(r[mb.h.JENIS]), plat: teks_(r[mb.h.PLAT]), ket: teks_(r[mb.h.KETERANGAN]) };
    });

    // ID_DRIVER di BOOKING -> sheet DRIVER -> ID_PENGGUNA -> nama & no HP di PENGGUNA
    var pengguna = {};
    pg.data.forEach(function (r) {
      pengguna[teks_(r[pg.h.ID_PENGGUNA])] = { nama: teks_(r[pg.h.NAMA]), noHp: teks_(r[pg.h.NO_HP]), peran: teks_(r[pg.h.PERAN]) };
    });
    var driver = {};
    dr.data.forEach(function (r) {
      var p = pengguna[teks_(r[dr.h.ID_PENGGUNA])];
      if (p) driver[teks_(r[dr.h.ID_DRIVER])] = { nama: p.nama, noHp: p.noHp };
    });
    Object.keys(pengguna).forEach(function (id) {   // cadangan: ID_DRIVER berisi langsung ID akun driver
      if (pengguna[id].peran === 'Driver' && !driver[id]) driver[id] = { nama: pengguna[id].nama, noHp: pengguna[id].noHp };
    });

    var sudahDinilai = {};
    rt.data.forEach(function (r) {
      if (teks_(r[rt.h.ID_PEMOHON]) === u.id) sudahDinilai[teks_(r[rt.h.ID_BOOKING])] = true;
    });

    var milikku = [];
    bk.data.forEach(function (r, i) {
      if (teks_(r[bk.h.ID_PEMOHON]) !== u.id) return;
      var b = ringkasBooking_(r, bk, mobil, driver);
      b._urut = b.tanggal + ' ' + b.jamBerangkat + ' ' + ('00000' + i).slice(-5);
      milikku.push(b);
    });
    milikku.sort(function (a, b) { return a._urut < b._urut ? 1 : -1; });

    var hariIni = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    var terdekat = function (daftar) { return daftar.sort(function (a, b) { return a._urut > b._urut ? 1 : -1; })[0]; };
    var mendatang = terdekat(milikku.filter(function (b) { return b.status === 'Berjalan'; })) ||
      terdekat(milikku.filter(function (b) { return b.status === 'Disetujui' && b.tanggal >= hariIni; })) || null;
    var perluDinilai = milikku.filter(function (b) { return b.status === 'Selesai' && !sudahDinilai[b.id]; });

    return {
      status: 'success',
      hariIni: hariIni,
      ringkasan: {
        aktif: milikku.filter(function (b) { return b.status === 'Berjalan'; }).length,
        menunggu: milikku.filter(function (b) { return b.status === 'Diajukan'; }).length,
        perluDinilai: perluDinilai.length
      },
      booking: milikku.slice(0, 200),
      mendatang: mendatang,
      perluDinilai: perluDinilai.slice(0, 10)
    };
  } catch (err) {
    return { status: 'error', message: 'Gagal memuat data: ' + err.message };
  }
}

// Kirim ulasan untuk perjalanan yang sudah selesai (disimpan ke sheet RATING)
function kirimRating(sid, idBooking, bintang, komentar) {
  var lock = LockService.getScriptLock();
  try {
    var u = sesiPemohon_(sid);
    if (!u) return { status: 'error', message: 'Sesi berakhir. Silakan masuk lagi.' };
    bintang = Number(bintang);
    if (!(bintang >= 1 && bintang <= 5) || bintang % 1 !== 0) return { status: 'error', message: 'Pilih 1 sampai 5 bintang.' };
    lock.waitLock(15000);
    var bk = bukaSheet_('BOOKING', KOLOM_BOOKING);
    var rt = bukaSheet_('RATING', KOLOM_RATING);
    var i = cariBaris_(bk, 'ID_BOOKING', idBooking);
    if (i === -1 || teks_(bk.data[i][bk.h.ID_PEMOHON]) !== u.id) return { status: 'error', message: 'Booking tidak ditemukan.' };
    if (teks_(bk.data[i][bk.h.STATUS]) !== 'Selesai') return { status: 'error', message: 'Hanya perjalanan yang sudah selesai yang bisa dinilai.' };
    if (rt.data.some(function (r) { return teks_(r[rt.h.ID_BOOKING]) === teks_(idBooking); })) {
      return { status: 'error', message: 'Perjalanan ini sudah dinilai.' };
    }
    var maks = 0;
    rt.data.forEach(function (r) {
      var n = parseInt(teks_(r[rt.h.ID_RATING]).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > maks) maks = n;
    });
    var row = new Array(rt.lebar).fill('');
    row[rt.h.ID_RATING] = 'RTG' + ('000' + (maks + 1)).slice(-3);
    row[rt.h.ID_BOOKING] = teks_(idBooking);
    row[rt.h.ID_DRIVER] = teks_(bk.data[i][bk.h.ID_DRIVER]);
    row[rt.h.ID_PEMOHON] = u.id;
    row[rt.h.TANGGAL] = new Date();
    row[rt.h.NILAI] = bintang;
    row[rt.h.KOMENTAR] = teks_(komentar).slice(0, 500);
    rt.sheet.appendRow(row);
    return { status: 'success', message: 'Terima kasih, penilaian terkirim.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal mengirim penilaian: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ==========================================
// PROFIL (popover di header)
// ==========================================
function simpanProfil(sid, nama, email, bagian) {
  try {
    var u = sesiPemohon_(sid);
    if (!u) return { status: 'error', message: 'Sesi berakhir. Silakan masuk lagi.' };
    nama = teks_(nama); email = teks_(email); bagian = teks_(bagian);
    if (!nama) return { status: 'error', message: 'Nama lengkap wajib diisi.' };
    if (/\d/.test(nama)) return { status: 'error', message: 'Nama lengkap tidak boleh mengandung angka.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'error', message: 'Format email tidak valid.' };
    if (DAFTAR_BAGIAN.indexOf(bagian) === -1) return { status: 'error', message: 'Pilih bagian / unit kerja.' };
    var t = bukaTabel_();
    var i = cariBaris_(t, 'ID_PENGGUNA', u.id);
    if (i === -1) return { status: 'error', message: 'Akun tidak ditemukan.' };
    var j = cariBaris_(t, 'EMAIL', email);
    if (j !== -1 && j !== i) return { status: 'error', message: 'Email sudah dipakai akun lain.' };
    tulis_(t, i, 'NAMA', nama);
    tulis_(t, i, 'EMAIL', email);
    tulis_(t, i, 'BAGIAN', bagian);
    u.nama = nama; u.email = email; u.bagian = bagian;
    CacheService.getScriptCache().put('sesi_' + sid, JSON.stringify(u), SESI_DETIK);
    return { status: 'success', message: 'Profil diperbarui.', user: u };
  } catch (err) {
    return { status: 'error', message: 'Gagal menyimpan: ' + err.message };
  }
}

function ubahPassword(sid, lama, baru) {
  try {
    var u = sesiPemohon_(sid);
    if (!u) return { status: 'error', message: 'Sesi berakhir. Silakan masuk lagi.' };
    if (!baru || String(baru).length < 8) return { status: 'error', message: 'Password baru minimal 8 karakter.' };
    var t = bukaTabel_();
    var i = cariBaris_(t, 'ID_PENGGUNA', u.id);
    if (i === -1) return { status: 'error', message: 'Akun tidak ditemukan.' };
    if (!cekPassword_(String(lama), t.data[i][t.h.PASSWORD])) return { status: 'error', message: 'Password lama salah.' };
    tulis_(t, i, 'PASSWORD', hashPassword_(String(baru)));
    return { status: 'success', message: 'Password berhasil diubah.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal mengubah password: ' + err.message };
  }
}