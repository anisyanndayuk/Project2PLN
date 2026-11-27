// ==========================================
// BOOKTRIP PLN - Admin
// ==========================================

function includeAdmin_(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

const ADM = {
  ZONA: 'Asia/Jakarta',
  S_BOOKING: 'BOOKING', S_MOBIL: 'MOBIL', S_DRIVER: 'DRIVER',
  S_PERJALANAN: 'PERJALANAN', S_PENGGUNA: 'PENGGUNA',
  STATUS_SETUJU: 'Disetujui',      // nilai yang DITULIS ke kolom STATUS (samakan dengan fitur driver)
  STATUS_TOLAK: 'Ditolak',
  MOBIL_TERSEDIA: 'tersedia',      // nilai MOBIL.STATUS yang dianggap siap (tidak peka huruf besar/kecil)
  MENDESAK_JAM: 24,                // pengajuan Ditunggu yang berangkat <= 24 jam lagi = mendesak
  DURASI_DEFAULT_JAM: 4,           // dipakai bila WAKTU_TIBA_ESTIMASI kosong / tidak terbaca
  BUFFER_TERLAMBAT_JAM: 1,         // unit Terlambat dianggap masih terpakai sampai (sekarang + 1 jam)
  MAKS_BARIS_TABEL: 15,
  BULAN: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],

  // ---- Waktu & format ----
  parseWaktu(v) {
    if (v === null || v === undefined || v === '') return null;
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    const wib = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi) - 7 * 3600000);
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:.](\d{2}))?/))) {
      return wib(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0));
    }
    if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ ,T]+(\d{1,2})[:.](\d{2}))?/))) {
      return wib(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0));
    }
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  },
  fmt(d, pola) { return Utilities.formatDate(d, ADM.ZONA, pola); },
  tgl(d) { return ADM.fmt(d, 'd') + ' ' + ADM.BULAN[Number(ADM.fmt(d, 'M')) - 1] + ' ' + ADM.fmt(d, 'yyyy'); },
  jam(d) { return ADM.fmt(d, 'HH:mm'); },
  hari(d) { return ADM.fmt(d, 'yyyy-MM-dd'); },
  hariIni(d, now) { return ADM.hari(d) === ADM.hari(now); },
  rentang(m, s, now) {
    if (ADM.hari(m) === ADM.hari(s)) {
      return (ADM.hariIni(m, now) ? 'Hari Ini' : ADM.tgl(m)) + ', ' + ADM.jam(m) + ' - ' + ADM.jam(s) + ' WIB';
    }
    return ADM.tgl(m) + ' ' + ADM.jam(m) + ' - ' + ADM.tgl(s) + ' ' + ADM.jam(s) + ' WIB';
  },
  jamRentang(b) {
    if (ADM.hari(b.mulai) === ADM.hari(b.selesai)) return ADM.jam(b.mulai) + ' - ' + ADM.jam(b.selesai) + ' WIB';
    return ADM.jam(b.mulai) + ' - ' + ADM.tgl(b.selesai) + ' ' + ADM.jam(b.selesai) + ' WIB';
  },

  // ---- Baca sheet ----
  objek(t, kolomId) {
    const hasil = [];
    for (let i = 0; i < t.data.length; i++) {
      const o = { _i: i };
      Object.keys(t.h).forEach(k => { o[k] = t.data[i][t.h[k]]; });
      if (kolomId && teks_(o[kolomId]) === '') continue;
      hasil.push(o);
    }
    return hasil;
  },
  labelStatus(s) {
    const peta = { ditunggu: 'Ditunggu', disetujui: 'Disetujui', ditolak: 'Ditolak', berjalan: 'Berjalan',
                   terlambat: 'Terlambat', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
    return peta[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '-');
  },
  bentuk(o, now) {
    const mulai = ADM.parseWaktu(o.WAKTU_BERANGKAT);
    let selesai = ADM.parseWaktu(o.WAKTU_TIBA_ESTIMASI);
    if (mulai && (!selesai || selesai <= mulai)) selesai = new Date(mulai.getTime() + ADM.DURASI_DEFAULT_JAM * 3600000);
    const s = huruf_(o.STATUS);
    const efektif = (s === 'berjalan' && selesai && now > selesai) ? 'terlambat' : s;   // Terlambat dihitung saat dibaca
    return {
      _i: o._i, id: teks_(o.ID_BOOKING), idPemohon: teks_(o.ID_PEMOHON), bagian: teks_(o.BAGIAN),
      mulai: mulai, selesai: selesai, tujuan: teks_(o.TUJUAN), keperluan: teks_(o.KEPERLUAN),
      penumpang: Number(o.JUMLAH_PENUMPANG) || 0, status: s, statusEfektif: efektif,
      idMobil: teks_(o.ID_MOBIL), idDriver: teks_(o.ID_DRIVER)
    };
  },
  muat(denganPerjalanan) {
    const now = new Date();
    const tB = bukaSheet_(ADM.S_BOOKING, []);
    const d = { now: now, tBooking: tB };
    d.booking = ADM.objek(tB, 'ID_BOOKING').map(o => ADM.bentuk(o, now));
    d.mobil = ADM.objek(bukaSheet_(ADM.S_MOBIL, []), 'ID_MOBIL');
    d.driver = ADM.objek(bukaSheet_(ADM.S_DRIVER, []), 'ID_DRIVER');
    d.pengguna = {};
    ADM.objek(bukaSheet_(ADM.S_PENGGUNA, []), 'ID_PENGGUNA').forEach(o => {
      d.pengguna[teks_(o.ID_PENGGUNA)] = { nama: teks_(o.NAMA), hp: teks_(o.NO_HP), bagian: teks_(o.BAGIAN) };
    });
    d.perjalanan = {};
    if (denganPerjalanan) {
      ADM.objek(bukaSheet_(ADM.S_PERJALANAN, []), 'ID_BOOKING').forEach(o => { d.perjalanan[teks_(o.ID_BOOKING)] = o; });
    }
    return d;
  },
  tulis(t, i, kolom, nilai, teks) {
    const r = t.sheet.getRange(i + 2, t.h[kolom] + 1);
    if (teks) r.setNumberFormat('@');     // simpan sebagai teks (format waktu tetap rapi)
    r.setValue(nilai);
  },

  // ---- Aturan ketersediaan ----
  aktif(b) { return b.statusEfektif === 'disetujui' || b.statusEfektif === 'berjalan' || b.statusEfektif === 'terlambat'; },
  akhir(b, now) {
    if (b.statusEfektif === 'terlambat') return new Date(Math.max(b.selesai.getTime(), now.getTime() + ADM.BUFFER_TERLAMBAT_JAM * 3600000));
    return b.selesai;
  },
  bentrok(booking, kolom, nilai, mulai, selesai, abaikanId, now) {
    for (let i = 0; i < booking.length; i++) {
      const b = booking[i];
      if (!nilai || b[kolom] !== nilai || b.id === abaikanId || !b.mulai || !ADM.aktif(b)) continue;
      if (b.mulai < selesai && mulai < ADM.akhir(b, now)) return b;
    }
    return null;
  },
  mendesak(b, now) { return !!b.mulai && (b.mulai.getTime() - now.getTime()) <= ADM.MENDESAK_JAM * 3600000; },
  mobilTersedia(m) { return huruf_(m.STATUS) === ADM.MOBIL_TERSEDIA; },
  mobilBebasSekarang(d) {
    return d.mobil.filter(m => {
      if (!ADM.mobilTersedia(m)) return false;
      const id = teks_(m.ID_MOBIL);
      return !d.booking.some(b => b.idMobil === id && b.mulai && ADM.aktif(b) && b.mulai <= d.now && d.now < ADM.akhir(b, d.now));
    });
  },
  namaDriver(d, row) {
    const p = d.pengguna[teks_(row.ID_PENGGUNA)];
    return (p && p.nama) || teks_(row.ID_DRIVER);
  },
  simOk(row, sampai) {
    const exp = ADM.parseWaktu(row.MASA_BERLAKU_SIM);
    if (!exp) return true;
    return exp.getTime() + 24 * 3600000 > sampai.getTime();
  },
  opsiMobil(d, b) {
    const hasil = [];
    d.mobil.forEach(m => {
      if (!ADM.mobilTersedia(m)) return;
      const kap = Number(m.KAPASITAS) || 0;
      if (kap && b.penumpang && kap < b.penumpang) return;
      const id = teks_(m.ID_MOBIL);
      if (ADM.bentrok(d.booking, 'idMobil', id, b.mulai, b.selesai, b.id, d.now)) return;
      hasil.push({ id: id, kap: kap, driverTetap: teks_(m.ID_DRIVER_TETAP),
                   label: teks_(m.JENIS) + ' - ' + teks_(m.PLAT) + ' (' + (kap || '?') + ' Seat | Siap)' });
    });
    hasil.sort((a, c) => a.kap - c.kap || (a.label < c.label ? -1 : 1));
    return hasil;
  },
  opsiDriver(d, b) {
    const hasil = [];
    d.driver.forEach(r => {
      if (!aktif_(r.AKTIF)) return;
      if (!ADM.simOk(r, b.selesai)) return;
      const id = teks_(r.ID_DRIVER);
      if (ADM.bentrok(d.booking, 'idDriver', id, b.mulai, b.selesai, b.id, d.now)) return;
      hasil.push({ id: id, label: ADM.namaDriver(d, r) + ' (SIM ' + (teks_(r.JENIS_SIM) || '-') + ' - Siap Tugas)' });
    });
    return hasil;
  },
  // Satu pengajuan dalam bentuk yang aman dikirim ke browser
  item(b, d) {
    const p = d.pengguna[b.idPemohon] || {};
    const ok = !!b.mulai;
    return {
      id: b.id, nama: p.nama || b.idPemohon || '-', hp: p.hp || '', bagian: b.bagian || p.bagian || '',
      tujuan: b.tujuan, keperluan: b.keperluan,
      tanggal: ok ? ADM.tgl(b.mulai) : '-',
      jam: ok ? ADM.jamRentang(b) : '-',
      rentang: ok ? ADM.rentang(b.mulai, b.selesai, d.now) : '-',
      penumpang: b.penumpang, status: ADM.labelStatus(b.statusEfektif),
      mendesak: b.status === 'ditunggu' && ADM.mendesak(b, d.now),
      hariIni: ok && ADM.hariIni(b.mulai, d.now),
      bisaDiproses: b.status === 'ditunggu'
    };
  },
  urut(a, c) { return (a.mulai ? a.mulai.getTime() : Infinity) - (c.mulai ? c.mulai.getTime() : Infinity); }
};

