// ==========================================
// PLN Drive - DriverProfilServer.gs (role Driver: halaman Profil & Pengaturan)
// Bergantung pada Kode.gs: bukaTabel_, cariBaris_, tulis_, teks_, hashPassword_, cekPassword_, aktif_
// Bergantung pada Driver.gs: DRV, driverSesi_, driverBisaDitugaskan_
// Fungsi publik: driverProfil(sid), driverUbahNoHp(sid, noHp), driverUbahPassword(sid, lama, baru)
// Identitas selalu dari sesi di server (sid). Driver hanya bisa mengubah No. HP dan password miliknya sendiri.
// Nama, username, email, jenis driver, status, dan SIM dikelola admin, jadi hanya ditampilkan.
// Nama file sengaja tidak sama dengan file HTML (Apps Script tidak mengizinkan nama dasar yang sama).
// ==========================================

var PRF = {
  PASSWORD_MIN: 8,
  GAGAL_MAKS: 5,            // salah password lama berturut-turut sebelum dikunci sementara
  GAGAL_DETIK: 15 * 60      // lama penguncian (CacheService)
};

function driverProfil(sid) {
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const t = bukaTabel_(), i = cariBaris_(t, 'ID_PENGGUNA', sesi.user.id);
    if (i === -1) return { ok: false, kode: 'DB', pesan: 'Akun tidak ditemukan.' };
    const r = t.data[i];

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hari = Utilities.formatDate(new Date(), DRV.ZONA, 'yyyy-MM-dd');
    const drv = DRV.baca(ss, 'DRIVER').find(d => DRV.sama(d.ID_PENGGUNA, sesi.user.id));
    let driver = null;
    if (drv) {
      const sim = DRV.tglBebas(drv.MASA_BERLAKU_SIM);
      driver = {
        idDriver: String(drv.ID_DRIVER), jenis: String(drv.JENIS_DRIVER || '').trim(), status: String(DRV.statusDrv(drv) || '').trim(),
        simBerlaku: sim, simSisaHari: sim ? DRV.selisihHari(hari, sim) : null
      };
    }
    return {
      ok: true, hari: hari,
      profil: { id: teks_(r[t.h.ID_PENGGUNA]), nama: teks_(r[t.h.NAMA]), username: teks_(r[t.h.USERNAME]), email: teks_(r[t.h.EMAIL]), noHp: noHpRapi_(r[t.h.NO_HP]) },
      driver: driver, penugasan: driverBisaDitugaskan_(drv, hari)
    };
  } catch (e) {
    return { ok: false, kode: 'DB', pesan: 'Gagal membaca database: ' + e.message };
  }
}

function driverUbahNoHp(sid, noHp) {
  const lock = LockService.getScriptLock();
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    const baru = String(noHp == null ? '' : noHp).trim().replace(/[\s-]/g, '').replace(/^\+?62/, '0');   // sama dengan aturan di pendaftaran
    if (!/^0\d{8,13}$/.test(baru)) return { ok: false, pesan: 'No. HP tidak valid. Contoh: 081234567890' };

    lock.waitLock(15000);
    const t = bukaTabel_(), i = cariBaris_(t, 'ID_PENGGUNA', sesi.user.id);
    if (i === -1) return { ok: false, pesan: 'Akun tidak ditemukan.' };
    t.sheet.getRange(i + 2, t.h.NO_HP + 1).setNumberFormat('@').setValue(baru);   // teks, supaya angka 0 di depan tidak hilang
    return { ok: true, noHp: baru };
  } catch (e) {
    return { ok: false, pesan: 'Gagal menyimpan: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function driverUbahPassword(sid, lama, baru) {
  const lock = LockService.getScriptLock();
  try {
    const sesi = driverSesi_(sid);
    if (sesi.galat) return sesi.galat;
    lama = String(lama == null ? '' : lama); baru = String(baru == null ? '' : baru);
    if (!lama) return { ok: false, pesan: 'Password saat ini wajib diisi.' };
    if (baru.length < PRF.PASSWORD_MIN) return { ok: false, pesan: 'Password baru minimal ' + PRF.PASSWORD_MIN + ' karakter.' };
    if (baru === lama) return { ok: false, pesan: 'Password baru harus berbeda dari password saat ini.' };

    // Batasi tebakan password lama (melindungi bila sesi dipakai orang lain)
    const cache = CacheService.getScriptCache(), kunci = 'pwgagal_' + sesi.user.id;
    const gagal = Number(cache.get(kunci)) || 0;
    if (gagal >= PRF.GAGAL_MAKS) return { ok: false, pesan: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' };

    lock.waitLock(15000);
    const t = bukaTabel_(), i = cariBaris_(t, 'ID_PENGGUNA', sesi.user.id);
    if (i === -1) return { ok: false, pesan: 'Akun tidak ditemukan.' };
    if (!cekPassword_(lama, t.data[i][t.h.PASSWORD])) {
      cache.put(kunci, String(gagal + 1), PRF.GAGAL_DETIK);
      return { ok: false, pesan: 'Password saat ini salah.' };
    }
    tulis_(t, i, 'PASSWORD', hashPassword_(baru));
    cache.remove(kunci);
    return { ok: true };
  } catch (e) {
    return { ok: false, pesan: 'Gagal menyimpan: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// Nomor HP yang tersimpan sebagai angka kehilangan 0 di depan (812... menjadi 0812...)
function noHpRapi_(v) {
  const s = String(v == null ? '' : v).replace(/\D/g, '');
  return s && s[0] === '8' ? '0' + s : s;
}