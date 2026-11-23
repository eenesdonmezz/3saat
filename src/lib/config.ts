/**
 * Kurum ayarları.
 *
 * ALLOWED_EMAIL_DOMAIN: Sadece bu alan adıyla biten e-postalar kendi kendine
 * kayıt olabilir. Kurulumda .env dosyasına VITE_ALLOWED_EMAIL_DOMAIN yazılarak
 * değiştirilir. Gerçek sistemde aynı kontrol sunucu tarafında da yapılır.
 */
export const ALLOWED_EMAIL_DOMAIN: string = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN as string | undefined)?.trim().toLowerCase() || "universite.edu.tr";

export const ACADEMIC_TITLES = ["Prof. Dr.", "Doç. Dr.", "Dr. Öğr. Üyesi", "Öğr. Gör.", "Öğr. Gör. Dr.", "Arş. Gör.", "Arş. Gör. Dr."] as const;
export type AcademicTitle = (typeof ACADEMIC_TITLES)[number];

/** Fakülte alanında öneri olarak gösterilir; listede olmayan da yazılabilir. */
export const FACULTY_SUGGESTIONS = [
  "Mühendislik ve Mimarlık Fakültesi",
  "İktisadi ve İdari Bilimler Fakültesi",
  "Fen-Edebiyat Fakültesi",
  "Sağlık Bilimleri Fakültesi",
  "Hukuk Fakültesi",
  "Güzel Sanatlar Fakültesi",
  "İletişim Fakültesi",
  "Meslek Yüksekokulu",
];

export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  // Sadece tam alan adı kabul edilir; alt alan adları (ör. öğrenci adresleri) reddedilir.
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.split("@")[1] === ALLOWED_EMAIL_DOMAIN;
}