// Pengecek sesi bersama. Dipakai lewat adminJalankan_ di bawah, atau langsung:
//   const sesi = adminSesi_(sid); if (sesi.galat) return sesi.galat; const user = sesi.user;
function adminSesi_(sid) {
  const user = getSesi(sid);
  if (!user) return { galat: { ok: false, kode: 'SESI', pesan: 'Sesi berakhir. Silakan masuk lagi.' } };
  if (user.peran !== 'Admin') return { galat: { ok: false, kode: 'AKSES', pesan: 'Halaman ini khusus admin.' } };
  return { user: user };
}

// Pembungkus fungsi publik admin: cek sesi, jalankan kerja(user), dan ubah error (throw new Error)
// menjadi balasan { ok:false, kode:'GALAT', pesan } seperti di Driver.gs (tidak pernah melempar ke browser).
function adminJalankan_(sid, kerja) {
  const sesi = adminSesi_(sid);
  if (sesi.galat) return sesi.galat;
  try {
    return kerja(sesi.user);
  } catch (e) {
    return { ok: false, kode: 'GALAT', pesan: e.message };
  }
}

// ==========================================
// FITUR BERANDA
// Identitas HANYA dari sesi di server (sid), tidak pernah dari data kiriman browser.
// ==========================================

// Data utama Beranda: statistik + tabel pengajuan
function adminBeranda(sid) {
  return adminJalankan_(sid, user => {
    const d = ADM.muat(false);
    const tunggu = d.booking.filter(b => b.status === 'ditunggu');
    const disetujui = d.booking.filter(b => b.status === 'disetujui' && b.selesai && b.selesai >= d.now);
    const baris = tunggu.sort(ADM.urut).concat(disetujui.sort(ADM.urut)).slice(0, ADM.MAKS_BARIS_TABEL);
    return {
      ok: true,
      pengguna: { nama: user.nama || 'Admin' },
      stats: {
        menunggu: tunggu.length,
        menungguMendesak: tunggu.filter(b => ADM.mendesak(b, d.now)).length,
        sedangJalan: d.booking.filter(b => b.statusEfektif === 'berjalan' || b.statusEfektif === 'terlambat').length,
        tersedia: ADM.mobilBebasSekarang(d).length
      },
      pengajuan: baris.map(b => ADM.item(b, d))
    };
  });
}

// Pop-up "Pengajuan Menunggu"
function adminGetPengajuanMenunggu(sid) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(false);
    return { ok: true, daftar: d.booking.filter(b => b.status === 'ditunggu').sort(ADM.urut).map(b => ADM.item(b, d)) };
  });
}

