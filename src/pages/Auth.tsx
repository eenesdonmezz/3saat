import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { ErrorBox, Header, Spinner } from "../components/ui";
import { ApiError, login, register, requestPasswordReset } from "../lib/store";
import { ProfileFields, emptyProfile } from "../components/ProfileFields";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "../lib/config";
import type { AcademicProfile } from "../lib/types";

function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen">
      <Header right={<Link to="/" className="btn-ghost"><ArrowLeft className="h-4 w-4" />Ana sayfa</Link>} />
      <main className="grid place-items-center px-5 py-16 sm:py-24">
        <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"}`}>{children}</div>
      </main>
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  if (error?.code === "inactive") {
    return (
      <Shell>
        <div className="text-center">
          <Lock className="mx-auto h-7 w-7" />
          <h1 className="mt-4 text-xl font-semibold">Hesabınız dondurulmuş</h1>
          <p className="mt-2 text-sm text-zinc-500">Hesabınız yönetici tarafından geçici olarak durduruldu. Bu süre içinde ders kodunuz da çalışmaz. Bilgi için sistem yöneticisine başvurun.</p>
          <button className="btn-ghost mt-6" onClick={() => setError(null)}>Geri dön</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Akademisyen Girişi</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">Paylaşım panelinize erişin.</p>
      {error && <ErrorBox>{error.message}</ErrorBox>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const u = await login(email, password);
            nav(u.role === "admin" ? "/yonetim" : "/panel");
          } catch (err) {
            setError(err as ApiError);
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required className="input mb-4" placeholder={`ad.soyad@${ALLOWED_EMAIL_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <div className="flex justify-between">
          <label className="label" htmlFor="pw">Şifre</label>
          <Link to="/sifremi-unuttum" className="text-xs text-zinc-500 underline underline-offset-2">Şifremi unuttum</Link>
        </div>
        <input id="pw" type="password" required className={`input ${error?.code === "invalid" ? "border-red-500" : ""}`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <button className="btn-primary mt-6 w-full py-2.5" disabled={loading}>{loading && <Spinner light />}Giriş yap</button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Hesabınız yok mu? <Link to="/kayit" className="text-zinc-950 underline underline-offset-2">Kayıt olun</Link>
      </p>
      <div className="mt-10 rounded-lg bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-500">
        <p className="mb-1 font-medium text-zinc-700">Prototip deneme hesapları (şifre: demo1234)</p>
        Akademisyen: <button className="underline" onClick={() => { setEmail("ayse@3saat.demo"); setPassword("demo1234"); }}>ayse@3saat.demo</button>
        <br />
        Yönetici: <button className="underline" onClick={() => { setEmail("admin@3saat.demo"); setPassword("demo1234"); }}>admin@3saat.demo</button>
      </div>
    </Shell>
  );
}

export function Register() {
  const [profile, setProfile] = useState<AcademicProfile>(emptyProfile());
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const weak = password.length > 0 && password.length < 8;
  const mismatch = password2.length > 0 && password !== password2;
  const wrongDomain = profile.email.includes("@") && profile.email.includes(".") && !isAllowedEmail(profile.email);

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <Mail className="mx-auto h-7 w-7" />
          <h1 className="mt-4 text-xl font-semibold">E-postanızı kontrol edin</h1>
          <p className="mt-2 text-sm text-zinc-500">{profile.email} adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra giriş yapabilirsiniz. Size özel 6 haneli ders kodunuz otomatik olarak oluşturuldu.</p>
          <Link to="/giris" className="btn-primary mt-6">Girişe git</Link>
          <p className="mt-4 text-xs text-zinc-400">Prototipte e-posta gönderilmez, doğrudan giriş yapabilirsiniz.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <h1 className="text-xl font-semibold">Akademisyen Kaydı</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">Kurumsal e-postanızla hesap oluşturun.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (weak || mismatch || wrongDomain) return;
          setLoading(true);
          setError(null);
          try {
            await register(profile, password);
            setDone(true);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <ProfileFields
          value={profile}
          onChange={setProfile}
          domainHint
          emailError={wrongDomain ? `Bu adresle kayıt olunamaz. Lütfen @${ALLOWED_EMAIL_DOMAIN} uzantılı e-postanızı kullanın.` : null}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pw">Şifre</label>
            <input id="pw" type="password" required className={`input ${weak ? "border-red-500" : ""}`} placeholder="En az 8 karakter" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="pw2">Şifre (tekrar)</label>
            <input id="pw2" type="password" required className={`input ${mismatch ? "border-red-500" : ""}`} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {weak && <p className="mt-1.5 text-xs text-red-600">Şifre en az 8 karakter olmalı.</p>}
        {mismatch && <p className="mt-1.5 text-xs text-red-600">Şifreler eşleşmiyor.</p>}
        <button className="btn-primary mt-6 w-full py-2.5" disabled={loading}>{loading && <Spinner light />}Hesap oluştur</button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Zaten hesabınız var mı? <Link to="/giris" className="text-zinc-950 underline underline-offset-2">Giriş yapın</Link>
      </p>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <Shell>
      {sent ? (
        <div className="text-center">
          <Mail className="mx-auto h-7 w-7" />
          <h1 className="mt-4 text-xl font-semibold">Bağlantı gönderildi</h1>
          <p className="mt-2 text-sm text-zinc-500">Bu e-posta adresiyle kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi.</p>
          <Link to="/giris" className="btn-ghost mt-6">Girişe dön</Link>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Şifrenizi sıfırlayın</h1>
          <p className="mb-8 mt-1 text-sm text-zinc-500">E-postanıza bir sıfırlama bağlantısı göndereceğiz.</p>
          <form onSubmit={async (e) => { e.preventDefault(); setLoading(true); await requestPasswordReset(email); setLoading(false); setSent(true); }}>
            <label className="label" htmlFor="email">E-posta</label>
            <input id="email" type="email" required className="input" placeholder={`ad.soyad@${ALLOWED_EMAIL_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn-primary mt-6 w-full py-2.5" disabled={loading}>{loading && <Spinner light />}Bağlantı gönder</button>
          </form>
          <Link to="/giris" className="mt-6 block text-center text-sm text-zinc-500">Girişe dön</Link>
        </>
      )}
    </Shell>
  );
}
