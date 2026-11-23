export type Role = "admin" | "academic";

export interface User {
  id: string;
  /** Unvan, ör. "Doç. Dr." (yönetici için boş) */
  title: string;
  name: string;
  faculty: string;
  department: string;
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

export interface AcademicProfile {
  title: string;
  name: string;
  email: string;
  faculty: string;
  department: string;
}

export const displayName = (u: Pick<User, "title" | "name">) => (u.title ? `${u.title} ${u.name}` : u.name);
