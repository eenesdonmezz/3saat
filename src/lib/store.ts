/**
 * Prototip veri katmanı.
 *
 * Bu dosya, gerçek sistemde Supabase veritabanı + Edge Function'ların yapacağı
 * işleri tarayıcıda (localStorage) taklit eder. Fonksiyon adları ve davranışları
 * docs/MIMARI.md içindeki uç noktalarla birebir eşleşir; backend bağlandığında
 * sadece bu dosya değişecek, ekranlar aynı kalacak.
 */
import { MAX_FILE_BYTES, SHARE_DURATION_MS } from "./format";
import type { AcademicProfile, FileRecord, PublicFile, User } from "./types";
import { displayName } from "./types";
import { ACADEMIC_TITLES, ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "./config";

const KEY = "3saat-demo-v2";
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

interface DB {
  users: User[];
  files: FileRecord[];
  sessionUserId: string | null;
  failedAttempts: number[];
}

const uid = () => crypto.randomUUID();
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function secureCode(taken: Set<string>): string {
  const buf = new Uint32Array(1);
  let code = "";
  do {
    crypto.getRandomValues(buf);
    code = String(buf[0] % 1_000_000).padStart(6, "0");
  } while (taken.has(code));
  return code;
}

function seed(): DB {
  const now = Date.now();
  const min = 60 * 1000;
  const day = 24 * 60 * min;
  const admin: User = { id: uid(), title: "", name: "Enes", faculty: "", department: "Sistem Yöneticisi", email: "admin@3saat.demo", password: "demo1234", role: "admin", active: true, code: "100200", createdAt: now - 40 * day };
  const ayse: User = { id: uid(), title: "Dr. Öğr. Üyesi", name: "Ayşe Yılmaz", faculty: "Mühendislik ve Mimarlık Fakültesi", department: "Bilgisayar Mühendisliği", email: "ayse@3saat.demo", password: "demo1234", role: "academic", active: true, code: "482791", createdAt: now - 52 * day };
  const others: User[] = (
    [
      ["Prof. Dr.", "Mehmet Kaya", "Fen-Edebiyat Fakültesi", "Matematik", "mkaya@3saat.demo", "305618", true, 49],
      ["Öğr. Gör.", "Zeynep Demir", "Mühendislik ve Mimarlık Fakültesi", "Elektrik-Elektronik Mühendisliği", "zdemir@3saat.demo", "771204", true, 22],
      ["Doç. Dr.", "Ali Şahin", "İktisadi ve İdari Bilimler Fakültesi", "İşletme", "asahin@3saat.demo", "590331", true, 9],
      ["Öğr. Gör. Dr.", "Can Öztürk", "Meslek Yüksekokulu", "Bilgisayar Programcılığı", "cozturk@3saat.demo", "246810", false, 3],
    ] as const
  ).map(([title, name, faculty, department, email, code, active, d]) => ({ id: uid(), title, name, faculty, department, email, password: "demo1234", role: "academic" as const, active, code, createdAt: now - d * day }));
  const f = (ownerId: string, name: string, size: number, mime: string, sharedAgoMin: number | null, uploadedAgoMin: number): FileRecord => ({
    id: uid(), ownerId, name, size, mime, uploadedAt: now - uploadedAgoMin * min, sharedAt: sharedAgoMin === null ? null : now - sharedAgoMin * min,
  });
  const MB = 1024 * 1024;
  const files: FileRecord[] = [
    f(ayse.id, "Hafta6_Ders_Notlari.pdf", 4.2 * MB, "application/pdf", 54, 54),
    f(ayse.id, "Odev3_Sorular.docx", 0.8 * MB, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 40, 40),
    f(ayse.id, "Veri_Seti.xlsx", 2.1 * MB, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 30, 30),
    f(ayse.id, "Hafta6_Sunum.pptx", 38 * MB, "application/vnd.openxmlformats-officedocument.presentationml.presentation", 168, 168),
    f(ayse.id, "Tahta_Fotografi.jpg", 3.4 * MB, "image/jpeg", 12, 12),
    f(ayse.id, "Hafta5_Ders_Notlari.pdf", 3.9 * MB, "application/pdf", 7 * 24 * 60, 7 * 24 * 60),
    f(ayse.id, "Ara_Sinav_Cevaplar.pdf", 1.1 * MB, "application/pdf", 11 * 24 * 60, 11 * 24 * 60),
    f(ayse.id, "Proje_Sablonu.zip", 54 * MB, "application/zip", null, 14 * 24 * 60),
    f(others[0].id, "Diferansiyel_Denklemler_H4.pdf", 6 * MB, "application/pdf", 20, 20),
    f(others[1].id, "Lab_Foyu_4.docx", 0.6 * MB, "application/msword", 90, 90),
  ];
  return { users: [admin, ayse, ...others], files, sessionUserId: null, failedAttempts: [] };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* localStorage kullanılamıyorsa bellekte devam edilir */
  }
  return seed();
}