// Pilihan mobil & driver yang bebas untuk satu pengajuan
function adminGetOpsiPenugasan(sid, idBooking) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(false);
    const b = d.booking.filter(x => x.id === teks_(idBooking))[0];
    if (!b) throw new Error('Pengajuan tidak ditemukan.');
    if (b.status !== 'ditunggu') throw new Error('Pengajuan ini sudah diproses (status: ' + ADM.labelStatus(b.statusEfektif) + ').');
    if (!b.mulai) throw new Error('Jadwal pengajuan tidak terbaca. Periksa format WAKTU_BERANGKAT di sheet BOOKING.');
    return { ok: true, booking: ADM.item(b, d), mobil: ADM.opsiMobil(d, b), driver: ADM.opsiDriver(d, b) };
  });
}

function adminSetujuiPengajuan(sid, idBooking, idMobil, idDriver) {
  return adminJalankan_(sid, u => {
    idBooking = teks_(idBooking); idMobil = teks_(idMobil); idDriver = teks_(idDriver);
    if (!idMobil || !idDriver) throw new Error('Pilih mobil dan driver terlebih dahulu.');

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const d = ADM.muat(false);
      const b = d.booking.filter(x => x.id === idBooking)[0];
      if (!b) throw new Error('Pengajuan tidak ditemukan.');
      if (b.status !== 'ditunggu') throw new Error('Pengajuan ini sudah diproses oleh admin lain (status: ' + ADM.labelStatus(b.statusEfektif) + ').');
      if (!b.mulai) throw new Error('Jadwal pengajuan tidak terbaca.');

      if (!ADM.opsiMobil(d, b).some(m => m.id === idMobil)) {
        throw new Error('Mobil yang dipilih sudah tidak tersedia pada jadwal ini (terpakai booking lain, tidak tersedia, atau kapasitas kurang).');
      }
      if (!ADM.opsiDriver(d, b).some(r => r.id === idDriver)) {
        throw new Error('Driver yang dipilih sudah tidak tersedia pada jadwal ini (bertugas, nonaktif, atau SIM kedaluwarsa).');
      }

      const t = d.tBooking;
      ['STATUS', 'ID_MOBIL', 'ID_DRIVER', 'ID_ADMIN', 'WAKTU_KEPUTUSAN'].forEach(k => {
        if (t.h[k] === undefined) throw new Error('Kolom ' + k + ' tidak ada di sheet BOOKING.');
      });
      ADM.tulis(t, b._i, 'STATUS', ADM.STATUS_SETUJU, false);
      ADM.tulis(t, b._i, 'ID_MOBIL', idMobil, true);
      ADM.tulis(t, b._i, 'ID_DRIVER', idDriver, true);
      ADM.tulis(t, b._i, 'ID_ADMIN', u.id, true);
      ADM.tulis(t, b._i, 'WAKTU_KEPUTUSAN', ADM.fmt(new Date(), 'yyyy-MM-dd HH:mm'), true);
      return { ok: true, pesan: 'Pengajuan ' + idBooking + ' disetujui dan ditugaskan.' };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

function adminTolakPengajuan(sid, idBooking, alasan) {
  return adminJalankan_(sid, u => {
    idBooking = teks_(idBooking); alasan = teks_(alasan);
    if (alasan.length < 5) throw new Error('Alasan penolakan wajib diisi (minimal 5 karakter).');
    if (alasan.length > 300) alasan = alasan.substring(0, 300);

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const d = ADM.muat(false);
      const b = d.booking.filter(x => x.id === idBooking)[0];
      if (!b) throw new Error('Pengajuan tidak ditemukan.');
      if (b.status !== 'ditunggu') throw new Error('Pengajuan ini sudah diproses (status: ' + ADM.labelStatus(b.statusEfektif) + ').');
      const t = d.tBooking;
      ['STATUS', 'ID_ADMIN', 'WAKTU_KEPUTUSAN', 'ALASAN_TOLAK'].forEach(k => {
        if (t.h[k] === undefined) throw new Error('Kolom ' + k + ' tidak ada di sheet BOOKING.');
      });
      ADM.tulis(t, b._i, 'STATUS', ADM.STATUS_TOLAK, false);
      ADM.tulis(t, b._i, 'ID_ADMIN', u.id, true);
      ADM.tulis(t, b._i, 'WAKTU_KEPUTUSAN', ADM.fmt(new Date(), 'yyyy-MM-dd HH:mm'), true);
      ADM.tulis(t, b._i, 'ALASAN_TOLAK', alasan, true);
      return { ok: true, pesan: 'Pengajuan ' + idBooking + ' ditolak.' };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

// Pop-up "Mobil Tersedia" (filter tanggal & kategori)
function adminGetMobilTersedia(sid, tanggal, jenis) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(false);
    tanggal = teks_(tanggal) || ADM.hari(d.now);
    jenis = teks_(jenis);
    const awal = ADM.parseWaktu(tanggal) || ADM.parseWaktu(ADM.hari(d.now));
    const akhir = new Date(awal.getTime() + 24 * 3600000);

    const siap = d.mobil.filter(ADM.mobilTersedia);
    const jenisList = [];
    siap.forEach(m => { const j = teks_(m.JENIS); if (j && jenisList.indexOf(j) === -1) jenisList.push(j); });
    jenisList.sort();

    const items = siap.filter(m => !jenis || huruf_(m.JENIS) === huruf_(jenis)).map(m => {
      const id = teks_(m.ID_MOBIL);
      const jadwal = d.booking.filter(b => b.idMobil === id && b.mulai && ADM.aktif(b) && b.mulai < akhir && awal < ADM.akhir(b, d.now)).sort(ADM.urut);
      const teksJadwal = jadwal.length
        ? 'Ada jadwal: ' + jadwal.slice(0, 2).map(b => ADM.jam(b.mulai) + '-' + ADM.jam(b.selesai) + ' (' + ADM.labelStatus(b.statusEfektif) + ')').join(', ')
            + (jadwal.length > 2 ? ' +' + (jadwal.length - 2) + ' lagi' : '')
        : 'Bebas tugas pada tanggal ini - siap jalan kapan saja';
      const tetap = d.driver.filter(r => teks_(r.ID_DRIVER) === teks_(m.ID_DRIVER_TETAP))[0];
      return {
        id: id, nama: teks_(m.JENIS), plat: teks_(m.PLAT), kapasitas: Number(m.KAPASITAS) || 0,
        asal: teks_(m.ASAL), keterangan: teks_(m.KETERANGAN), km: teks_(m.KM_TERAKHIR),
        driverTetap: tetap ? ADM.namaDriver(d, tetap) : '', bebas: jadwal.length === 0, jadwal: teksJadwal
      };
    });

    return {
      ok: true, tanggal: tanggal, tanggalLabel: ADM.tgl(awal), jenis: jenis, jenisList: jenisList,
      poolReady: siap.length, poolTidak: d.mobil.length - siap.length,
      bebas: items.filter(x => x.bebas).length, items: items
    };
  });
}

// Pop-up "Mobil Sedang Jalan"
function adminGetMobilSedangJalan(sid) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(true);
    const jalan = d.booking.filter(b => b.statusEfektif === 'berjalan' || b.statusEfektif === 'terlambat').sort(ADM.urut);
    const daftar = jalan.map(b => {
      const m = d.mobil.filter(x => teks_(x.ID_MOBIL) === b.idMobil)[0] || {};
      const r = d.driver.filter(x => teks_(x.ID_DRIVER) === b.idDriver)[0];
      const p = d.pengguna[b.idPemohon] || {};
      const pj = d.perjalanan[b.id];
      const berangkat = (pj && ADM.parseWaktu(pj.WAKTU_MULAI)) || b.mulai;
      const tgl = x => x ? (ADM.hariIni(x, d.now) ? '' : ADM.tgl(x) + ' ') + ADM.jam(x) + ' WIB' : '-';
      return {
        id: b.id, idMobil: b.idMobil, mobil: teks_(m.JENIS) || b.idMobil || '-', plat: teks_(m.PLAT), asal: teks_(m.ASAL),
        terlambat: b.statusEfektif === 'terlambat', status: ADM.labelStatus(b.statusEfektif),
        driver: r ? ADM.namaDriver(d, r) : (b.idDriver || '-'), idDriver: b.idDriver,
        pemohon: p.nama || b.idPemohon || '-', bagian: b.bagian || p.bagian || '', penumpang: b.penumpang,
        tujuan: b.tujuan, keperluan: b.keperluan,
        berangkat: tgl(berangkat), kembali: tgl(b.selesai), kmAwal: pj ? teks_(pj.KM_AWAL) : ''
      };
    });
    return { ok: true, daftar: daftar };
  });
}

