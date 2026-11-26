/**
 * 3Saat API (Cloudflare Worker).
 *
 * /api/auth/*     giriş, kayıt, çıkış, oturum
 * /api/me/*       akademisyenin kendi hesabı, ders kodu, dosyaları
 * /api/student/*  hesapsız öğrenci erişimi (ders kodu ile)
 * /api/admin/*    yönetici işlemleri
 *
 * Diğer tüm yollar arayüzün statik dosyalarına gider (wrangler.jsonc > assets).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, SessionUser } from "./env";
import { DUMMY_HASH, hashPassword, hmacHex, randomSixDigits, tempPassword, uuid, verifyPassword } from "./crypto";
import { type AppEnv, type Ctx, HttpError, body, clientKey, createSession, destroySession, loadUser, requireAcademic, requireAdmin, requireUser, sameOrigin } from "./http";
import {
  OWNER_DOWNLOAD_TTL_S,
  STUDENT_DOWNLOAD_TTL_S,
  StorageNotConfigured,
  contentDisposition,
  deleteObjects,
  devSecret,
  headObject,
  presignDownload,
  presignUpload,
  storageReady,
} from "./storage";
import {
  ACADEMIC_TITLES,
  CODE_ATTEMPT_WINDOW_MS,
  CODE_MAX_FAILED,
  LOGIN_ATTEMPT_WINDOW_MS,
  LOGIN_MAX_FAILED,
  MAX_FILE_BYTES,
  MIN_PASSWORD_LENGTH,
  SHARE_DURATION_MS,
  isAllowedEmail,
} from "../shared/constants";

const app = new Hono<AppEnv>().basePath("/api");

/* ------------------------------------------------------------------ */
/* Genel                                                              */
/* ------------------------------------------------------------------ */

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});
app.use("*", sameOrigin);

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, code: err.code, ...err.extra }, err.status);
  if (err instanceof StorageNotConfigured) return c.json({ error: "Dosya deposu henüz yapılandırılmadı.", code: "storage" }, 503);
  console.error(err);
  return c.json({ error: "Beklenmeyen bir hata oluştu.", code: "server" }, 500);
});

app.notFound((c) => c.json({ error: "Bulunamadı.", code: "not_found" }, 404));

const now = () => Date.now();

const email = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Geçerli bir e-posta girin.");
const password = z.string().min(MIN_PASSWORD_LENGTH, `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`).max(200);
const profile = z.object({
  title: z.enum(ACADEMIC_TITLES, { message: "Lütfen unvanınızı seçin." }),
  name: z.string().trim().min(3, "Ad Soyad en az 3 karakter olmalı.").max(100),
  faculty: z.string().trim().min(2, "Fakülte / yüksekokul gerekli.").max(120),
  department: z.string().trim().min(2, "Bölüm gerekli.").max(120),
});
const id = z.string().uuid();

function publicUser(u: SessionUser) {
  return { id: u.id, email: u.email, role: u.role, status: u.status, title: u.title, name: u.name, faculty: u.faculty, department: u.department };
}

async function uniqueCode(env: Env): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomSixDigits();
    const taken = await env.DB.prepare("SELECT 1 FROM course_codes WHERE code = ?").bind(code).first();
    if (!taken) return code;
  }
  throw new Error("Benzersiz kod üretilemedi");
}

async function assignCode(env: Env, ownerId: string) {
  const code = await uniqueCode(env);
  await env.DB.prepare(
    "INSERT INTO course_codes (owner_id, code, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at",
  )
    .bind(ownerId, code, now())
    .run();
  return code;
}

/** Penceredeki hatalı deneme sayısı sınırı aştıysa 429 döner. */
async function checkAttempts(env: Env, kind: "code" | "login", key: string, windowMs: number, max: number) {
  const since = now() - windowMs;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS first FROM attempts WHERE kind = ? AND key_hash = ? AND success = 0 AND created_at > ?")
    .bind(kind, key, since)
    .first<{ n: number; first: number | null }>();
  if (r && r.n >= max) {
    const retryAt = (r.first ?? now()) + windowMs;
    throw new HttpError(429, "rate_limited", "Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.", { retryAt });
  }
}

