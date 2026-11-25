// ==========================================
// PLNDinas - Kode.gs (Landing, Login, Register, Verifikasi, Reset Password)
// ==========================================
const SPREADSHEET_ID = '1msXBs4CB047sayFPQfgWzXATOCQNR5EAiScQoQmWe-M';
const SHEET_PENGGUNA = 'PENGGUNA';
const APP_NAME = 'BookTrip PLN';

// Daftar bagian di dropdown Register. Ubah sesuai kebutuhan.
var DAFTAR_BAGIAN = [
  'Jaringan', 'Konstruksi', 'Perencanaan', 'Transaksi Energi',
  'Keuangan dan Umum', 'Niaga dan Pemasaran'
];

const PREFIX_ID = { 'Pemohon': 'USR', 'Admin': 'ADM', 'Driver': 'DRV' };
const HALAMAN_DASHBOARD = { 'Pemohon': 'dashboardPemohon', 'Admin': 'dashboardAdmin', 'Driver': 'dashboardDriver' };
const STATUS_TERVERIFIKASI = 'Terverifikasi';
const STATUS_BELUM_VERIFIKASI = 'Belum Verifikasi';
const RESET_DURASI_MS = 60 * 60 * 1000;   // link reset berlaku 1 jam
const SESI_DETIK = 6 * 60 * 60;           // sesi login 6 jam (batas maksimum CacheService)

// Kolom yang dibutuhkan. Yang belum ada di sheet PENGGUNA akan ditambahkan otomatis di kanan.
// Urutan kolom di sheet bebas, kode membaca berdasarkan NAMA header.
const KOLOM_WAJIB = [
  'ID_PENGGUNA', 'NAMA', 'USERNAME', 'EMAIL', 'PASSWORD', 'BAGIAN', 'PERAN', 'NO_HP', 'AKTIF',
  'TOKEN_VERIFIKASI', 'STATUS_VERIFIKASI', 'RESET_TOKEN', 'RESET_EXPIRY'
];

// ==========================================
// ROUTING
// ==========================================
function doGet(e) {
  var p = (e && e.parameter) || {};
  var page = p.page || 'index';
  var baseUrl = ScriptApp.getService().getUrl();
  var token = String(p.token || '').replace(/[^A-Za-z0-9-]/g, '');
  var file = 'Auth', view = 'view-login', status = '', pesan = '', resetToken = '';

  switch (page) {
    case 'index': file = 'Index'; break;
    case 'register': view = 'view-register'; break;
    case 'forgotPassword': view = 'view-forgot-password'; break;
    case 'resetPassword': view = 'view-reset-password'; resetToken = token; break;
    case 'verifyEmail':
      view = 'view-verify-result';
      var r = verifikasiTokenEmail(token);
      status = r.status; pesan = r.message;
      break;
    case 'dashboardPemohon':
    case 'dashboardAdmin':
    case 'dashboardDriver':
      return halamanDashboard_(page, baseUrl, p.sid);
    default: break; // 'login' dan halaman tak dikenal -> Auth, tampilan login
  }

  var t = HtmlService.createTemplateFromFile(file);
  t.baseUrl = baseUrl;
  t.initialView = view;
  t.verifStatus = status;
  t.verifPesan = pesan;
  t.resetToken = resetToken;
  t.daftarBagian = DAFTAR_BAGIAN;
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Dashboard dilindungi sesi. Tanpa sesi valid -> diminta masuk lagi.
function halamanDashboard_(page, baseUrl, sid) {
  var user = getSesi(sid);
  if (!user) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:40px;text-align:center">Sesi berakhir. ' +
      '<a target="_top" href="' + baseUrl + '?page=login">Masuk lagi</a></p>');
  }
  var namaFile = page.charAt(0).toUpperCase() + page.slice(1); // dashboardAdmin -> DashboardAdmin
  try {
    var t = HtmlService.createTemplateFromFile(namaFile);
    t.baseUrl = baseUrl; t.sid = sid; t.user = user;
    return t.evaluate().setTitle(APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:40px;text-align:center">Halo ' + escapeHtml_(user.nama) +
      ' (' + escapeHtml_(user.peran) + '). File ' + namaFile + '.html belum dibuat.</p>');
  }
}

