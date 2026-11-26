/**
 * Dosya deposu (Cloudflare R2).
 *
 * Dosyalar Worker'dan geçmez: tarayıcı kısa ömürlü, imzalı bir bağlantıyla
 * doğrudan R2'ye yükler ve R2'den indirir. Kova herkese kapalıdır.
 *
 * DEV_MODE=1 iken (sadece yerel geliştirme) R2 anahtarı olmadan çalışabilmek
 * için yükleme/indirme Worker üzerinden yapılır.
 */
import { AwsClient } from "aws4fetch";
import type { Env } from "./env";
import { hmacHex } from "./crypto";

export const UPLOAD_URL_TTL_S = 15 * 60;
export const STUDENT_DOWNLOAD_TTL_S = 2 * 60;
export const OWNER_DOWNLOAD_TTL_S = 5 * 60;

export class StorageNotConfigured extends Error {}

function isDev(env: Env) {
  return env.DEV_MODE === "1";
}

function client(env: Env) {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new StorageNotConfigured();
  return new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
}

function objectUrl(env: Env, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(env.R2_BUCKET_NAME)}/${path}`);
}

/** RFC 6266 uyumlu, Türkçe karakterleri koruyan indirme başlığı */
export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function presignUpload(env: Env, origin: string, key: string, size: number, mime: string): Promise<{ url: string; headers: Record<string, string> }> {
  if (isDev(env)) {
    const exp = Date.now() + UPLOAD_URL_TTL_S * 1000;
    const sig = await hmacHex(devSecret(env), `PUT\n${key}\n${size}\n${exp}`);
    return { url: `${origin}/api/dev/object?key=${encodeURIComponent(key)}&size=${size}&exp=${exp}&sig=${sig}`, headers: { "Content-Type": mime } };
  }
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_S));
  // content-length imzaya dahil edilir: başka boyutta dosya yüklenemez.
  const signed = await client(env).sign(new Request(url, { method: "PUT", headers: { "content-length": String(size) } }), {
    aws: { signQuery: true, allHeaders: true },
  });
  return { url: signed.url, headers: { "Content-Type": mime } };
}

export async function presignDownload(env: Env, origin: string, key: string, filename: string, ttlSeconds: number): Promise<string> {
  if (isDev(env)) {
    const exp = Date.now() + ttlSeconds * 1000;
    const sig = await hmacHex(devSecret(env), `GET\n${key}\n${filename}\n${exp}`);
    return `${origin}/api/dev/object?key=${encodeURIComponent(key)}&name=${encodeURIComponent(filename)}&exp=${exp}&sig=${sig}`;
  }
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  url.searchParams.set("response-content-disposition", contentDisposition(filename));
  const signed = await client(env).sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

/** Dosyanın gerçekten yüklendiğini ve boyutunu kontrol eder (R2 binding üzerinden). */
export async function headObject(env: Env, key: string): Promise<number | null> {
  const obj = await env.BUCKET.head(key);
  return obj ? obj.size : null;
}

export async function deleteObjects(env: Env, keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
}

export function storageReady(env: Env) {
  return isDev(env) || Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

export function devSecret(env: Env) {
  return env.IP_HASH_SALT || "yerel-gelistirme";
}