async function recordAttempt(env: Env, kind: "code" | "login", key: string, success: boolean) {
  await env.DB.prepare("INSERT INTO attempts (kind, key_hash, success, created_at) VALUES (?, ?, ?, ?)").bind(kind, key, success ? 1 : 0, now()).run();
}

/* ------------------------------------------------------------------ */
/* Kimlik                                                             */
/* ------------------------------------------------------------------ */

app.get("/auth/me", async (c) => {
  const u = await loadUser(c);
  if (!u) return c.json({ user: null });
  const code = u.role === "academic" && u.status === "active" ? await c.env.DB.prepare("SELECT code FROM course_codes WHERE owner_id = ?").bind(u.id).first<{ code: string }>() : null;
  return c.json({ user: { ...publicUser(u), code: code?.code ?? null } });
});

app.get("/config", (c) => c.json({ allowedEmailDomain: c.env.ALLOWED_EMAIL_DOMAIN, storageReady: storageReady(c.env) }));

app.post("/auth/login", async (c) => {
  const b = await body(c, z.object({ email, password: z.string().min(1).max(200) }));
  const key = await clientKey(c, b.email);
  await checkAttempts(c.env, "login", key, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_MAX_FAILED);

  const row = await c.env.DB.prepare("SELECT id, password_hash, status FROM users WHERE email = ?").bind(b.email).first<{ id: string; password_hash: string; status: string }>();
  const ok = await verifyPassword(b.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    await recordAttempt(c.env, "login", key, false);
    throw new HttpError(401, "invalid", "E-posta veya şifre hatalı.");
  }
  await recordAttempt(c.env, "login", key, true);
  if (row.status === "pending") throw new HttpError(403, "pending", "Hesabınız yönetici onayı bekliyor.");
  if (row.status === "disabled") throw new HttpError(403, "inactive", "Hesabınız yönetici tarafından dondurulmuş.");
  await createSession(c, row.id);
  const u = await c.env.DB.prepare("SELECT id, email, role, status, title, name, faculty, department FROM users WHERE id = ?").bind(row.id).first<SessionUser>();
  return c.json({ user: publicUser(u!) });
});

app.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

/** Kendi kendine kayıt: sadece kurum e-postası; hesap yönetici onayına düşer. */
app.post("/auth/register", async (c) => {
  const b = await body(c, profile.extend({ email, password }));
  if (!isAllowedEmail(b.email, c.env.ALLOWED_EMAIL_DOMAIN)) {
    throw new HttpError(400, "domain", `Sadece @${c.env.ALLOWED_EMAIL_DOMAIN} uzantılı kurumsal e-posta ile kayıt olunabilir.`);
  }
  // Kayıt spam'ine karşı: IP başına giriş sınırını paylaşır
  const key = await clientKey(c, "register");
  await checkAttempts(c.env, "login", key, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_MAX_FAILED);
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(b.email).first();
  if (exists) {
    await recordAttempt(c.env, "login", key, false);
    throw new HttpError(409, "exists", "Bu e-posta ile zaten bir hesap var.");
  }
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role, status, title, name, faculty, department, created_at) VALUES (?, ?, ?, 'academic', 'pending', ?, ?, ?, ?, ?)",
  )
    .bind(uuid(), b.email, await hashPassword(b.password), b.title, b.name, b.faculty, b.department, now())
    .run();
  await recordAttempt(c.env, "login", key, false); // her kayıt sayılır: bir IP'den 15 dakikada en fazla 8 kayıt
  return c.json({ ok: true, status: "pending" });
});

/* ------------------------------------------------------------------ */
/* Akademisyen                                                        */
/* ------------------------------------------------------------------ */

