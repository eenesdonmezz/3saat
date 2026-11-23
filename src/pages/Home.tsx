import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Lock } from "lucide-react";
import { Header, Spinner } from "../components/ui";
import { OtpInput } from "../components/OtpInput";
import { ApiError, studentFiles } from "../lib/store";
import { formatRemaining } from "../lib/format";
import { useNow } from "../lib/hooks";

export default function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const now = useNow();
  const locked = lockedUntil !== null && lockedUntil > now;

  const submit = async (c = code) => {
    if (c.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await studentFiles(c);
      nav("/ders", { state: { code: c, ...res } });
    } catch (e) {
      if (e instanceof ApiError && e.code === "rate_limited") setLockedUntil(e.retryAt ?? Date.now() + 15 * 60_000);
      else setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header right={<Link to="/giris" className="btn-ghost">Akademisyen Girişi</Link>} />
      <main className="mx-auto max-w-5xl">
        <section className="px-5 py-20 text-center sm:py-28">
          <p className="eyebrow mb-5">Ders Koduyla Katıl</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Ders materyalleri,
            <br />
            <span className="text-zinc-400">tek kodla.</span>
          </h1>
          <p className="mb-10 mt-5 text-zinc-500 sm:mb-12">Öğretim üyenizin paylaştığı 6 haneli ders kodunu girin. Hesap gerekmez.</p>

          {locked ? (
            <div className="card mx-auto max-w-sm p-6">
              <Lock className="mx-auto h-6 w-6" />
              <p className="mt-3 font-medium">Çok fazla hatalı deneme</p>
              <p className="mt-1 text-sm text-zinc-500">Güvenlik nedeniyle kısa bir süre sonra tekrar deneyebilirsiniz.</p>
              <p className="mt-4 font-mono text-2xl">{formatRemaining(lockedUntil! - now).slice(2)}</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <OtpInput value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={submit} error={!!error} disabled={loading} />
              {error && (
                <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary mt-8 px-6 py-2.5" disabled={code.length !== 6 || loading}>
                {loading ? <><Spinner light /> Kontrol ediliyor</> : <>Derse katıl <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          )}
        </section>
        <section className="grid border-t border-zinc-100 text-sm sm:grid-cols-3">
          {[
            ["Ders kodunu girin", "Öğretim üyenizden aldığınız 6 hane."],
            ["Materyalleri görün", "Şu anda paylaşılan tüm dosyalar."],
            ["İndirin", "Tek tek ya da hepsini birden."],
          ].map(([t, d], i) => (
            <div key={t} className={`p-6 sm:p-8 ${i === 1 ? "border-y border-zinc-100 sm:border-x sm:border-y-0" : ""}`}>
              <span className="font-mono text-zinc-400">0{i + 1}</span>
              <p className="mt-2 font-medium">{t}</p>
              <p className="mt-1 text-zinc-500">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
