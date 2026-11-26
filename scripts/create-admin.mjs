#!/usr/bin/env node
/**
 * İlk yöneticiyi oluşturur (veya mevcut bir hesaba yönetici şifresi atar).
 *
 * Kullanım:
 *   npm run admin:create -- --email ad@ornek.edu.tr --name "Ad Soyad"           (canlı veritabanı)
 *   npm run admin:create -- --email ad@ornek.edu.tr --name "Ad Soyad" --local   (yerel geliştirme)
 *
 * Geçici şifre sadece bu terminalde gösterilir; ilk girişten sonra değiştirin.
 */
import { spawnSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = (get("email") || "").trim().toLowerCase();
const name = (get("name") || "").trim();
const local = args.includes("--local");
const db = get("db") || "3saat";

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) {
  console.error('Kullanım: npm run admin:create -- --email ad@ornek.edu.tr --name "Ad Soyad" [--local]');
  process.exit(1);
}

const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pwBytes = crypto.getRandomValues(new Uint8Array(14));
const password = Array.from(pwBytes, (b) => chars[b % chars.length]).join("");

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256));
const b64 = (u) => Buffer.from(u).toString("base64");
const hash = `pbkdf2$sha256$100000$${b64(salt)}$${b64(bits)}`;

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = Date.now();
const sql =
  `INSERT INTO users (id, email, password_hash, role, status, title, name, faculty, department, created_at, approved_at) ` +
  `VALUES (${q(crypto.randomUUID())}, ${q(email)}, ${q(hash)}, 'admin', 'active', '', ${q(name)}, '', 'Sistem Yöneticisi', ${now}, ${now}) ` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', status = 'active';`;

const r = spawnSync("npx", ["wrangler", "d1", "execute", db, local ? "--local" : "--remote", "--command", sql], { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" });
if (r.status !== 0) {
  console.error("Veritabanına yazılamadı.");
  process.exit(r.status ?? 1);
}
console.log(`\nYönetici hazır: ${email}\nGeçici şifre:   ${password}\n\nGiriş yaptıktan sonra Hesap ayarları'ndan şifrenizi değiştirin.`);
