import { ACADEMIC_TITLES, ALLOWED_EMAIL_DOMAIN, FACULTY_SUGGESTIONS } from "../lib/config";
import type { AcademicProfile } from "../lib/types";

interface Props {
  value: AcademicProfile;
  onChange: (v: AcademicProfile) => void;
  /** E-posta alanı gösterilsin mi / değiştirilebilsin mi */
  email?: "edit" | "readonly" | "hidden";
  /** E-posta için kurum alan adı ipucu gösterilsin mi */
  domainHint?: boolean;
  /** E-posta altında gösterilecek hata */
  emailError?: string | null;
}

/** Akademisyen bilgileri: unvan, ad soyad, e-posta, fakülte, bölüm. */
export function ProfileFields({ value, onChange, email = "edit", domainHint, emailError }: Props) {
  const set = (k: keyof AcademicProfile) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4 text-zinc-900">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <div>
          <label className="label" htmlFor="pf-title">Unvan</label>
          <select id="pf-title" required className="input pr-2" value={value.title} onChange={set("title")}>
            <option value="" disabled>Seçin</option>
            {ACADEMIC_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pf-name">Ad Soyad</label>
          <input id="pf-name" required minLength={3} className="input" placeholder="Ad Soyad" value={value.name} onChange={set("name")} autoComplete="name" />
        </div>
      </div>
      {email !== "hidden" && (
        <div>
          <label className="label" htmlFor="pf-email">Kurumsal e-posta</label>
          <input id="pf-email" type="email" required disabled={email === "readonly"} className={`input disabled:text-zinc-400 ${emailError ? "border-red-500" : ""}`} placeholder={`ad.soyad@${ALLOWED_EMAIL_DOMAIN}`} value={value.email} onChange={set("email")} autoComplete="email" />
          {emailError ? (
            <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
          ) : (
            domainHint && <p className="mt-1.5 text-xs text-zinc-400">Sadece @{ALLOWED_EMAIL_DOMAIN} uzantılı adresler kabul edilir.</p>
          )}
        </div>
      )}
      <div>
        <label className="label" htmlFor="pf-faculty">Fakülte / Yüksekokul</label>
        <input id="pf-faculty" required list="pf-faculties" className="input" placeholder="Seçin ya da yazın" value={value.faculty} onChange={set("faculty")} />
        <datalist id="pf-faculties">{FACULTY_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      <div>
        <label className="label" htmlFor="pf-dept">Bölüm</label>
        <input id="pf-dept" required className="input" placeholder="ör. Bilgisayar Mühendisliği" value={value.department} onChange={set("department")} />
      </div>
    </div>
  );
}

export const emptyProfile = (): AcademicProfile => ({ title: "", name: "", email: "", faculty: "", department: "" });