// Kalender singkat satu unit (maks. 10 jadwal terdekat)
function adminGetJadwalMobil(sid, idMobil) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(false);
    idMobil = teks_(idMobil);
    const awalHari = ADM.parseWaktu(ADM.hari(d.now));
    const daftar = d.booking.filter(b => b.idMobil === idMobil && b.mulai && ADM.aktif(b) && ADM.akhir(b, d.now) >= awalHari)
      .sort(ADM.urut).slice(0, 10).map(b => {
        const p = d.pengguna[b.idPemohon] || {};
        return { id: b.id, tanggal: ADM.tgl(b.mulai), jam: ADM.jamRentang(b), tujuan: b.tujuan,
                 pemohon: p.nama || b.idPemohon, status: ADM.labelStatus(b.statusEfektif) };
      });
    return { ok: true, daftar: daftar };
  });
}

// ==========================================
// BOOKTRIP PLN - AdminMobilDriver
// ==========================================

const MDRV = {
  PREFIX_MOBIL: 'MBL',                 // ID baru: MBL-001, MBL-002, ...
  PREFIX_DRIVER: 'DRV',                // ID baru: DRV-001, ...
  STATUS_MOBIL: ['Tersedia', 'Perawatan', 'Tidak Aktif'],
  STATUS_DRIVER_BARU: 'Siap Tugas',       // nilai kolom STATUS_DRIVER untuk driver baru
  SIM_HAMPIR_HARI: 30                  // SIM yang habis <= 30 hari lagi diberi peringatan
};