const me = new Hono<AppEnv>();
me.use("*", requireUser);

me.patch("/profile", requireAcademic, async (c) => {
  const b = await body(c, profile);
  await c.env.DB.prepare("UPDATE users SET title = ?, name = ?, faculty = ?, department = ? WHERE id = ?").bind(b.title, b.name, b.faculty, b.department, c.get("user").id).run();
  return c.json({ ok: true });
});

me.post("/password", async (c) => {
  const u = c.get("user");
  const b = await body(c, z.object({ currentPassword: z.string().min(1, "Mevcut şifrenizi girin.").max(200), newPassword: password }));
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string }>();
  if (!(await verifyPassword(b.currentPassword, row!.password_hash))) throw new HttpError(400, "invalid", "Mevcut şifreniz hatalı.");
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(b.newPassword), u.id).run();
  // Diğer cihazlardaki oturumlar kapanır, bu cihazda yeni oturum açılır
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
  await createSession(c, u.id);
  return c.json({ ok: true });
});

me.use("/code/*", requireAcademic);
me.use("/files/*", requireAcademic);
me.use("/files", requireAcademic);

me.post("/code/regenerate", async (c) => {
  const code = await assignCode(c.env, c.get("user").id);
  return c.json({ code });
});

interface FileRow {
  id: string;
  original_name: string;
  size_bytes: number;
  mime_type: string;
  shared_at: number | null;
  created_at: number;
  r2_key: string;
  owner_id: string;
}

const fileOut = (f: FileRow) => ({ id: f.id, name: f.original_name, size: f.size_bytes, mime: f.mime_type, sharedAt: f.shared_at, uploadedAt: f.created_at });

me.get("/files", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM files WHERE owner_id = ? AND status = 'ready' ORDER BY COALESCE(shared_at, created_at) DESC")
    .bind(c.get("user").id)
    .all<FileRow>();
  return c.json({ files: results.map(fileOut), serverTime: now() });
});

const cleanName = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .trim()
    .slice(0, 200) || "dosya";

me.post("/files/upload-init", async (c) => {
  const b = await body(
    c,
    z.object({
      name: z.string().min(1).max(255),
      size: z.number().int().positive(),
      mime: z.string().max(200).optional(),
    }),
  );
  if (b.size > MAX_FILE_BYTES) throw new HttpError(413, "too_large", "Dosya 500 MB sınırını aşıyor.");
  const u = c.get("user");
  const fileId = uuid();
  const key = `${u.id}/${fileId}`;
  const mime = b.mime && /^[\w.+-]+\/[\w.+-]+$/.test(b.mime) ? b.mime : "application/octet-stream";
  const upload = await presignUpload(c.env, new URL(c.req.url).origin, key, b.size, mime);
  await c.env.DB.prepare(
    "INSERT INTO files (id, owner_id, original_name, r2_key, size_bytes, mime_type, status, shared_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?)",
  )
    .bind(fileId, u.id, cleanName(b.name), key, b.size, mime, now())
    .run();
  return c.json({ fileId, uploadUrl: upload.url, headers: upload.headers });
});

async function ownFile(c: Ctx, fileId: string, status: "ready" | "pending" = "ready") {
  if (!id.safeParse(fileId).success) throw new HttpError(404, "not_found", "Dosya bulunamadı.");
  const f = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND owner_id = ? AND status = ?").bind(fileId, c.get("user").id, status).first<FileRow>();
  if (!f) throw new HttpError(404, "not_found", "Dosya bulunamadı.");
  return f;
}

me.post("/files/:id/complete", async (c) => {
  const f = await ownFile(c, c.req.param("id"), "pending");
  const size = await headObject(c.env, f.r2_key);
  if (size === null) throw new HttpError(400, "not_uploaded", "Dosya yüklenemedi. Lütfen tekrar deneyin.");
  if (size !== f.size_bytes || size > MAX_FILE_BYTES) {
    await deleteObjects(c.env, [f.r2_key]);
    await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
    throw new HttpError(400, "size_mismatch", "Dosya boyutu doğrulanamadı.");
  }
  const t = now();
  await c.env.DB.prepare("UPDATE files SET status = 'ready', shared_at = ? WHERE id = ?").bind(t, f.id).run();
  return c.json({ file: fileOut({ ...f, shared_at: t }) });
});

