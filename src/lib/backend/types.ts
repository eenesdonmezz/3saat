/**
 * Arayüzün konuştuğu arka uç sözleşmesi.
 * İki uygulaması var: `http` (gerçek Cloudflare Worker API) ve `demo` (tarayıcıda sahte veri).
 */
import type { AcademicProfile } from "../types";

export type AccountStatus = "pending" | "active" | "disabled";

export interface Me {
  id: string;
  email: string;
  role: "admin" | "academic";
  status: AccountStatus;
  title: string;
  name: string;
  faculty: string;
  department: string;
  code: string | null;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  sharedAt: number | null;
  uploadedAt: number;
}

export interface PublicFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface StudentView {
  ownerName: string;
  ownerDepartment: string;
  files: PublicFile[];
}

export interface AcademicRow {
  id: string;
  email: string;
  status: AccountStatus;
  title: string;
  name: string;
  faculty: string;
  department: string;
  createdAt: number;
  fileCount: number;
  activeCount: number;
  bytes: number;
}

export interface Stats {
  academics: number;
  pending: number;
  activeFiles: number;
  bytes: number;
}

export interface Backend {
  readonly demo: boolean;
  config(): Promise<{ allowedEmailDomain: string }>;

  me(): Promise<Me | null>;
  login(email: string, password: string): Promise<Me>;
  logout(): Promise<void>;
  register(p: AcademicProfile, password: string): Promise<void>;
  updateProfile(p: Omit<AcademicProfile, "email">): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;

  regenerateCode(): Promise<string>;
  myFiles(): Promise<{ files: FileItem[]; serverTime: number }>;
  upload(file: File, onProgress: (pct: number) => void): Promise<void>;
  reshare(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  downloadOwn(id: string): Promise<void>;

  studentFiles(code: string): Promise<StudentView>;
  studentDownload(code: string, fileId: string): Promise<void>;

  admin: {
    academics(): Promise<AcademicRow[]>;
    stats(): Promise<Stats>;
    create(p: AcademicProfile, password: string): Promise<void>;
    approve(id: string): Promise<void>;
    setActive(id: string, active: boolean): Promise<void>;
    /** Yeni geçici şifreyi döner (yönetici akademisyene iletir) */
    resetPassword(id: string): Promise<string>;
    remove(id: string): Promise<void>;
  };
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAt?: number,
  ) {
    super(message);
  }
}

/** Tarayıcıda dosya indirmeyi başlatır */
export function startDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