// ---------- Helper ----------
function mdKapital_(s) { s = teks_(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '-'; }

function mdBookingSekarang_(d, kolom, id) {
  if (!id) return null;
  return d.booking.filter(b => b[kolom] === id && b.mulai && ADM.aktif(b) && b.mulai <= d.now && d.now < ADM.akhir(b, d.now))[0] || null;
}

function mdJadwalAktif_(booking, kolom, id, now) {
  return booking.filter(b => b[kolom] === id && b.mulai && ADM.aktif(b) && ADM.akhir(b, now) > now).length;
}

function mdIdBaru_(daftar, kolom, prefix) {
  let maks = 0;
  daftar.forEach(o => { const m = teks_(o[kolom]).match(/(\d+)\s*$/); if (m) maks = Math.max(maks, Number(m[1])); });
  return prefix + '-' + String(maks + 1).padStart(3, '0');
}

function mdTambahBaris_(t, isi) {
  Object.keys(isi).forEach(k => { if (t.h[k] === undefined) throw new Error('Kolom ' + k + ' tidak ada di sheet.'); });
  const lebar = t.sheet.getLastColumn();
  const baris = new Array(lebar).fill('');
  Object.keys(isi).forEach(k => { baris[t.h[k]] = isi[k]; });
  const rg = t.sheet.getRange(t.sheet.getLastRow() + 1, 1, 1, lebar);
  rg.setNumberFormat('@');
  rg.setValues([baris]);
}

function mdUbahBaris_(t, o, isi) {
  Object.keys(isi).forEach(k => { if (t.h[k] === undefined) throw new Error('Kolom ' + k + ' tidak ada di sheet.'); });
  Object.keys(isi).forEach(k => ADM.tulis(t, o._i, k, isi[k], true));
}

// ---------- Bentuk data untuk browser ----------
function mdItemMobil_(d, m) {
  const id = teks_(m.ID_MOBIL);
  let kode = 'lain', label = mdKapital_(m.STATUS), warna = 'kuning';
  if (ADM.mobilTersedia(m)) {
    const b = mdBookingSekarang_(d, 'idMobil', id);
    if (!b) { kode = 'tersedia'; label = 'Tersedia'; warna = 'ok'; }
    else {
      kode = 'pakai'; warna = 'biru';
      label = b.statusEfektif === 'disetujui' ? 'Terjadwal' : (b.statusEfektif === 'terlambat' ? 'Terlambat' : 'Sedang Jalan');
      if (b.statusEfektif === 'terlambat') warna = 'merah';
    }
  } else if (/tidak|nonaktif/.test(huruf_(m.STATUS))) {
    warna = 'abu';
  }
  const tetap = d.driver.filter(r => teks_(r.ID_DRIVER) === teks_(m.ID_DRIVER_TETAP))[0];
  return {
    id: id, plat: teks_(m.PLAT), jenis: teks_(m.JENIS), kapasitas: Number(m.KAPASITAS) || 0, asal: teks_(m.ASAL),
    idDriverTetap: teks_(m.ID_DRIVER_TETAP), driverTetap: tetap ? ADM.namaDriver(d, tetap) : '',
    status: teks_(m.STATUS), keterangan: teks_(m.KETERANGAN), km: teks_(m.KM_TERAKHIR),
    kode: kode, label: label, warna: warna
  };
}

// Nilai kolom AKTIF yang pasti dibaca benar oleh aktif_() milik Kode.gs
function mdAktifNilai_(ya) {
  const calon = ya ? ['Ya', 'TRUE', 'Aktif', '1', 'Y'] : ['Tidak', 'FALSE', 'Nonaktif', '0', 'N', ''];
  for (let i = 0; i < calon.length; i++) { if (!!aktif_(calon[i]) === ya) return calon[i]; }
  return ya ? 'Ya' : 'Tidak';
}

function mdItemDriver_(d, r) {
  const id = teks_(r.ID_DRIVER);
  const p = d.pengguna[teks_(r.ID_PENGGUNA)] || {};
  const aktif = !!aktif_(r.AKTIF);
  const exp = ADM.parseWaktu(r.MASA_BERLAKU_SIM);
  let sim = 'kosong', simTeks = 'Masa berlaku belum diisi', simWarna = 'abu';
  if (exp) {
    const sisa = Math.floor((exp.getTime() + 24 * 3600000 - d.now.getTime()) / 86400000);
    if (sisa <= 0) { sim = 'habis'; simWarna = 'merah'; simTeks = 'Kedaluwarsa ' + ADM.tgl(exp); }
    else if (sisa <= MDRV.SIM_HAMPIR_HARI) { sim = 'segera'; simWarna = 'kuning'; simTeks = 'Habis ' + ADM.tgl(exp); }
    else { sim = 'ok'; simWarna = 'ok'; simTeks = 'Berlaku s/d ' + ADM.tgl(exp); }
  }

  const sekarang = mdBookingSekarang_(d, 'idDriver', id);
  const berikut = d.booking.filter(b => b.idDriver === id && b.mulai && ADM.aktif(b) && b.mulai > d.now).sort(ADM.urut)[0];
  let kode = 'standby', label = 'Siap Tugas', warna = 'ok', tugas = '';
  if (!aktif) { kode = 'nonaktif'; label = 'Nonaktif'; warna = 'abu'; }
  else if (sekarang) {
    kode = 'bertugas'; label = 'Bertugas'; warna = 'biru';
    tugas = (sekarang.tujuan || '-') + ' (' + ADM.rentang(sekarang.mulai, sekarang.selesai, d.now) + ')';
  } else if (berikut) {
    tugas = 'Berikutnya: ' + (berikut.tujuan || '-') + ' (' + ADM.rentang(berikut.mulai, berikut.selesai, d.now) + ')';
  }
  return {
    id: id, idPengguna: teks_(r.ID_PENGGUNA), nama: ADM.namaDriver(d, r), hp: p.hp || '',
    jenisSim: teks_(r.JENIS_SIM), masaSim: exp ? ADM.hari(exp) : '', sim: sim, simTeks: simTeks, simWarna: simWarna,
    pengalaman: teks_(r.PENGALAMAN_TAHUN), rute: teks_(r.RUTE_DIKUASAI), sertifikasi: teks_(r.SERTIFIKASI),
    aktif: aktif, kode: kode, label: label, warna: warna, tugas: tugas
  };
}

// Ketersediaan satu driver pada rentang waktu tertentu
function mdCekDriver_(d, r, x, mulai, selesai) {
  if (!x.aktif) return { kode: 'nonaktif', label: 'Nonaktif', detail: '', warna: 'abu' };
  const b = ADM.bentrok(d.booking, 'idDriver', x.id, mulai, selesai, '', d.now);
  if (b) return { kode: 'bentrok', label: 'Tidak Tersedia', detail: 'Bertugas: ' + (b.tujuan || '-') + ' (' + ADM.rentang(b.mulai, b.selesai, d.now) + ')', warna: 'merah' };
  if (!ADM.simOk(r, selesai)) return { kode: 'sim', label: 'SIM Kedaluwarsa', detail: 'Masa berlaku SIM habis sebelum jadwal selesai', warna: 'kuning' };
  return { kode: 'bebas', label: 'Tersedia', detail: '', warna: 'ok' };
}

function adminGetMobilDriver(sid, tanggal, jamMulai, jamSelesai) {
  return adminJalankan_(sid, () => {
    let mulai = null, selesai = null;
    tanggal = tanggal ? teks_(tanggal) : '';
    if (tanggal) {
      jamMulai = jamMulai ? teks_(jamMulai) : '';
      jamSelesai = jamSelesai ? teks_(jamSelesai) : '';
      if (!jamMulai) throw new Error('Isi jam mulai untuk cek ketersediaan.');
      mulai = ADM.parseWaktu(tanggal + ' ' + jamMulai);
      selesai = jamSelesai ? ADM.parseWaktu(tanggal + ' ' + jamSelesai) : mulai;
      if (!mulai || !selesai) throw new Error('Tanggal atau jam tidak valid.');
      if (selesai.getTime() < mulai.getTime()) throw new Error('Jam selesai harus setelah jam mulai.');
    }

    const d = ADM.muat(false);
    const mobil = d.mobil.map(m => mdItemMobil_(d, m)).sort((a, c) => (a.jenis + a.plat).localeCompare(c.jenis + c.plat));
    let bebas = 0;
    const driver = d.driver.map(r => {
      const x = mdItemDriver_(d, r);
      if (mulai) { x.cek = mdCekDriver_(d, r, x, mulai, selesai); if (x.cek.kode === 'bebas') bebas++; }
      return x;
    }).sort((a, c) => a.nama.localeCompare(c.nama));

    // pengguna yang belum jadi driver (untuk form Tambah Driver)
    const tP = bukaSheet_(ADM.S_PENGGUNA, []);
    const kolomPeran = tP.h.PERAN !== undefined ? 'PERAN' : (tP.h.ROLE !== undefined ? 'ROLE' : '');
    const dipakai = {};
    driver.forEach(r => { dipakai[r.idPengguna] = true; });
    const calonDriver = ADM.objek(tP, 'ID_PENGGUNA')
      .filter(o => !dipakai[teks_(o.ID_PENGGUNA)] && (!kolomPeran || huruf_(o[kolomPeran]) === 'driver'))
      .map(o => ({ id: teks_(o.ID_PENGGUNA), nama: teks_(o.NAMA) || teks_(o.ID_PENGGUNA), hp: teks_(o.NO_HP) }));

    return {
      ok: true, mobil: mobil, driver: driver, calonDriver: calonDriver,
      cek: mulai ? { label: ADM.tgl(mulai) + ', ' + ADM.jam(mulai) + (selesai.getTime() > mulai.getTime() ? ' - ' + ADM.jam(selesai) : '') + ' WIB', bebas: bebas } : null,
      stats: {
        totalMobil: mobil.length,
        siap: mobil.filter(x => x.kode === 'tersedia').length,
        tidakSiap: mobil.filter(x => x.kode === 'lain').length,
        totalDriver: driver.length,
        standby: driver.filter(x => x.kode === 'standby').length,
        simBermasalah: driver.filter(x => x.aktif && (x.sim === 'habis' || x.sim === 'segera')).length
      }
    };
  });
}

// Tambah (f.id kosong) atau ubah (f.id terisi) satu mobil
function adminSimpanMobil(sid, f) {
  return adminJalankan_(sid, () => {
    f = f || {};
    const id = teks_(f.id);
    const plat = teks_(f.plat).toUpperCase().replace(/\s+/g, ' ');
    const jenis = teks_(f.jenis);
    const kap = Number(teks_(f.kapasitas));
    const km = teks_(f.km).replace(/[.,\s]/g, '');
    let status = teks_(f.status);
    if (!jenis) throw new Error('Jenis / nama unit wajib diisi.');
    if (plat.length < 3) throw new Error('Plat nomor wajib diisi.');
    if (!(kap >= 1 && kap <= 60) || Math.floor(kap) !== kap) throw new Error('Kapasitas harus berupa angka 1 sampai 60.');
    if (km && !/^\d+$/.test(km)) throw new Error('KM terakhir harus berupa angka.');
    if (!status) throw new Error('Status unit wajib dipilih.');

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const t = bukaSheet_(ADM.S_MOBIL, []);
      const daftar = ADM.objek(t, 'ID_MOBIL');
      const ada = id ? daftar.filter(o => teks_(o.ID_MOBIL) === id)[0] : null;
      if (id && !ada) throw new Error('Unit tidak ditemukan.');

      const kunci = s => teks_(s).toUpperCase().replace(/\s+/g, '');
      if (daftar.some(o => teks_(o.ID_MOBIL) !== id && kunci(o.PLAT) === kunci(plat))) throw new Error('Plat ' + plat + ' sudah terdaftar.');

      const baku = MDRV.STATUS_MOBIL.filter(s => huruf_(s) === huruf_(status))[0];
      if (baku) status = baku;
      else if (!(ada && huruf_(ada.STATUS) === huruf_(status))) throw new Error('Status unit tidak dikenali.');

      const idTetap = teks_(f.idDriverTetap);
      if (idTetap && !ADM.objek(bukaSheet_(ADM.S_DRIVER, []), 'ID_DRIVER').some(r => teks_(r.ID_DRIVER) === idTetap)) {
        throw new Error('Driver tetap yang dipilih tidak ditemukan.');
      }

      const isi = {
        PLAT: plat, JENIS: jenis, KAPASITAS: String(kap), ASAL: teks_(f.asal).substring(0, 60),
        ID_DRIVER_TETAP: idTetap, STATUS: status, KETERANGAN: teks_(f.keterangan).substring(0, 200), KM_TERAKHIR: km
      };
      if (ada) {
        mdUbahBaris_(t, ada, isi);
        let pesan = 'Data ' + jenis + ' (' + plat + ') diperbarui.';
        if (huruf_(status) !== 'tersedia') {
          const d = ADM.muat(false);
          const n = mdJadwalAktif_(d.booking, 'idMobil', id, d.now);
          if (n) pesan += ' Catatan: unit ini masih punya ' + n + ' jadwal aktif/mendatang.';
        }
        return { ok: true, pesan: pesan };
      }
      isi.ID_MOBIL = mdIdBaru_(daftar, 'ID_MOBIL', MDRV.PREFIX_MOBIL);
      mdTambahBaris_(t, isi);
      return { ok: true, pesan: 'Unit ' + jenis + ' (' + plat + ') ditambahkan dengan ID ' + isi.ID_MOBIL + '.' };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

// Tambah (f.id kosong, wajib f.idPengguna) atau ubah (f.id terisi) satu driver
function adminSimpanDriver(sid, f) {
  return adminJalankan_(sid, () => {
    f = f || {};
    const id = teks_(f.id), idPengguna = teks_(f.idPengguna), jenisSim = teks_(f.jenisSim);
    const masa = teks_(f.masaSim), peng = teks_(f.pengalaman);
    const aktif = f.aktif === true || f.aktif === 'true';
    if (!id && !idPengguna) throw new Error('Pilih pengguna yang akan dijadikan driver.');
    if (!jenisSim) throw new Error('Jenis SIM wajib dipilih.');
    let masaTeks = '';
    if (masa) {
      const w = ADM.parseWaktu(masa);
      if (!w) throw new Error('Masa berlaku SIM tidak valid.');
      masaTeks = ADM.hari(w);
    }
    if (peng && (!/^\d+$/.test(peng) || Number(peng) > 60)) throw new Error('Pengalaman harus berupa angka tahun (0 sampai 60).');

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const t = bukaSheet_(ADM.S_DRIVER, []);
      const daftar = ADM.objek(t, 'ID_DRIVER');
      const ada = id ? daftar.filter(o => teks_(o.ID_DRIVER) === id)[0] : null;
      if (id && !ada) throw new Error('Driver tidak ditemukan.');

      const isi = {
        JENIS_SIM: jenisSim, MASA_BERLAKU_SIM: masaTeks, PENGALAMAN_TAHUN: peng,
        RUTE_DIKUASAI: teks_(f.rute).substring(0, 200), SERTIFIKASI: teks_(f.sertifikasi).substring(0, 200)
      };
      if (ada) {
        const berubah = !!aktif_(ada.AKTIF) !== aktif;
        if (berubah) isi.AKTIF = mdAktifNilai_(aktif);
        mdUbahBaris_(t, ada, isi);
        let pesan = 'Data driver ' + id + ' diperbarui.';
        if (berubah && !aktif) {
          const d = ADM.muat(false);
          const n = mdJadwalAktif_(d.booking, 'idDriver', id, d.now);
          if (n) pesan += ' Catatan: driver ini masih punya ' + n + ' jadwal aktif/mendatang.';
        }
        return { ok: true, pesan: pesan };
      }

      if (!ADM.objek(bukaSheet_(ADM.S_PENGGUNA, []), 'ID_PENGGUNA').some(o => teks_(o.ID_PENGGUNA) === idPengguna)) throw new Error('Pengguna tidak ditemukan.');
      if (daftar.some(o => teks_(o.ID_PENGGUNA) === idPengguna)) throw new Error('Pengguna ini sudah terdaftar sebagai driver.');
      isi.ID_DRIVER = mdIdBaru_(daftar, 'ID_DRIVER', MDRV.PREFIX_DRIVER);
      isi.ID_PENGGUNA = idPengguna;
      isi.STATUS_DRIVER = MDRV.STATUS_DRIVER_BARU;
      isi.AKTIF = mdAktifNilai_(aktif);
      mdTambahBaris_(t, isi);
      return { ok: true, pesan: 'Driver ditambahkan dengan ID ' + isi.ID_DRIVER + '.' };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

// ==========================================
// BOOKTRIP PLN - AdminPengguna
// ==========================================

const PG = {
  PERAN: ['Pemohon', 'Driver', 'Admin'],
  // Kolom opsional: dipakai bila ada di sheet PENGGUNA
  K: { PERAN: ['PERAN', 'ROLE'], NIP: ['NIP'], AKTIF: ['AKTIF', 'STATUS_AKUN'] }
};

function pgKolom_(t) {
  const o = {};
  Object.keys(PG.K).forEach(k => { o[k] = PG.K[k].filter(n => t.h[n] !== undefined)[0] || ''; });
  return o;
}

// Driver wajib punya baris di sheet DRIVER agar muncul di Data Mobil dan Driver
function pgPastikanDriver_(idPengguna) {
  const ada = ADM.objek(bukaSheet_(ADM.S_DRIVER, []), 'ID_DRIVER').some(r => teks_(r.ID_PENGGUNA) === idPengguna);
  if (!ada) { try { tambahBarisDriver_(idPengguna); } catch (e) { Logger.log('Gagal membuat baris DRIVER: ' + e.message); } }
}

function adminGetPengguna(sid) {
  return adminJalankan_(sid, user => {
    const t = bukaSheet_(ADM.S_PENGGUNA, []);
    const K = pgKolom_(t);
    const items = ADM.objek(t, 'ID_PENGGUNA').map(o => ({
      id: teks_(o.ID_PENGGUNA), nama: teks_(o.NAMA) || teks_(o.ID_PENGGUNA), username: teks_(o.USERNAME),
      nip: K.NIP ? teks_(o[K.NIP]) : '', email: teks_(o.EMAIL), hp: teks_(o.NO_HP), bagian: teks_(o.BAGIAN),
      peran: K.PERAN ? mdKapital_(o[K.PERAN]) : '-', kode: K.PERAN ? huruf_(o[K.PERAN]) : '',
      aktif: K.AKTIF ? !!aktif_(o[K.AKTIF]) : true,
      saya: teks_(o.ID_PENGGUNA) === teks_(user.id)
    })).sort((a, c) => a.nama.localeCompare(c.nama));

    const hitung = k => items.filter(x => x.kode === k).length;
    return {
      ok: true, items: items, bagianList: DAFTAR_BAGIAN,
      kolom: { peran: !!K.PERAN, nip: !!K.NIP, aktif: !!K.AKTIF },
      stats: {
        total: items.length, pemohon: hitung('pemohon'), driver: hitung('driver'), admin: hitung('admin'),
        pemohonAktif: items.filter(x => x.kode === 'pemohon' && x.aktif).length,
        driverAktif: items.filter(x => x.kode === 'driver' && x.aktif).length
      }
    };
  });
}

// Tambah (f.id kosong) atau ubah (f.id terisi) satu pengguna
function adminSimpanPengguna(sid, f) {
  return adminJalankan_(sid, user => {
    f = f || {};
    const id = teks_(f.id), baru = !id;
    const nama = teks_(f.nama).replace(/\s+/g, ' ');
    const username = teks_(f.username);
    const email = teks_(f.email);
    const peran = PG.PERAN.filter(p => huruf_(p) === huruf_(f.peran))[0];
    const hp = teks_(f.hp).replace(/[\s-]/g, '').replace(/^\+?62/, '0');
    const nip = teks_(f.nip);
    const pw = String(f.password == null ? '' : f.password);
    const aktif = f.aktif === true || f.aktif === 'true';

    if (nama.length < 3) throw new Error('Nama lengkap wajib diisi (minimal 3 karakter).');
    if (!/^\S{3,30}$/.test(username)) throw new Error('Username minimal 3 karakter dan tanpa spasi.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid.');
    if (!peran) throw new Error('Pilih peran pengguna.');
    if (hp && !/^0\d{8,13}$/.test(hp)) throw new Error('No. HP tidak valid. Contoh: 081234567890');
    if (baru && pw.length < 8) throw new Error('Password awal wajib diisi (minimal 8 karakter).');
    if (!baru && pw && pw.length < 8) throw new Error('Password baru minimal 8 karakter.');
    const bagian = peran === 'Driver' ? '' : teks_(f.bagian).substring(0, 80);

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const t = bukaSheet_(ADM.S_PENGGUNA, []);
      const K = pgKolom_(t);
      if (!K.PERAN) throw new Error('Kolom PERAN (atau ROLE) tidak ada di sheet PENGGUNA.');
      const daftar = ADM.objek(t, 'ID_PENGGUNA');
      const ada = id ? daftar.filter(o => teks_(o.ID_PENGGUNA) === id)[0] : null;
      if (id && !ada) throw new Error('Pengguna tidak ditemukan.');

      const lain = daftar.filter(o => teks_(o.ID_PENGGUNA) !== id);
      if (lain.some(o => huruf_(o.USERNAME) === huruf_(username))) throw new Error('Username ' + username + ' sudah digunakan.');
      if (lain.some(o => huruf_(o.EMAIL) === huruf_(email))) throw new Error('Email ' + email + ' sudah terdaftar.');
      if (K.NIP && nip && lain.some(o => huruf_(o[K.NIP]) === huruf_(nip))) throw new Error('NIP ' + nip + ' sudah terdaftar.');
      if (ada && id === teks_(user.id)) {
        if (peran !== 'Admin') throw new Error('Anda tidak dapat mengubah peran akun sendiri.');
        if (K.AKTIF && !aktif) throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');
      }

      const isi = { NAMA: nama, USERNAME: username, EMAIL: email, NO_HP: hp, BAGIAN: bagian };
      isi[K.PERAN] = peran;
      if (K.NIP) isi[K.NIP] = nip;
      if (K.AKTIF) isi[K.AKTIF] = mdAktifNilai_(aktif);
      if (pw) isi.PASSWORD = hashPassword_(pw);

      if (ada) {
        const peranLama = huruf_(ada[K.PERAN]);
        mdUbahBaris_(t, ada, isi);
        let pesan = 'Data ' + nama + ' diperbarui' + (pw ? ' dan password diganti.' : '.');
        if (peran === 'Driver') pgPastikanDriver_(id);
        else if (peranLama === 'driver') pesan += ' Catatan: pengguna ini masih tercatat di Data Driver.';
        return { ok: true, pesan: pesan };
      }

      isi.ID_PENGGUNA = buatId_(t, peran);
      isi.STATUS_VERIFIKASI = STATUS_TERVERIFIKASI;   // dibuat admin: langsung terverifikasi
      isi.TOKEN_VERIFIKASI = '';
      mdTambahBaris_(t, isi);
      if (peran === 'Driver') pgPastikanDriver_(isi.ID_PENGGUNA);
      return { ok: true, pesan: nama + ' ditambahkan dengan ID ' + isi.ID_PENGGUNA + '.' };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

// Aktifkan / nonaktifkan akun
function adminAktifPengguna(sid, idPengguna, aktif) {
  return adminJalankan_(sid, user => {
    idPengguna = teks_(idPengguna);
    aktif = aktif === true || aktif === 'true';
    if (!aktif && idPengguna === teks_(user.id)) throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const t = bukaSheet_(ADM.S_PENGGUNA, []);
      const K = pgKolom_(t);
      if (!K.AKTIF) throw new Error('Kolom AKTIF tidak ada di sheet PENGGUNA.');
      const ada = ADM.objek(t, 'ID_PENGGUNA').filter(o => teks_(o.ID_PENGGUNA) === idPengguna)[0];
      if (!ada) throw new Error('Pengguna tidak ditemukan.');
      const isi = {}; isi[K.AKTIF] = mdAktifNilai_(aktif);
      mdUbahBaris_(t, ada, isi);
      return { ok: true, pesan: 'Akun ' + (teks_(ada.NAMA) || idPengguna) + (aktif ? ' diaktifkan.' : ' dinonaktifkan.') };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  });
}

// ==========================================
// BOOKTRIP PLN - AdminRekap (Riwayat Booking)
// Rating dibaca dari sheet RATING (ID_BOOKING, NILAI, KOMENTAR).
// Jarak dan durasi dibaca dari sheet PERJALANAN (JARAK_KM, DURASI_MENIT).
// ==========================================

const REK = {
  STATUS_FINAL: ['selesai', 'ditolak', 'dibatalkan'],
  S_RATING: 'RATING',
  NAMA_BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
};

function rkRating_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return (n >= 1 && n <= 5) ? n : null;
}
function rkNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function rkKm_(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return s === '' ? null : Number(s);
}
function rkBulanLabel_(k) {
  const p = k.split('-');
  return REK.NAMA_BULAN[Number(p[1]) - 1] + ' ' + p[0];
}

// bulan: 'yyyy-MM', 'semua', atau kosong (= bulan ini)
function adminGetRiwayat(sid, bulan) {
  return adminJalankan_(sid, () => {
    const d = ADM.muat(true);
    const final = d.booking.filter(b => REK.STATUS_FINAL.indexOf(b.status) > -1 && b.mulai);

    const bulanIni = ADM.fmt(d.now, 'yyyy-MM');
    const set = {}; set[bulanIni] = true;
    final.forEach(b => { set[ADM.fmt(b.mulai, 'yyyy-MM')] = true; });
    const bulanList = Object.keys(set).sort().reverse().map(k => ({ v: k, l: rkBulanLabel_(k) }));

    bulan = teks_(bulan) || bulanIni;
    const pilih = final
      .filter(b => bulan === 'semua' || ADM.fmt(b.mulai, 'yyyy-MM') === bulan)
      .sort((a, c) => c.mulai.getTime() - a.mulai.getTime());

    const peringkat = {};   // ID_BOOKING -> baris sheet RATING
    try {
      ADM.objek(bukaSheet_(REK.S_RATING, []), 'ID_BOOKING').forEach(o => { peringkat[teks_(o.ID_BOOKING)] = o; });
    } catch (e) { /* sheet RATING belum ada: rating dikosongkan */ }

    const items = pilih.map(b => {
      const m = d.mobil.filter(x => teks_(x.ID_MOBIL) === b.idMobil)[0];
      const r = d.driver.filter(x => teks_(x.ID_DRIVER) === b.idDriver)[0];
      const p = d.pengguna[b.idPemohon] || {};
      const pj = d.perjalanan[b.id];
      const rt = peringkat[b.id];

      let rating = null, ulasan = '', km = null, durasi = null;
      if (rt && b.status === 'selesai') { rating = rkRating_(rt.NILAI); ulasan = teks_(rt.KOMENTAR); }
      if (pj) {
        km = rkNum_(pj.JARAK_KM);
        if (km === null) {
          const a = rkKm_(pj.KM_AWAL), z = rkKm_(pj.KM_AKHIR);
          if (a !== null && z !== null && z >= a) km = z - a;
        }
        const menit = rkNum_(pj.DURASI_MENIT);
        if (menit !== null && menit > 0) durasi = menit / 60;
        else {
          const w1 = ADM.parseWaktu(pj.WAKTU_MULAI), w2 = ADM.parseWaktu(pj.WAKTU_SELESAI);
          if (w1 && w2 && w2 > w1) durasi = (w2.getTime() - w1.getTime()) / 3600000;
        }
      }
      return {
        id: b.id, tanggal: ADM.tgl(b.mulai), jam: ADM.jamRentang(b),
        nama: p.nama || b.idPemohon || '-', bagian: b.bagian || p.bagian || '',
        tujuan: b.tujuan, keperluan: b.keperluan,
        mobil: m ? teks_(m.JENIS) : '', plat: m ? teks_(m.PLAT) : '',
        driver: r ? ADM.namaDriver(d, r) : '',
        kode: b.status, status: ADM.labelStatus(b.status),
        rating: rating, ulasan: ulasan, km: km, durasi: durasi
      };
    });

    const nilai = items.filter(x => x.rating !== null);
    const kmAda = items.filter(x => x.km !== null);
    const durAda = items.filter(x => x.durasi !== null);
    const jumlah = (arr, f) => arr.reduce((t, x) => t + f(x), 0);

    return {
      ok: true, bulan: bulan, bulanList: bulanList, items: items,
      stats: {
        total: items.length,
        selesai: items.filter(x => x.kode === 'selesai').length,
        ditolak: items.filter(x => x.kode === 'ditolak').length,
        dibatalkan: items.filter(x => x.kode === 'dibatalkan').length,
        km: jumlah(kmAda, x => x.km),
        rating: nilai.length ? jumlah(nilai, x => x.rating) / nilai.length : null,
        jumlahRating: nilai.length,
        durasi: durAda.length ? jumlah(durAda, x => x.durasi) / durAda.length : null
      }
    };
  });
}