me.post("/files/:id/reshare", async (c) => {
  const f = await ownFile(c, c.req.param("id"));
  const t = now();
  await c.env.DB.prepare("UPDATE files SET shared_at = ? WHERE id = ?").bind(t, f.id).run();
  return c.json({ file: fileOut({ ...f, shared_at: t }) });
});

me.post("/files/:id/stop", async (c) => {
  const f = await ownFile(c, c.req.param("id"));
  await c.env.DB.prepare("UPDATE files SET shared_at = NULL WHERE id = ?").bind(f.id).run();
  return c.json({ file: fileOut({ ...f, shared_at: null }) });
});

me.delete("/files/:id", async (c) => {
  const f = await ownFile(c, c.req.param("id"));
  await deleteObjects(c.env, [f.r2_key]);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
  return c.json({ ok: true });
});

me.get("/files/:id/download", async (c) => {
  const f = await ownFile(c, c.req.param("id"));
  const url = await presignDownload(c.env, new URL(c.req.url).origin, f.r2_key, f.original_name, OWNER_DOWNLOAD_TTL_S);
  return c.json({ url });
});

app.route("/me", me);

/* ------------------------------------------------------------------ */
/* Öğrenci (hesapsız)                                                 */
/* ------------------------------------------------------------------ */

const codeSchema = z.string().regex(/^\d{6}$/, "Ders kodu 6 haneli olmalı.");

async function ownerByCode(c: Ctx, code: string) {
  const key = await clientKey(c);
  await checkAttempts(c.env, "code", key, CODE_ATTEMPT_WINDOW_MS, CODE_MAX_FAILED);
  const owner = await c.env.DB.prepare(
    `SELECT u.id, u.title, u.name, u.department FROM course_codes cc
       JOIN users u ON u.id = cc.owner_id
      WHERE cc.code = ? AND u.status = 'active' AND u.role = 'academic'`,
  )
    .bind(code)
    .first<{ id: string; title: string; name: string; department: string }>();
  if (!owner) {
    await recordAttempt(c.env, "code", key, false);
    throw new HttpError(404, "not_found", "Ders kodu bulunamadı. Lütfen kontrol edip tekrar deneyin.");
  }
  return owner;
}

app.post("/student/files", async (c) => {
  const b = await body(c, z.object({ code: codeSchema }));
  const owner = await ownerByCode(c, b.code);
  const { results } = await c.env.DB.prepare(
    "SELECT id, original_name, size_bytes, mime_type FROM files WHERE owner_id = ? AND status = 'ready' AND shared_at > ? ORDER BY shared_at DESC",
  )
    .bind(owner.id, now() - SHARE_DURATION_MS)
    .all<{ id: string; original_name: string; size_bytes: number; mime_type: string }>();
  // Öğrenciye sadece gerekenler: dosya adı, boyutu, türü ve akademisyenin unvanı/adı/bölümü
  return c.json({
    ownerName: owner.title ? `${owner.title} ${owner.name}` : owner.name,
    ownerDepartment: owner.department,
    files: results.map((f) => ({ id: f.id, name: f.original_name, size: f.size_bytes, mime: f.mime_type })),
  });
});

