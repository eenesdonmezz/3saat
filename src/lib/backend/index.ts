/**
 * Hangi arka ucun kullanılacağı derleme anında seçilir:
 *   VITE_DEMO=1  → tarayıcıda sahte veri (GitHub Pages tanıtım sürümü)
 *   aksi halde   → gerçek Cloudflare Worker API
 */
import { demoBackend } from "./demo";
import { httpBackend } from "./http";

export const backend = import.meta.env.VITE_DEMO === "1" ? demoBackend : httpBackend;
export * from "./types";