let db: DB = load();
const listeners = new Set<() => void>();
let version = 0;

function commit() {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* yoksay */
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getVersion = () => version;

export function resetDemo() {
  db = seed();
  blobs.clear();
  commit();
}

/** Bu oturumda yüklenen gerçek dosyaların içeriği (prototipte indirme gerçekten çalışsın diye). */
const blobs = new Map<string, Blob>();

export const isActive = (f: FileRecord, now = Date.now()) => f.sharedAt !== null && now - f.sharedAt < SHARE_DURATION_MS;
export const remainingMs = (f: FileRecord, now = Date.now()) => (f.sharedAt === null ? 0 : f.sharedAt + SHARE_DURATION_MS - now);

export class ApiError extends Error {
  constructor(public code: string, message: string, public retryAt?: number) {
    super(message);
  }
}

function triggerDownload(f: FileRecord) {
  const blob = blobs.get(f.id) ?? new Blob([`3Saat prototipi\n\nBu "${f.name}" dosyası için örnek içeriktir. Gerçek sistemde dosya Cloudflare R2'den 2 dakika geçerli bir linkle indirilir.\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = blobs.has(f.id) ? f.name : `${f.name}.ornek.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------------------------ */
/* Öğrenci (hesapsız) uç noktaları: student-files, student-download   */
/* ------------------------------------------------------------------ */

function checkRateLimit() {
  const now = Date.now();
  db.failedAttempts = db.failedAttempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
  if (db.failedAttempts.length >= MAX_FAILED_ATTEMPTS) {
    const retryAt = db.failedAttempts[0] + ATTEMPT_WINDOW_MS;
    throw new ApiError("rate_limited", "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.", retryAt);
  }
}

function findOwnerByCode(code: string): User | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  return db.users.find((u) => u.code === code && u.active && u.role === "academic");
}

export async function studentFiles(code: string): Promise<{ ownerName: string; ownerDepartment: string; files: PublicFile[] }> {
  await wait(500);
  checkRateLimit();
  const owner = findOwnerByCode(code);
  if (!owner) {
    db.failedAttempts.push(Date.now());
    commit();
    throw new ApiError("not_found", "Ders kodu bulunamadı. Lütfen kontrol edip tekrar deneyin.");
  }
  const now = Date.now();
  const files = db.files
    .filter((f) => f.ownerId === owner.id && isActive(f, now))
    .sort((a, b) => (b.sharedAt ?? 0) - (a.sharedAt ?? 0))
    .map(({ id, name, size, mime }) => ({ id, name, size, mime }));
  return { ownerName: displayName(owner), ownerDepartment: owner.department, files };
}

export async function studentDownload(code: string, fileId: string) {
  await wait(200);
  checkRateLimit();
  const owner = findOwnerByCode(code);
  const f = db.files.find((x) => x.id === fileId);
  if (!owner || !f || f.ownerId !== owner.id) throw new ApiError("not_found", "Dosya bulunamadı.");
  if (!isActive(f)) throw new ApiError("expired", "Bu dosyanın paylaşım süresi doldu.");
  triggerDownload(f);
}

/* ------------------------------------------------------------------ */
/* Oturum                                                             */
/* ------------------------------------------------------------------ */

export function currentUser(): User | null {
  return db.users.find((u) => u.id === db.sessionUserId) ?? null;
}

export async function login(email: string, password: string): Promise<User> {
  await wait();
  const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || u.password !== password) throw new ApiError("invalid", "E-posta veya şifre hatalı.");
  if (!u.active) throw new ApiError("inactive", "Hesabınız yönetici tarafından dondurulmuş.");
  db.sessionUserId = u.id;
  commit();
  return u;
}

export function logout() {
  db.sessionUserId = null;
  commit();
}

function validateProfile(p: AcademicProfile) {
  if (!(ACADEMIC_TITLES as readonly string[]).includes(p.title)) throw new ApiError("invalid", "Lütfen unvanınızı seçin.");
  if (p.name.trim().length < 3) throw new ApiError("invalid", "Ad Soyad en az 3 karakter olmalı.");
  if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) throw new ApiError("invalid", "Geçerli bir e-posta girin.");
  if (p.faculty.trim().length < 2) throw new ApiError("invalid", "Fakülte / yüksekokul gerekli.");
  if (p.department.trim().length < 2) throw new ApiError("invalid", "Bölüm gerekli.");
  if (db.users.some((u) => u.email.toLowerCase() === p.email.trim().toLowerCase())) throw new ApiError("exists", "Bu e-posta ile zaten bir hesap var.");
}

/** Kendi kendine kayıt: sadece kurum e-posta alan adı kabul edilir. */
export async function register(p: AcademicProfile, password: string) {
  await wait();
  if (!isAllowedEmail(p.email)) throw new ApiError("domain", `Sadece @${ALLOWED_EMAIL_DOMAIN} uzantılı kurumsal e-posta ile kayıt olunabilir.`);
  validateProfile(p);
  if (password.length < 8) throw new ApiError("weak", "Şifre en az 8 karakter olmalı.");
  createUser(p, password);
}

export async function requestPasswordReset(_email: string) {
  await wait();
}

function createUser(p: AcademicProfile, password: string): User {
  const u: User = {
    id: uid(), title: p.title, name: p.name.trim(), faculty: p.faculty.trim(), department: p.department.trim(),
    email: p.email.trim().toLowerCase(), password, role: "academic", active: true,
    code: secureCode(new Set(db.users.map((x) => x.code))), createdAt: Date.now(),
  };
  db.users.push(u);
  commit();
  return u;
}

function requireUser(): User {
  const u = currentUser();
  if (!u || !u.active) throw new ApiError("unauthorized", "Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
  return u;
}

/* ------------------------------------------------------------------ */
/* Akademisyen uç noktaları: upload-init/complete, file-action, ...   */
/* ------------------------------------------------------------------ */

export function myFiles(): FileRecord[] {
  const u = currentUser();
  if (!u) return [];
  return db.files.filter((f) => f.ownerId === u.id);
}

export async function uploadFile(file: File, onProgress: (pct: number) => void): Promise<void> {
  const u = requireUser();
  if (file.size > MAX_FILE_BYTES) throw new ApiError("too_large", "500 MB sınırını aşıyor");
  // Gerçekte: upload-init -> R2'ye presigned PUT (XHR ile ilerleme) -> upload-complete
  const steps = 12 + Math.min(20, Math.floor(file.size / (4 * 1024 * 1024)));
  for (let i = 1; i <= steps; i++) {
    await wait(90);
    onProgress(Math.round((i / steps) * 100));
  }
  const rec: FileRecord = { id: uid(), ownerId: u.id, name: file.name, size: file.size, mime: file.type || "application/octet-stream", uploadedAt: Date.now(), sharedAt: Date.now() };
  blobs.set(rec.id, file);
  db.files.push(rec);
  commit();
}

function ownFile(id: string): FileRecord {
  const u = requireUser();
  const f = db.files.find((x) => x.id === id && x.ownerId === u.id);
  if (!f) throw new ApiError("not_found", "Dosya bulunamadı.");
  return f;
}

export async function reshareFile(id: string) {
  await wait(250);
  ownFile(id).sharedAt = Date.now();
  commit();
}

export async function stopSharing(id: string) {
  await wait(250);
  ownFile(id).sharedAt = null;
  commit();
}

export async function deleteFile(id: string) {
  await wait(250);
  ownFile(id);
  db.files = db.files.filter((f) => f.id !== id);
  blobs.delete(id);
  commit();
}

export async function downloadOwnFile(id: string) {
  await wait(150);
  triggerDownload(ownFile(id));
}

export async function regenerateCode(): Promise<string> {
  await wait();
  const u = requireUser();
  u.code = secureCode(new Set(db.users.map((x) => x.code)));
  commit();
  return u.code;
}

export async function updateProfile(p: Omit<AcademicProfile, "email">, newPassword: string) {
  await wait();
  const u = requireUser();
  if (!(ACADEMIC_TITLES as readonly string[]).includes(p.title)) throw new ApiError("invalid", "Lütfen unvanınızı seçin.");
  if (p.name.trim().length < 3) throw new ApiError("invalid", "Ad Soyad en az 3 karakter olmalı.");
  if (p.faculty.trim().length < 2 || p.department.trim().length < 2) throw new ApiError("invalid", "Fakülte ve bölüm gerekli.");
  if (newPassword && newPassword.length < 8) throw new ApiError("weak", "Yeni şifre en az 8 karakter olmalı.");
  u.title = p.title;
  u.name = p.name.trim();
  u.faculty = p.faculty.trim();
  u.department = p.department.trim();
  if (newPassword) u.password = newPassword;
  commit();
}

/* ------------------------------------------------------------------ */
/* Yönetici uç noktası: admin-academics                               */
/* ------------------------------------------------------------------ */

function requireAdmin() {
  const u = requireUser();
  if (u.role !== "admin") throw new ApiError("forbidden", "Bu işlem için yetkiniz yok.");
}

export interface AcademicRow extends User {
  fileCount: number;
  activeCount: number;
  bytes: number;
}

export function listAcademics(): AcademicRow[] {
  if (currentUser()?.role !== "admin") return [];
  const now = Date.now();
  return db.users
    .filter((u) => u.role === "academic")
    .map((u) => {
      const fs = db.files.filter((f) => f.ownerId === u.id);
      return { ...u, fileCount: fs.length, activeCount: fs.filter((f) => isActive(f, now)).length, bytes: fs.reduce((s, f) => s + f.size, 0) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Yönetici ekleme: alan adı sınırı yoktur (ör. misafir öğretim üyeleri için). */
export async function adminCreateAcademic(p: AcademicProfile, tempPassword: string) {
  await wait();
  requireAdmin();
  validateProfile(p);
  if (tempPassword.length < 8) throw new ApiError("weak", "Geçici şifre en az 8 karakter olmalı.");
  createUser(p, tempPassword);
}

export async function adminSetActive(id: string, active: boolean) {
  await wait(250);
  requireAdmin();
  const u = db.users.find((x) => x.id === id && x.role === "academic");
  if (u) u.active = active;
  commit();
}

export async function adminResetPassword(_id: string) {
  await wait();
  requireAdmin();
}

export async function adminDeleteAcademic(id: string) {
  await wait();
  requireAdmin();
  db.users = db.users.filter((u) => u.id !== id);
  db.files = db.files.filter((f) => f.ownerId !== id);
  commit();
}

export function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

export function adminStats() {
  const now = Date.now();
  return {
    academics: db.users.filter((u) => u.role === "academic").length,
    activeFiles: db.files.filter((f) => isActive(f, now)).length,
    bytes: db.files.reduce((s, f) => s + f.size, 0),
  };
}