app.post("/student/download", async (c) => {
  const b = await body(c, z.object({ code: codeSchema, fileId: id }));
  const owner = await ownerByCode(c, b.code);
  const f = await c.env.DB.prepare("SELECT r2_key, original_name, shared_at FROM files WHERE id = ? AND owner_id = ? AND status = 'ready'")
    .bind(b.fileId, owner.id)
    .first<{ r2_key: string; original_name: string; shared_at: number | null }>();
  if (!f) throw new HttpError(404, "not_found", "Dosya bulunamadı.");
  if (f.shared_at === null || f.shared_at <= now() - SHARE_DURATION_MS) throw new HttpError(404, "expired", "Bu dosyanın paylaşım süresi doldu.");
  const url = await presignDownload(c.env, new URL(c.req.url).origin, f.r2_key, f.original_name, STUDENT_DOWNLOAD_TTL_S);
  return c.json({ url });
});

/* ------------------------------------------------------------------ */
/* Yönetici                                                           */
/* ------------------------------------------------------------------ */

const admin = new Hono<AppEnv>();
admin.use("*", requireUser, requireAdmin);

admin.get("/academics", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.status, u.title, u.name, u.faculty, u.department, u.created_at,
            COUNT(f.id) AS file_count,
            COALESCE(SUM(CASE WHEN f.shared_at > ? THEN 1 ELSE 0 END), 0) AS active_count,
            COALESCE(SUM(f.size_bytes), 0) AS bytes
       FROM users u LEFT JOIN files f ON f.owner_id = u.id AND f.status = 'ready'
      WHERE u.role = 'academic'
      GROUP BY u.id
      ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC`,
  )
    .bind(now() - SHARE_DURATION_MS)
    .all();
  return c.json({ academics: results });
});

admin.get("/stats", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'academic') AS academics,
            (SELECT COUNT(*) FROM users WHERE role = 'academic' AND status = 'pending') AS pending,
            (SELECT COUNT(*) FROM files WHERE status = 'ready' AND shared_at > ?) AS active_files,
            (SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE status = 'ready') AS bytes`,
  )
    .bind(now() - SHARE_DURATION_MS)
    .first();
  return c.json(r);
});

/** Yönetici ekleme: alan adı sınırı yok (misafir öğretim üyeleri için), hesap hemen aktif. */
admin.post("/academics", async (c) => {
  const b = await body(c, profile.extend({ email, password }));
  const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(b.email).first();
  if (exists) throw new HttpError(409, "exists", "Bu e-posta ile zaten bir hesap var.");
  const userId = uuid();
  const t = now();
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role, status, title, name, faculty, department, created_at, approved_at) VALUES (?, ?, ?, 'academic', 'active', ?, ?, ?, ?, ?, ?)",
  )
    .bind(userId, b.email, await hashPassword(b.password), b.title, b.name, b.faculty, b.department, t, t)
    .run();
  await assignCode(c.env, userId);
  return c.json({ ok: true, id: userId });
});

async function academic(c: Ctx, userId: string) {
  if (!id.safeParse(userId).success) throw new HttpError(404, "not_found", "Akademisyen bulunamadı.");
  const u = await c.env.DB.prepare("SELECT id, status FROM users WHERE id = ? AND role = 'academic'").bind(userId).first<{ id: string; status: string }>();
  if (!u) throw new HttpError(404, "not_found", "Akademisyen bulunamadı.");
  return u;
}

admin.post("/academics/:id/approve", async (c) => {
  const u = await academic(c, c.req.param("id"));
  if (u.status !== "pending") throw new HttpError(409, "state", "Bu hesap onay beklemiyor.");
  await c.env.DB.prepare("UPDATE users SET status = 'active', approved_at = ? WHERE id = ?").bind(now(), u.id).run();
  await assignCode(c.env, u.id);
  return c.json({ ok: true });
});

admin.post("/academics/:id/status", async (c) => {
  const u = await academic(c, c.req.param("id"));
  const b = await body(c, z.object({ active: z.boolean() }));
  if (u.status === "pending") throw new HttpError(409, "state", "Önce hesabı onaylayın.");
  await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(b.active ? "active" : "disabled", u.id).run();
  if (!b.active) await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
  return c.json({ ok: true });
});

