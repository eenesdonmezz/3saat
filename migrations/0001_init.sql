-- 3Saat veritabanı şeması (Cloudflare D1 / SQLite)
-- Zamanlar milisaniye cinsinden Unix zamanıdır.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,              -- pbkdf2$sha256$<iterasyon>$<tuz>$<hash>
  role          TEXT NOT NULL CHECK (role IN ('admin', 'academic')),
  status        TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  title         TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  faculty       TEXT NOT NULL DEFAULT '',
  department    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  approved_at   INTEGER
);

-- Her akademisyenin tek, benzersiz 6 haneli ders kodu (onaylanınca oluşur)
CREATE TABLE course_codes (
  owner_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE CHECK (length(code) = 6),
  updated_at INTEGER NOT NULL
);

CREATE TABLE files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  r2_key        TEXT NOT NULL UNIQUE,
  size_bytes    INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
  shared_at     INTEGER,                    -- NULL: paylaşım durdurulmuş
  created_at    INTEGER NOT NULL
);
CREATE INDEX files_owner_idx ON files(owner_id, status, shared_at);

-- Oturumlar: tarayıcıdaki çerez değerinin SHA-256 özeti saklanır, kendisi saklanmaz
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Hız sınırlama: ders kodu ve giriş denemeleri (IP adresi tuzlu özet olarak)
CREATE TABLE attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('code', 'login')),
  key_hash   TEXT NOT NULL,
  success    INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX attempts_lookup_idx ON attempts(kind, key_hash, created_at);