// ==========================================
// AKSES SHEET (berdasarkan nama header)
// ==========================================
function bukaTabel_() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PENGGUNA);
  if (!sheet) throw new Error('Sheet "' + SHEET_PENGGUNA + '" tidak ditemukan.');
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim().toUpperCase(); });
  KOLOM_WAJIB.forEach(function (n) {
    if (header.indexOf(n) === -1) {
      sheet.getRange(1, header.length + 1).setValue(n);
      header.push(n);
    }
  });
  var h = {};
  header.forEach(function (n, i) { if (n) h[n] = i; });
  var data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues() : [];
  return { sheet: sheet, h: h, data: data, lebar: header.length };
}

function tulis_(t, i, kolom, nilai) {
  t.sheet.getRange(i + 2, t.h[kolom] + 1).setValue(nilai);
}

function teks_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function huruf_(v) { return teks_(v).toLowerCase(); }

function aktif_(v) {
  return !(v === false || /^(tidak|false|no|0|nonaktif)$/i.test(teks_(v)));
}

// Akun buatan admin langsung di sheet (tanpa token & status) dianggap sudah terverifikasi.
function terverifikasi_(t, row) {
  var st = teks_(row[t.h.STATUS_VERIFIKASI]);
  if (st === STATUS_TERVERIFIKASI) return true;
  return st === '' && teks_(row[t.h.TOKEN_VERIFIKASI]) === '';
}

function cariBaris_(t, kolom, nilai) {
  var n = huruf_(nilai);
  for (var i = 0; i < t.data.length; i++) {
    if (huruf_(t.data[i][t.h[kolom]]) === n) return i;
  }
  return -1;
}

// ==========================================
// PASSWORD (SHA-256 + salt, disimpan "salt$hash")
// ==========================================
function hashPassword_(pw, salt) {
  salt = salt || Utilities.getUuid();
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8);
  return salt + '$' + Utilities.base64Encode(raw);
}

function cekPassword_(input, tersimpan) {
  tersimpan = String(tersimpan);
  var p = tersimpan.indexOf('$');
  if (p === -1) return input === tersimpan; // akun lama/manual yang masih teks biasa
  return hashPassword_(input, tersimpan.substring(0, p)) === tersimpan;
}

// ==========================================
// SESI
// ==========================================
function buatSesi_(user) {
  var sid = Utilities.getUuid();
  CacheService.getScriptCache().put('sesi_' + sid, JSON.stringify(user), SESI_DETIK);
  return sid;
}

function getSesi(sid) {
  if (!sid) return null;
  var v = CacheService.getScriptCache().get('sesi_' + String(sid));
  return v ? JSON.parse(v) : null;
}

function logoutUser(sid) {
  if (sid) CacheService.getScriptCache().remove('sesi_' + String(sid));
  return { status: 'success' };
}

// ==========================================
// LOGIN (Email ATAU Username)
// ==========================================
function prosesLogin(identifier, password) {
  try {
    if (!identifier || !password) return { status: 'error', message: 'Email/Username dan password wajib diisi.' };
    var t = bukaTabel_();
    var id = huruf_(identifier);

    for (var i = 0; i < t.data.length; i++) {
      var r = t.data[i];
      if (id !== huruf_(r[t.h.EMAIL]) && id !== huruf_(r[t.h.USERNAME])) continue;
      if (!cekPassword_(String(password), r[t.h.PASSWORD])) break;

      if (!aktif_(r[t.h.AKTIF])) return { status: 'error', message: 'Akun ini dinonaktifkan. Hubungi admin.' };
      if (!terverifikasi_(t, r)) {
        return { status: 'error', belumVerifikasi: true, emailUser: r[t.h.EMAIL],
                 message: 'Email Anda belum diverifikasi. Cek kotak masuk atau spam.' };
      }
      var peran = teks_(r[t.h.PERAN]) || 'Pemohon';
      var user = { id: r[t.h.ID_PENGGUNA], nama: r[t.h.NAMA], email: r[t.h.EMAIL], bagian: r[t.h.BAGIAN], peran: peran };
      return { status: 'success', message: 'Selamat datang, ' + user.nama,
               targetPage: HALAMAN_DASHBOARD[peran] || 'dashboardPemohon', sid: buatSesi_(user) };
    }
    return { status: 'error', message: 'Email/Username atau password salah.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal terhubung ke database: ' + err.message };
  }
}

