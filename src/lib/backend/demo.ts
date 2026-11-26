/**
 * Demo arka ucu: her şey bu tarayıcıda (localStorage) tutulur.
 * GitHub Pages'teki tanıtım sürümü bununla çalışır. Gerçek API ile aynı
 * davranışı taklit eder (onay bekleyen kayıt, hız sınırı, 3 saat kuralı...).
 */
import { ACADEMIC_TITLES, CODE_ATTEMPT_WINDOW_MS, CODE_MAX_FAILED, MAX_FILE_BYTES, SHARE_DURATION_MS, isAllowedEmail } from "../../../shared/constants";
import type { AcademicProfile } from "../types";
import { ApiError, type AccountStatus, type AcademicRow, type Backend, type FileItem, type Me, startDownload } from "./types";

export const DEMO_EMAIL_DOMAIN = "universite.edu.tr";
const KEY = "3saat-demo-v3";

interface DemoUser extends Omit<Me, "code"> {
  password: string;
  code: string;
  createdAt: number;
}
interface DemoFile extends FileItem {
  ownerId: string;
}
interface DB {
  users: DemoUser[];
  files: DemoFile[];
  session: string | null;
  failed: number[];
}

const uid = () => crypto.randomUUID();
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));

function sixDigits(taken: Set<string>) {
  const buf = new Uint32Array(1);
  let c = "";
  do {
    crypto.getRandomValues(buf);
    c = String(buf[0] % 1_000_000).padStart(6, "0");
  } while (taken.has(c));
  return c;
}

function seed(): DB {
  const now = Date.now();
  const min = 60_000;
  const day = 24 * 60 * min;
  const MB = 1024 * 1024;
  const u = (p: Partial<DemoUser> & Pick<DemoUser, "title" | "name" | "email" | "code">, daysAgo: number): DemoUser => ({
    id: uid(), role: "academic", status: "active", faculty: "", department: "", password: "demo1234", createdAt: now - daysAgo * day, ...p,
  });
  const admin = u({ role: "admin", title: "", name: "Enes", email: "admin@3saat.demo", code: "100200", department: "Sistem Yöneticisi" }, 40);
  const ayse = u({ title: "Dr. Öğr. Üyesi", name: "Ayşe Yılmaz", email: "ayse@3saat.demo", code: "482791", faculty: "Mühendislik ve Mimarlık Fakültesi", department: "Bilgisayar Mühendisliği" }, 52);
  const others = [
    u({ title: "Prof. Dr.", name: "Mehmet Kaya", email: "mkaya@3saat.demo", code: "305618", faculty: "Fen-Edebiyat Fakültesi", department: "Matematik" }, 49),
    u({ title: "Öğr. Gör.", name: "Zeynep Demir", email: "zdemir@3saat.demo", code: "771204", faculty: "Mühendislik ve Mimarlık Fakültesi", department: "Elektrik-Elektronik Mühendisliği" }, 22),
    u({ title: "Doç. Dr.", name: "Ali Şahin", email: "asahin@3saat.demo", code: "590331", faculty: "İktisadi ve İdari Bilimler Fakültesi", department: "İşletme" }, 9),
    u({ title: "Öğr. Gör. Dr.", name: "Can Öztürk", email: "cozturk@3saat.demo", code: "246810", status: "disabled", faculty: "Meslek Yüksekokulu", department: "Bilgisayar Programcılığı" }, 3),
    u({ title: "Arş. Gör.", name: "Elif Koç", email: `ekoc@${DEMO_EMAIL_DOMAIN}`, code: "", status: "pending", faculty: "Fen-Edebiyat Fakültesi", department: "Kimya" }, 0),
  ];
  const f = (ownerId: string, name: string, size: number, mime: string, sharedAgoMin: number | null, uploadedAgoMin: number): DemoFile => ({
    id: uid(), ownerId, name, size, mime, uploadedAt: now - uploadedAgoMin * min, sharedAt: sharedAgoMin === null ? null : now - sharedAgoMin * min,
  });
  return {
    users: [admin, ayse, ...others],
    files: [
      f(ayse.id, "Hafta6_Ders_Notlari.pdf", 4.2 * MB, "application/pdf", 54, 54),
      f(ayse.id, "Odev3_Sorular.docx", 0.8 * MB, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 40, 40),
      f(ayse.id, "Veri_Seti.xlsx", 2.1 * MB, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 30, 30),
      f(ayse.id, "Hafta6_Sunum.pptx", 38 * MB, "application/vnd.openxmlformats-officedocument.presentationml.presentation", 168, 168),
      f(ayse.id, "Tahta_Fotografi.jpg", 3.4 * MB, "image/jpeg", 12, 12),
      f(ayse.id, "Hafta5_Ders_Notlari.pdf", 3.9 * MB, "application/pdf", 7 * day / min, 7 * day / min),
      f(ayse.id, "Ara_Sinav_Cevaplar.pdf", 1.1 * MB, "application/pdf", 11 * day / min, 11 * day / min),
      f(ayse.id, "Proje_Sablonu.zip", 54 * MB, "application/zip", null, 14 * day / min),
      f(others[0].id, "Diferansiyel_Denklemler_H4.pdf", 6 * MB, "application/pdf", 20, 20),
      f(others[1].id, "Lab_Foyu_4.docx", 0.6 * MB, "application/msword", 90, 90),
    ],
    session: null,
    failed: [],
  };
}

