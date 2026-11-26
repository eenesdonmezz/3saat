/** Gerçek arka uç: aynı alan adındaki Cloudflare Worker API'si (/api). */
import type { AcademicProfile } from "../types";
import { ApiError, type AcademicRow, type Backend, type FileItem, type Me, type Stats, type StudentView, startDownload } from "./types";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("network", "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* boş yanıt */
  }
  if (!res.ok) throw new ApiError(String(data.code || "server"), String(data.error || "Beklenmeyen bir hata oluştu."), data.retryAt as number | undefined);
  return data as T;
}

/** XHR ile yükleme: ilerleme yüzdesi gösterilebilsin diye */
function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError("upload", "Yükleme başarısız oldu.")));
    xhr.onerror = () => reject(new ApiError("network", "Yükleme sırasında bağlantı koptu."));
    xhr.send(file);
  });
}

interface RawAcademic {
  id: string;
  email: string;
  status: AcademicRow["status"];
  title: string;
  name: string;
  faculty: string;
  department: string;
  created_at: number;
  file_count: number;
  active_count: number;
  bytes: number;
}

export const httpBackend: Backend = {
  demo: false,
  config: () => call("GET", "/config"),

  me: async () => (await call<{ user: Me | null }>("GET", "/auth/me")).user,
  login: async (email, password) => {
    await call("POST", "/auth/login", { email, password });
    return (await call<{ user: Me }>("GET", "/auth/me")).user;
  },
  logout: async () => {
    await call("POST", "/auth/logout");
  },
  register: async (p: AcademicProfile, password) => {
    await call("POST", "/auth/register", { ...p, password });
  },
  updateProfile: async (p) => {
    await call("PATCH", "/me/profile", { title: p.title, name: p.name, faculty: p.faculty, department: p.department });
  },
  changePassword: async (currentPassword, newPassword) => {
    await call("POST", "/me/password", { currentPassword, newPassword });
  },

  regenerateCode: async () => (await call<{ code: string }>("POST", "/me/code/regenerate")).code,
  myFiles: () => call<{ files: FileItem[]; serverTime: number }>("GET", "/me/files"),
  upload: async (file, onProgress) => {
    const init = await call<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>("POST", "/me/files/upload-init", {
      name: file.name,
      size: file.size,
      mime: file.type || undefined,
    });
    await putWithProgress(init.uploadUrl, file, init.headers, onProgress);
    await call("POST", `/me/files/${init.fileId}/complete`);
    onProgress(100);
  },
  reshare: async (id) => {
    await call("POST", `/me/files/${id}/reshare`);
  },
  stop: async (id) => {
    await call("POST", `/me/files/${id}/stop`);
  },
  remove: async (id) => {
    await call("DELETE", `/me/files/${id}`);
  },
  downloadOwn: async (id) => {
    startDownload((await call<{ url: string }>("GET", `/me/files/${id}/download`)).url);
  },

  studentFiles: (code) => call<StudentView>("POST", "/student/files", { code }),
  studentDownload: async (code, fileId) => {
    startDownload((await call<{ url: string }>("POST", "/student/download", { code, fileId })).url);
  },

  admin: {
    academics: async () =>
      (await call<{ academics: RawAcademic[] }>("GET", "/admin/academics")).academics.map((r) => ({
        id: r.id,
        email: r.email,
        status: r.status,
        title: r.title,
        name: r.name,
        faculty: r.faculty,
        department: r.department,
        createdAt: r.created_at,
        fileCount: r.file_count,
        activeCount: r.active_count,
        bytes: r.bytes,
      })),
    stats: async () => {
      const r = await call<{ academics: number; pending: number; active_files: number; bytes: number }>("GET", "/admin/stats");
      return { academics: r.academics, pending: r.pending, activeFiles: r.active_files, bytes: r.bytes } satisfies Stats;
    },
    create: async (p, password) => {
      await call("POST", "/admin/academics", { ...p, password });
    },
    approve: async (id) => {
      await call("POST", `/admin/academics/${id}/approve`);
    },
    setActive: async (id, active) => {
      await call("POST", `/admin/academics/${id}/status`, { active });
    },
    resetPassword: async (id) => (await call<{ tempPassword: string }>("POST", `/admin/academics/${id}/reset-password`)).tempPassword,
    remove: async (id) => {
      await call("DELETE", `/admin/academics/${id}`);
    },
  },
};