// ==========================================
// REGISTER (peran: Pemohon atau Driver; Admin dibuat manual di sheet)
// ==========================================
function buatId_(t, peran) {
  var prefix = PREFIX_ID[peran] || 'USR', maks = 0;
  t.data.forEach(function (r) {
    var s = teks_(r[t.h.ID_PENGGUNA]);
    if (s.indexOf(prefix) === 0) {
      var n = parseInt(s.substring(prefix.length), 10);
      if (!isNaN(n) && n > maks) maks = n;
    }
  });
  return prefix + String(maks + 1).padStart(3, '0');
}

function prosesRegister(nama, username, email, password, peran, bagian, noHp) {
  var lock = LockService.getScriptLock();
  try {
    nama = teks_(nama); username = teks_(username); email = teks_(email);
    peran = teks_(peran); bagian = teks_(bagian);
    noHp = teks_(noHp).replace(/[\s-]/g, '').replace(/^\+?62/, '0'); // 62812... / +62812... -> 0812...
    if (peran !== 'Pemohon' && peran !== 'Driver') return { status: 'error', message: 'Pilih peran Pemohon atau Driver.' };
    if (peran === 'Driver') bagian = ''; // Driver tidak memiliki bagian/unit kerja
    if (!nama || !username || !email || !password || !noHp || (peran === 'Pemohon' && !bagian)) return { status: 'error', message: 'Semua kolom wajib diisi.' };
    if (/\d/.test(nama)) return { status: 'error', message: 'Nama lengkap tidak boleh mengandung angka.' };
    if (!/^\S{3,30}$/.test(username)) return { status: 'error', message: 'Username minimal 3 karakter dan tanpa spasi.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'error', message: 'Format email tidak valid.' };
    if (!/^0\d{8,13}$/.test(noHp)) return { status: 'error', message: 'No. HP tidak valid. Contoh: 081234567890' };
    if (String(password).length < 8) return { status: 'error', message: 'Password minimal 8 karakter.' };
    if (peran === 'Pemohon' && DAFTAR_BAGIAN.indexOf(bagian) === -1) return { status: 'error', message: 'Bagian tidak valid.' };

    lock.waitLock(15000);
    var t = bukaTabel_();
    if (cariBaris_(t, 'EMAIL', email) !== -1) return { status: 'error', message: 'Email tersebut sudah terdaftar.' };
    if (cariBaris_(t, 'USERNAME', username) !== -1) return { status: 'error', message: 'Username tersebut sudah digunakan.' };

    var token = Utilities.getUuid();
    var row = new Array(t.lebar).fill('');
    row[t.h.ID_PENGGUNA] = buatId_(t, peran);
    row[t.h.NAMA] = nama;
    row[t.h.USERNAME] = username;
    row[t.h.EMAIL] = email;
    row[t.h.PASSWORD] = hashPassword_(String(password));
    row[t.h.BAGIAN] = bagian;
    row[t.h.PERAN] = peran;
    row[t.h.AKTIF] = 'YA';
    row[t.h.TOKEN_VERIFIKASI] = token;
    row[t.h.STATUS_VERIFIKASI] = STATUS_BELUM_VERIFIKASI;
    t.sheet.appendRow(row);
    // Simpan No. HP sebagai teks supaya angka 0 di depan tidak hilang
    t.sheet.getRange(t.sheet.getLastRow(), t.h.NO_HP + 1).setNumberFormat('@').setValue(noHp);

    try { kirimEmailVerifikasi_(nama, email, token); }
    catch (m) { Logger.log('Gagal kirim email verifikasi: ' + m.message); }

    return { status: 'success', message: 'Pendaftaran berhasil.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal menyimpan data: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Validasi real-time di form Register
function cekKetersediaanAkun(tipe, nilai) {
  try {
    var t = bukaTabel_();
    if (tipe === 'email' && cariBaris_(t, 'EMAIL', nilai) !== -1) {
      return { tersedia: false, pesan: "Email ini sudah terdaftar. Mau <a href='#' onclick='pindahHalaman(\"view-login\");return false;'>masuk</a>?" };
    }
    if (tipe === 'username' && cariBaris_(t, 'USERNAME', nilai) !== -1) {
      return { tersedia: false, pesan: 'Username sudah digunakan. Coba yang lain.' };
    }
    return { tersedia: true };
  } catch (err) {
    return { tersedia: true }; // dicek ulang saat submit
  }
}

// ==========================================
// VERIFIKASI EMAIL
// ==========================================
function kirimEmailVerifikasi_(nama, email, token) {
  var link = ScriptApp.getService().getUrl() + '?page=verifyEmail&token=' + token;
  kirimEmail_(email, 'Verifikasi akun ' + APP_NAME, nama,
    'Terima kasih sudah mendaftar di ' + APP_NAME + '. Klik tombol di bawah untuk memverifikasi email Anda.',
    'Verifikasi email', link,
    'Jika Anda tidak merasa mendaftar, abaikan email ini.');
}

function verifikasiTokenEmail(token) {
  try {
    if (!token) return { status: 'error', message: 'Token verifikasi tidak ditemukan pada link ini.' };
    var t = bukaTabel_();
    var i = cariBaris_(t, 'TOKEN_VERIFIKASI', token);
    if (i === -1) return { status: 'error', message: 'Link verifikasi tidak valid, sudah dipakai, atau kedaluwarsa.' };
    tulis_(t, i, 'STATUS_VERIFIKASI', STATUS_TERVERIFIKASI);
    tulis_(t, i, 'TOKEN_VERIFIKASI', '');
    return { status: 'success', message: 'Email berhasil diverifikasi. Sekarang Anda bisa masuk.' };
  } catch (err) {
    return { status: 'error', message: 'Terjadi kesalahan saat verifikasi: ' + err.message };
  }
}

function kirimUlangEmailVerifikasi(email) {
  try {
    var cache = CacheService.getScriptCache();
    var kunci = 'resend_' + huruf_(email);
    if (cache.get(kunci)) return { status: 'error', message: 'Tunggu sebentar sebelum meminta email lagi.' };

    var t = bukaTabel_();
    var i = cariBaris_(t, 'EMAIL', email);
    if (i === -1) return { status: 'error', message: 'Email tidak ditemukan.' };
    if (terverifikasi_(t, t.data[i])) return { status: 'error', message: 'Email ini sudah terverifikasi. Silakan masuk.' };

    var token = Utilities.getUuid();
    tulis_(t, i, 'TOKEN_VERIFIKASI', token);
    tulis_(t, i, 'STATUS_VERIFIKASI', STATUS_BELUM_VERIFIKASI);
    kirimEmailVerifikasi_(t.data[i][t.h.NAMA], t.data[i][t.h.EMAIL], token);
    cache.put(kunci, '1', 55);
    return { status: 'success', message: 'Email verifikasi dikirim ulang ke ' + email + '.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal mengirim email: ' + err.message };
  }
}

// ==========================================
// LUPA & RESET PASSWORD
// ==========================================
function prosesLupaPassword(email) {
  var pesanUmum = 'Jika email terdaftar, link reset password sudah dikirim. Cek kotak masuk atau spam.';
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teks_(email))) return { status: 'error', message: 'Format email tidak valid.' };
    var t = bukaTabel_();
    var i = cariBaris_(t, 'EMAIL', email);
    if (i !== -1 && aktif_(t.data[i][t.h.AKTIF])) {
      var token = Utilities.getUuid();
      tulis_(t, i, 'RESET_TOKEN', token);
      tulis_(t, i, 'RESET_EXPIRY', Date.now() + RESET_DURASI_MS);
      var link = ScriptApp.getService().getUrl() + '?page=resetPassword&token=' + token;
      kirimEmail_(t.data[i][t.h.EMAIL], 'Reset password ' + APP_NAME, t.data[i][t.h.NAMA],
        'Kami menerima permintaan reset password. Link berlaku 1 jam.',
        'Buat password baru', link, 'Jika bukan Anda yang meminta, abaikan email ini.');
    }
    return { status: 'success', message: pesanUmum };
  } catch (err) {
    return { status: 'error', message: 'Gagal memproses permintaan: ' + err.message };
  }
}

function cariTokenReset_(t, token) {
  if (!token) return -1;
  var i = cariBaris_(t, 'RESET_TOKEN', token);
  if (i === -1) return -1;
  return Number(t.data[i][t.h.RESET_EXPIRY]) > Date.now() ? i : -1;
}

function validasiTokenReset(token) {
  try {
    var ok = cariTokenReset_(bukaTabel_(), token) !== -1;
    return ok ? { status: 'success' } : { status: 'error', message: 'Link reset tidak valid atau sudah kedaluwarsa. Minta link baru.' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function prosesResetPassword(token, passwordBaru) {
  try {
    if (!passwordBaru || String(passwordBaru).length < 8) return { status: 'error', message: 'Password minimal 8 karakter.' };
    var t = bukaTabel_();
    var i = cariTokenReset_(t, token);
    if (i === -1) return { status: 'error', message: 'Link reset tidak valid atau sudah kedaluwarsa.' };
    tulis_(t, i, 'PASSWORD', hashPassword_(String(passwordBaru)));
    tulis_(t, i, 'RESET_TOKEN', '');
    tulis_(t, i, 'RESET_EXPIRY', '');
    return { status: 'success', message: 'Password berhasil diubah. Silakan masuk.' };
  } catch (err) {
    return { status: 'error', message: 'Gagal menyimpan password: ' + err.message };
  }
}

// ==========================================
// EMAIL
// ==========================================
function escapeHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function kirimEmail_(to, subjek, nama, isi, teksTombol, link, catatan) {
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">' +
    '<div style="background:#F7E52A;padding:18px 24px;font-weight:700;font-size:18px;color:#111827">' + APP_NAME + '</div>' +
    '<div style="padding:24px;color:#111827;font-size:14px;line-height:1.6">' +
    '<p>Halo ' + escapeHtml_(nama) + ',</p><p>' + escapeHtml_(isi) + '</p>' +
    '<p style="margin:24px 0"><a href="' + link + '" style="background:#F7E52A;color:#111827;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">' + escapeHtml_(teksTombol) + '</a></p>' +
    '<p style="font-size:12px;color:#6B7280">Atau salin link ini:<br>' + link + '</p>' +
    '<p style="font-size:12px;color:#6B7280">' + escapeHtml_(catatan) + '</p></div>' +
    '<div style="background:#F7F9FD;padding:12px 24px;font-size:11px;color:#6B7280">PT PLN (Persero) UP3 Malang</div></div>';
  MailApp.sendEmail({
    to: to, subject: subjek, name: APP_NAME, htmlBody: html,
    body: 'Halo ' + nama + ',\n\n' + isi + '\n\n' + teksTombol + ': ' + link + '\n\n' + catatan
  });
}