let db: DB = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* yoksay */
  }
  return seed();
})();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* yoksay */
  }
};
const blobs = new Map<string, Blob>();

export function resetDemo() {
  db = seed();
  blobs.clear();
  save();
  location.reload();
}

const isActiveFile = (f: FileItem, now = Date.now()) => f.sharedAt !== null && now - f.sharedAt < SHARE_DURATION_MS;

function sessionUser(): DemoUser {
  const u = db.users.find((x) => x.id === db.session);
  if (!u || u.status !== "active") throw new ApiError("unauthorized", "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.");
  return u;
}
function toMe(u: DemoUser): Me {
  const { password: _p, createdAt: _c, ...rest } = u;
  return { ...rest, code: u.role === "academic" && u.code ? u.code : null };
}
function requireAdmin() {
  if (sessionUser().role !== "admin") throw new ApiError("forbidden", "Bu işlem için yetkiniz yok.");
}
function ownFile(id: string) {
  const u = sessionUser();
  const f = db.files.find((x) => x.id === id && x.ownerId === u.id);
  if (!f) throw new ApiError("not_found", "Dosya bulunamadı.");
  return f;
}
function validate(p: AcademicProfile, password: string) {
  if (!(ACADEMIC_TITLES as readonly string[]).includes(p.title)) throw new ApiError("invalid", "Lütfen unvanınızı seçin.");
  if (p.name.trim().length < 3) throw new ApiError("invalid", "Ad Soyad en az 3 karakter olmalı.");
  if (p.faculty.trim().length < 2) throw new ApiError("invalid", "Fakülte / yüksekokul gerekli.");
  if (p.department.trim().length < 2) throw new ApiError("invalid", "Bölüm gerekli.");
  if (password.length < 8) throw new ApiError("invalid", "Şifre en az 8 karakter olmalı.");
  if (db.users.some((u) => u.email === p.email.trim().toLowerCase())) throw new ApiError("exists", "Bu e-posta ile zaten bir hesap var.");
}
function addUser(p: AcademicProfile, password: string, status: AccountStatus) {
  db.users.push({
    id: uid(), role: "academic", status, title: p.title, name: p.name.trim(), email: p.email.trim().toLowerCase(), faculty: p.faculty.trim(), department: p.department.trim(),
    password, code: status === "active" ? sixDigits(new Set(db.users.map((x) => x.code))) : "", createdAt: Date.now(),
  });
  save();
}
function fakeDownload(f: FileItem) {
  const blob = blobs.get(f.id) ?? new Blob([`3Saat tanıtım sürümü\n\n"${f.name}" için örnek içerik. Gerçek sistemde dosya kapalı depodan 2 dakika geçerli bir bağlantıyla iner.\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  startDownload(url, blobs.has(f.id) ? f.name : `${f.name}.ornek.txt`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function ownerByCode(code: string) {
  const now = Date.now();
  db.failed = db.failed.filter((t) => now - t < CODE_ATTEMPT_WINDOW_MS);
  if (db.failed.length >= CODE_MAX_FAILED) throw new ApiError("rate_limited", "Çok fazla hatalı deneme.", db.failed[0] + CODE_ATTEMPT_WINDOW_MS);
  const owner = /^\d{6}$/.test(code) ? db.users.find((u) => u.code === code && u.status === "active" && u.role === "academic") : undefined;
  if (!owner) {
    db.failed.push(now);
    save();
    throw new ApiError("not_found", "Ders kodu bulunamadı. Lütfen kontrol edip tekrar deneyin.");
  }
  return owner;
}

export const demoBackend: Backend = {
  demo: true,
  config: async () => ({ allowedEmailDomain: DEMO_EMAIL_DOMAIN }),

  me: async () => {
    const u = db.users.find((x) => x.id === db.session);
    return u && u.status === "active" ? toMe(u) : null;
  },
  login: async (email, password) => {
    await wait();
    const u = db.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || u.password !== password) throw new ApiError("invalid", "E-posta veya şifre hatalı.");
    if (u.status === "pending") throw new ApiError("pending", "Hesabınız yönetici onayı bekliyor.");
    if (u.status === "disabled") throw new ApiError("inactive", "Hesabınız yönetici tarafından dondurulmuş.");
    db.session = u.id;
    save();
    return toMe(u);
  },
  logout: async () => {
    db.session = null;
    save();
  },
  register: async (p, password) => {
    await wait();
    if (!isAllowedEmail(p.email, DEMO_EMAIL_DOMAIN)) throw new ApiError("domain", `Sadece @${DEMO_EMAIL_DOMAIN} uzantılı kurumsal e-posta ile kayıt olunabilir.`);
    validate(p, password);
    addUser(p, password, "pending");
  },
  updateProfile: async (p) => {
    await wait();
    const u = sessionUser();
    if (!(ACADEMIC_TITLES as readonly string[]).includes(p.title)) throw new ApiError("invalid", "Lütfen unvanınızı seçin.");
    if (p.name.trim().length < 3) throw new ApiError("invalid", "Ad Soyad en az 3 karakter olmalı.");
    Object.assign(u, { title: p.title, name: p.name.trim(), faculty: p.faculty.trim(), department: p.department.trim() });
    save();
  },
  changePassword: async (currentPassword, newPassword) => {
    await wait();
    const u = sessionUser();
    if (currentPassword !== u.password) throw new ApiError("invalid", "Mevcut şifreniz hatalı.");
    if (newPassword.length < 8) throw new ApiError("invalid", "Yeni şifre en az 8 karakter olmalı.");
    u.password = newPassword;
    save();
  },

  regenerateCode: async () => {
    await wait();
    const u = sessionUser();
    u.code = sixDigits(new Set(db.users.map((x) => x.code)));
    save();
    return u.code;
  },
  myFiles: async () => {
    const u = sessionUser();
    return { files: db.files.filter((f) => f.ownerId === u.id).map(({ ownerId: _o, ...f }) => f), serverTime: Date.now() };
  },
  upload: async (file, onProgress) => {
    const u = sessionUser();
    if (file.size > MAX_FILE_BYTES) throw new ApiError("too_large", "Dosya 500 MB sınırını aşıyor.");
    const steps = 12 + Math.min(20, Math.floor(file.size / (4 * 1024 * 1024)));
    for (let i = 1; i <= steps; i++) {
      await wait(80);
      onProgress(Math.round((i / steps) * 100));
    }
    const rec: DemoFile = { id: uid(), ownerId: u.id, name: file.name, size: file.size, mime: file.type || "application/octet-stream", uploadedAt: Date.now(), sharedAt: Date.now() };
    blobs.set(rec.id, file);
    db.files.push(rec);
    save();
  },
  reshare: async (id) => {
    await wait(200);
    ownFile(id).sharedAt = Date.now();
    save();
  },
  stop: async (id) => {
    await wait(200);
    ownFile(id).sharedAt = null;
    save();
  },
  remove: async (id) => {
    await wait(200);
    ownFile(id);
    db.files = db.files.filter((f) => f.id !== id);
    blobs.delete(id);
    save();
  },
  downloadOwn: async (id) => fakeDownload(ownFile(id)),

  studentFiles: async (code) => {
    await wait(450);
    const owner = ownerByCode(code);
    const now = Date.now();
    return {
      ownerName: owner.title ? `${owner.title} ${owner.name}` : owner.name,
      ownerDepartment: owner.department,
      files: db.files
        .filter((f) => f.ownerId === owner.id && isActiveFile(f, now))
        .sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0))
        .map(({ id, name, size, mime }) => ({ id, name, size, mime })),
    };
  },
  studentDownload: async (code, fileId) => {
    await wait(150);
    const owner = ownerByCode(code);
    const f = db.files.find((x) => x.id === fileId && x.ownerId === owner.id);
    if (!f) throw new ApiError("not_found", "Dosya bulunamadı.");
    if (!isActiveFile(f)) throw new ApiError("expired", "Bu dosyanın paylaşım süresi doldu.");
    fakeDownload(f);
  },

  admin: {
    academics: async () => {
      requireAdmin();
      const now = Date.now();
      return db.users
        .filter((u) => u.role === "academic")
        .map((u): AcademicRow => {
          const fs = db.files.filter((f) => f.ownerId === u.id);
          return {
            id: u.id, email: u.email, status: u.status, title: u.title, name: u.name, faculty: u.faculty, department: u.department, createdAt: u.createdAt,
            fileCount: fs.length, activeCount: fs.filter((f) => isActiveFile(f, now)).length, bytes: fs.reduce((s, f) => s + f.size, 0),
          };
        })
        .sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt - a.createdAt);
    },
    stats: async () => {
      requireAdmin();
      const now = Date.now();
      const ac = db.users.filter((u) => u.role === "academic");
      return {
        academics: ac.length,
        pending: ac.filter((u) => u.status === "pending").length,
        activeFiles: db.files.filter((f) => isActiveFile(f, now)).length,
        bytes: db.files.reduce((s, f) => s + f.size, 0),
      };
    },
    create: async (p, password) => {
      await wait();
      requireAdmin();
      if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) throw new ApiError("invalid", "Geçerli bir e-posta girin.");
      validate(p, password);
      addUser(p, password, "active");
    },
    approve: async (id) => {
      await wait(250);
      requireAdmin();
      const u = db.users.find((x) => x.id === id && x.status === "pending");
      if (!u) throw new ApiError("state", "Bu hesap onay beklemiyor.");
      u.status = "active";
      u.code = sixDigits(new Set(db.users.map((x) => x.code)));
      save();
    },
    setActive: async (id, active) => {
      await wait(250);
      requireAdmin();
      const u = db.users.find((x) => x.id === id && x.role === "academic");
      if (u && u.status !== "pending") u.status = active ? "active" : "disabled";
      save();
    },
    resetPassword: async (id) => {
      await wait();
      requireAdmin();
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new ApiError("not_found", "Akademisyen bulunamadı.");
      const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const buf = crypto.getRandomValues(new Uint8Array(10));
      u.password = Array.from(buf, (b) => chars[b % chars.length]).join("");
      save();
      return u.password;
    },
    remove: async (id) => {
      await wait();
      requireAdmin();
      db.users = db.users.filter((u) => u.id !== id);
      db.files = db.files.filter((f) => f.ownerId !== id);
      save();
    },
  },
};
