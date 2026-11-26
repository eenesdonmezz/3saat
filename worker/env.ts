export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;

  ALLOWED_EMAIL_DOMAIN: string;
  R2_BUCKET_NAME: string;
  ARCHIVE_RETENTION_DAYS: string;

  // Gizli değişkenler
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  IP_HASH_SALT?: string;

  /** Sadece yerel geliştirme: "1" ise R2 anahtarları olmadan dosyalar Worker üzerinden taşınır */
  DEV_MODE?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: "admin" | "academic";
  status: "pending" | "active" | "disabled";
  title: string;
  name: string;
  faculty: string;
  department: string;
}
