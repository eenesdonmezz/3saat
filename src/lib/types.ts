export type Role = "admin" | "academic";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Prototip içindir. Gerçek sistemde şifreler Supabase Auth'ta hash'li tutulur. */
  password: string;
  role: Role;
  active: boolean;
  code: string;
  createdAt: number;
}

export interface FileRecord {
  id: string;
  ownerId: string;
  name: string;
  size: number;
  mime: string;
  uploadedAt: number;
  /** Paylaşım anı. null ise paylaşım durdurulmuş demektir. */
  sharedAt: number | null;
}

/** Öğrenciye dönen dosya bilgisi: sadece ad, boyut ve tür. */
export interface PublicFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}
