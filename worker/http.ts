/** Ortak HTTP yardımcıları: hatalar, oturum, istek doğrulama. */
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { z } from "zod";
import type { Env, SessionUser } from "./env";
import { randomToken, sha256Hex } from "./crypto";

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
export type Ctx = Context<AppEnv>;

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const SESSION_COOKIE = "__Host-3saat";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** İstek gövdesini zod şemasıyla doğrular; hatada genel bir mesaj döner. */
export async function body<T extends z.ZodTypeAny>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "bad_request", "Geçersiz istek.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "invalid", r.error.issues[0]?.message || "Geçersiz bilgi.");
  return r.data;
}

/** İsteği yapanın IP adresinin tuzlu özeti (IP'nin kendisi saklanmaz). */
export async function clientKey(c: Ctx, extra = ""): Promise<string> {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "yerel";
  return sha256Hex(`${c.env.IP_HASH_SALT || "3saat"}|${ip}|${extra}`);
}

export async function createSession(c: Ctx, userId: string) {
  const token = randomToken(32);
  const now = Date.now();
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now + SESSION_TTL_MS, now)
    .run();
  setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: SESSION_TTL_MS / 1000 });
}

export async function destroySession(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

export async function loadUser(c: Ctx): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.status, u.title, u.name, u.faculty, u.department
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256Hex(token), Date.now())
    .first<SessionUser>();
  return row ?? null;
}

/** Giriş yapmış ve hesabı aktif kullanıcı ister. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = await loadUser(c);
  if (!u) throw new HttpError(401, "unauthorized", "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.");
  if (u.status !== "active") throw new HttpError(403, u.status === "pending" ? "pending" : "inactive", u.status === "pending" ? "Hesabınız yönetici onayı bekliyor." : "Hesabınız dondurulmuş.");
  c.set("user", u);
  await next();
};

export const requireAcademic: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "academic") throw new HttpError(403, "forbidden", "Bu işlem için yetkiniz yok.");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") throw new HttpError(403, "forbidden", "Bu işlem için yetkiniz yok.");
  await next();
};

/**
 * CSRF koruması: veri değiştiren isteklerde Origin başlığı sitenin kendisi olmalı.
 * (Oturum çerezi ayrıca SameSite=Lax.)
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const host = new URL(c.req.url).host;
    let ok = false;
    try {
      ok = !!origin && new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(403, "forbidden", "İstek reddedildi.");
  }
  await next();
};
