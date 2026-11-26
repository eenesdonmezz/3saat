import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, KeyRound, Lock } from "lucide-react";
import { ErrorBox, Header, Spinner } from "../components/ui";
import { ProfileFields, emptyProfile } from "../components/ProfileFields";
import { ApiError, backend } from "../lib/backend";
import { useAuth } from "../lib/auth";
import { isAllowedEmail } from "../lib/config";
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

function Notice({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid place-items-center">{icon}</div>
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const home = (role: string) => (role === "admin" ? "/yonetim" : "/panel");

export function Login() {
  const nav = useNavigate();
  const { me, setMe, domain } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  if (me) return <Navigate to={home(me.role)} replace />;

  if (error?.code === "inactive") {
    return (
      <Shell>
        <Notice icon={<Lock className="h-7 w-7" />} title="Hesabınız dondurulmuş" action={<button className="btn-ghost" onClick={() => setError(null)}>Geri dön</button>}>
          Hesabınız yönetici tarafından geçici olarak durduruldu. Bu süre içinde ders kodunuz da çalışmaz. Bilgi için sistem yöneticisine başvurun.
        </Notice>
      </Shell>
    );
  }
  if (error?.code === "pending") {
    return (
      <Shell>
        <Notice icon={<Clock className="h-7 w-7" />} title="Hesabınız onay bekliyor" action={<button className="btn-ghost" onClick={() => setError(null)}>Geri dön</button>}>
          Kaydınız alındı. Sistem yöneticisi hesabınızı onayladığında giriş yapabilir ve ders kodunuzu görebilirsiniz.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Akademisyen Girişi</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">Paylaşım panelinize erişin.</p>
      {error && (
        <ErrorBox>
          {error.message}
          {error.code === "rate_limited" && " Güvenlik nedeniyle giriş 15 dakika kilitlendi."}
        </ErrorBox>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const u = await backend.login(email, password);
            setMe(u);
            nav(home(u.role));
          } catch (err) {
            setError(err instanceof ApiError ? err : new ApiError("server", "Beklenmeyen bir hata oluştu."));
          } finally {
            setLoading(false);
          }
        }}
      >
        <label className="label" htmlFor="email">E-posta</label>
        <input id="email" type="email" required className="input mb-4" placeholder={`ad.soyad@${domain}`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
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
      {backend.demo && (
        <div className="mt-10 rounded-lg bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-500">
          <p className="mb-1 font-medium text-zinc-700">Tanıtım hesapları (şifre: demo1234)</p>
          Akademisyen: <button className="underline" onClick={() => { setEmail("ayse@3saat.demo"); setPassword("demo1234"); }}>ayse@3saat.demo</button>
          <br />
          Yönetici: <button className="underline" onClick={() => { setEmail("admin@3saat.demo"); setPassword("demo1234"); }}>admin@3saat.demo</button>
        </div>
      )}
    </Shell>
  );
}

export function Register() {
  const { domain } = useAuth();
  const [profile, setProfile] = useState<AcademicProfile>(emptyProfile());
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const weak = password.length > 0 && password.length < 8;
  const mismatch = password2.length > 0 && password !== password2;
  const wrongDomain = profile.email.includes("@") && profile.email.includes(".") && !isAllowedEmail(profile.email, domain);

  if (done) {
    return (
      <Shell>
        <Notice icon={<Check className="h-7 w-7" />} title="Kaydınız alındı" action={<Link to="/giris" className="btn-primary">Girişe git</Link>}>
          Hesabınız sistem yöneticisinin onayına gönderildi. Onaylandığında {profile.email} ve şifrenizle giriş yapabilirsiniz; size özel 6 haneli ders kodunuz da o an oluşturulur.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <h1 className="text-xl font-semibold">Akademisyen Kaydı</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">Kurumsal e-postanızla hesap oluşturun. Hesabınız yönetici onayından sonra açılır.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (weak || mismatch || wrongDomain) return;
          setLoading(true);
          setError(null);
          try {
            await backend.register(profile, password);
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
          emailError={wrongDomain ? `Bu adresle kayıt olunamaz. Lütfen @${domain} uzantılı e-postanızı kullanın.` : null}
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

/** E-posta servisi olmadığı için şifre sıfırlamayı yönetici yapar. */
export function ForgotPassword() {
  return (
    <Shell>
      <Notice icon={<KeyRound className="h-7 w-7" />} title="Şifrenizi mi unuttunuz?" action={<Link to="/giris" className="btn-ghost">Girişe dön</Link>}>
        Sistem yöneticisine başvurun. Yönetici size yeni bir geçici şifre verir; giriş yaptıktan sonra Hesap ayarları’ndan kendi şifrenizi belirleyebilirsiniz.
      </Notice>
    </Shell>
  );
}
