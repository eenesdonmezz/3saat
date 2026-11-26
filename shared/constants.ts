/** Arayüz ve sunucunun ortak kullandığı sabitler. */

/** Bir dosyanın öğrencilere görünür kaldığı süre */
export const SHARE_DURATION_MS = 3 * 60 * 60 * 1000;

/** Tek dosya için en büyük boyut */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export const ACADEMIC_TITLES = ["Prof. Dr.", "Doç. Dr.", "Dr. Öğr. Üyesi", "Öğr. Gör.", "Öğr. Gör. Dr.", "Arş. Gör.", "Arş. Gör. Dr."] as const;
export type AcademicTitle = (typeof ACADEMIC_TITLES)[number];

/** Ders kodu deneme sınırı: bu pencerede bu kadar hatalı denemeden sonra kilit */
export const CODE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const CODE_MAX_FAILED = 10;

/** Giriş deneme sınırı (IP + e-posta başına) */
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILED = 8;

export const MIN_PASSWORD_LENGTH = 8;

export function isAllowedEmail(email: string, domain: string): boolean {
  const e = email.trim().toLowerCase();
  // Sadece tam alan adı; alt alan adları (ör. öğrenci adresleri) reddedilir.
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.split("@")[1] === domain.trim().toLowerCase();
}