/** E-posta servisi olmadığından yönetici geçici şifre üretir ve akademisyene iletir. */
admin.post("/academics/:id/reset-password", async (c) => {
  const u = await academic(c, c.req.param("id"));
  const pw = tempPassword();
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(pw), u.id).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
  return c.json({ tempPassword: pw });
});

admin.delete("/academics/:id", async (c) => {
  const u = await academic(c, c.req.param("id"));
  const { results } = await c.env.DB.prepare("SELECT r2_key FROM files WHERE owner_id = ?").bind(u.id).all<{ r2_key: string }>();
  await deleteObjects(c.env, results.map((r) => r.r2_key));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM files WHERE owner_id = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM course_codes WHERE owner_id = ?").bind(u.id),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
  ]);
  return c.json({ ok: true });
});

app.route("/admin", admin);

/* ------------------------------------------------------------------ */
/* Sadece yerel geliştirme: R2 anahtarı olmadan dosya taşıma          */
/* ------------------------------------------------------------------ */

app.on(["PUT", "GET"], "/dev/object", async (c) => {
  if (c.env.DEV_MODE !== "1") throw new HttpError(404, "not_found", "Bulunamadı.");
  const q = c.req.query();
  const exp = Number(q.exp);
  if (!q.key || !q.sig || !(exp > now())) throw new HttpError(403, "forbidden", "Bağlantının süresi doldu.");
  if (c.req.method === "PUT") {
    const expected = await hmacHex(devSecret(c.env), `PUT\n${q.key}\n${q.size}\n${exp}`);
    if (expected !== q.sig) throw new HttpError(403, "forbidden", "Geçersiz bağlantı.");
    const data = await c.req.arrayBuffer();
    if (data.byteLength !== Number(q.size)) throw new HttpError(400, "size_mismatch", "Boyut uyuşmuyor.");
    await c.env.BUCKET.put(q.key, data, { httpMetadata: { contentType: c.req.header("Content-Type") || "application/octet-stream" } });
    return c.body(null, 200);
  }
  const expected = await hmacHex(devSecret(c.env), `GET\n${q.key}\n${q.name}\n${exp}`);
  if (expected !== q.sig) throw new HttpError(403, "forbidden", "Geçersiz bağlantı.");
  const obj = await c.env.BUCKET.get(q.key);
  if (!obj) throw new HttpError(404, "not_found", "Dosya bulunamadı.");
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream", "Content-Disposition": contentDisposition(q.name || "dosya") } });
});

/* ------------------------------------------------------------------ */
/* Gece temizliği                                                     */
/* ------------------------------------------------------------------ */

async function cleanup(env: Env) {
  const t = now();
  const day = 24 * 60 * 60 * 1000;
  // Yarım kalan yüklemeler
  const pending = await env.DB.prepare("SELECT id, r2_key FROM files WHERE status = 'pending' AND created_at < ?").bind(t - day).all<{ id: string; r2_key: string }>();
  // Arşiv saklama süresi (0 = kapalı)
  const days = Number(env.ARCHIVE_RETENTION_DAYS || "0");
  const old =
    days > 0
      ? await env.DB.prepare("SELECT id, r2_key FROM files WHERE status = 'ready' AND COALESCE(shared_at, created_at) < ?").bind(t - days * day).all<{ id: string; r2_key: string }>()
      : { results: [] as { id: string; r2_key: string }[] };
  const doomed = [...pending.results, ...old.results];
  if (doomed.length) {
    await deleteObjects(env, doomed.map((f) => f.r2_key));
    for (let i = 0; i < doomed.length; i += 50) {
      const ids = doomed.slice(i, i + 50).map((f) => f.id);
      await env.DB.prepare(`DELETE FROM files WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
    }
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t),
    env.DB.prepare("DELETE FROM attempts WHERE created_at < ?").bind(t - day),
  ]);
}

export default {
  fetch: app.fetch,
  scheduled: async (_e: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;

export { app };
