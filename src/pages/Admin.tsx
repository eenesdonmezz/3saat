import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Copy, RefreshCw, Search, User as UserIcon, UserPlus } from "lucide-react";
import { EmptyState, Header, Spinner } from "../components/ui";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { ProfileFields, emptyProfile } from "../components/ProfileFields";
import { AccountModal } from "./Panel";
import { backend, type AcademicRow, type Stats } from "../lib/backend";
import { useAuth } from "../lib/auth";
import { formatBytes, formatDate } from "../lib/format";
import { displayName, type AcademicProfile } from "../lib/types";

const STORAGE_LIMIT = 10 * 1024 ** 3;

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

export default function Admin() {
  const { me: user, setMe } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<AcademicRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AcademicRow | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; email: string; pw: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([backend.admin.academics(), backend.admin.stats()]);
      setRows(a);
      setStats(s);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  useEffect(() => {
    if (user?.role === "admin") reload();
  }, [user?.role, reload]);

  if (!user) return <Navigate to="/giris" replace />;
  if (user.role !== "admin") return <Navigate to="/panel" replace />;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      await reload();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const list = (rows ?? []).filter((r) => `${displayName(r)} ${r.email} ${r.faculty} ${r.department}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));
  const pending = list.filter((r) => r.status === "pending");
  const others = list.filter((r) => r.status !== "pending");

  return (
    <div className="min-h-screen">
      <Header
        right={
          <>
            <span className="rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px]">YÖNETİCİ</span>
            <span className="hidden text-zinc-500 sm:inline">{displayName(user)}</span>
            <button className="btn-icon" title="Hesap ayarları" aria-label="Hesap ayarları" onClick={() => setAccountOpen(true)}><UserIcon className="h-4 w-4" /></button>
            <button className="btn-ghost" onClick={async () => { await backend.logout().catch(() => {}); setMe(null); nav("/"); }}>Çıkış</button>
          </>
        }
      />
      <main className="mx-auto max-w-5xl p-5 sm:p-8">
        <section className="card mb-8 grid grid-cols-3 divide-x divide-zinc-200">
          <Stat label="Akademisyen" value={stats ? String(stats.academics) : "–"} />
          <Stat label="Aktif dosya" value={stats ? String(stats.activeFiles) : "–"} />
          <Stat label="Depolama" value={stats ? formatBytes(stats.bytes) : "–"} suffix="/ 10 GB" bar={stats ? stats.bytes / STORAGE_LIMIT : 0} />
        </section>
        {stats && stats.bytes / STORAGE_LIMIT >= 0.8 && (
          <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Depolama alanının %{Math.round((stats.bytes / STORAGE_LIMIT) * 100)}’i dolu. Ücretsiz sınır 10 GB; aşılırsa her ek GB için ayda yaklaşık 0,015 $ ödenir.
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-semibold">Akademisyenler</h1>
          <div className="flex gap-2">
            <div className="relative w-36 sm:w-52">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input className="input py-1.5 pl-8" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Akademisyen ekle</button>
          </div>
        </div>

        {rows === null ? (
          <div className="card grid place-items-center py-14"><Spinner /></div>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="mb-6">
                <p className="eyebrow mb-3">Onay bekleyen kayıtlar ({pending.length})</p>
                <ul className="card divide-y divide-zinc-100 border-amber-200">
                  {pending.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-amber-50/40 p-4 text-sm sm:flex-nowrap">
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <p className="font-medium">{displayName(r)}</p>
                        <p className="truncate text-xs text-zinc-500">{r.department} · {r.faculty}</p>
                        <p className="truncate text-xs text-zinc-400">{r.email} · {formatDate(r.createdAt)} kayıt oldu</p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {busy === r.id && <Spinner />}
                        <button className="btn-ghost text-red-600" onClick={() => setToDelete(r)}>Reddet</button>
                        <button className="btn-primary" disabled={busy === r.id} onClick={() => run(r.id, () => backend.admin.approve(r.id), "Hesap onaylandı, ders kodu oluşturuldu")}>
                          <Check className="h-4 w-4" />Onayla
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {others.length === 0 ? (
              <EmptyState title="Akademisyen bulunamadı" text={q ? "Aramanızla eşleşen kayıt yok." : "Henüz kayıtlı akademisyen yok. Sağ üstten ekleyebilirsiniz."} />
            ) : (
              <ul className="card divide-y divide-zinc-100">
                {others.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="font-medium">{displayName(r)}</p>
                      <p className="truncate text-xs text-zinc-500">{r.department} · {r.faculty}</p>
                      <p className="truncate text-xs text-zinc-400">
                        {r.email} · {r.fileCount} dosya ({r.activeCount} aktif) · {formatBytes(r.bytes)} · {formatDate(r.createdAt)}
                      </p>
                    </div>
                    <span className={`inline-flex w-28 items-center gap-1.5 text-xs ${r.status === "active" ? "" : "text-zinc-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-emerald-500" : "bg-zinc-300"}`} />
                      {r.status === "active" ? "Aktif" : "Dondurulmuş"}
                    </span>
                    <div className="ml-auto flex items-center gap-4 text-xs text-zinc-500">
                      {busy === r.id && <Spinner />}
                      <button className="hover:text-zinc-950" onClick={() => run(r.id, () => backend.admin.setActive(r.id, r.status !== "active"), r.status === "active" ? "Hesap donduruldu, ders kodu devre dışı" : "Hesap yeniden aktifleştirildi")}>
                        {r.status === "active" ? "Dondur" : "Aktifleştir"}
                      </button>
                      <button
                        className="hover:text-zinc-950"
                        onClick={() =>
                          run(r.id, async () => {
                            const pw = await backend.admin.resetPassword(r.id);
                            setTempPw({ name: displayName(r), email: r.email, pw });
                          })
                        }
                      >
                        Şifre sıfırla
                      </button>
                      <button className="text-red-600" onClick={() => setToDelete(r)}>Sil</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {adding && <AddAcademicModal onClose={() => setAdding(false)} onAdded={reload} />}
      {accountOpen && <AccountModal user={user} onClose={() => setAccountOpen(false)} />}

      <Modal
        open={!!toDelete}
        title={toDelete?.status === "pending" ? "Kaydı reddet" : "Akademisyeni sil"}
        onClose={() => setToDelete(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setToDelete(null)}>Vazgeç</button>
            <button className="btn-danger" onClick={() => { const r = toDelete!; setToDelete(null); run(r.id, () => backend.admin.remove(r.id), r.status === "pending" ? "Kayıt reddedildi" : "Akademisyen ve dosyaları silindi"); }}>
              {toDelete?.status === "pending" ? "Reddet" : "Sil"}
            </button>
          </>
        }
      >
        {toDelete?.status === "pending" ? (
          <><span className="font-medium text-zinc-900">{toDelete && displayName(toDelete)}</span> adlı kayıt silinecek.</>
        ) : (
          <><span className="font-medium text-zinc-900">{toDelete && displayName(toDelete)}</span> hesabı ve {toDelete?.fileCount} dosyası kalıcı olarak silinecek. Bu işlem geri alınamaz.</>
        )}
      </Modal>

      <Modal open={!!tempPw} title="Yeni geçici şifre" onClose={() => setTempPw(null)} footer={<button className="btn-primary" onClick={() => setTempPw(null)}>Tamam</button>}>
        <p>{tempPw?.name} ({tempPw?.email}) için yeni geçici şifre. Akademisyene güvenli bir yoldan iletin; bu pencere kapanınca tekrar gösterilmez.</p>
        <div className="mt-4 flex gap-2">
          <input readOnly className="input font-mono text-zinc-900" value={tempPw?.pw ?? ""} />
          <button className="btn-icon" title="Kopyala" onClick={() => navigator.clipboard.writeText(tempPw?.pw ?? "").then(() => toast("Şifre kopyalandı"), () => {})}><Copy className="h-4 w-4" /></button>
        </div>
        <p className="mt-3 text-xs text-zinc-400">Akademisyenin açık oturumları kapatıldı.</p>
      </Modal>
    </div>
  );
}

function Stat({ label, value, suffix, bar }: { label: string; value: string; suffix?: string; bar?: number }) {
  return (
    <div className="p-4 sm:p-6">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-2 text-xl font-semibold sm:text-3xl">
        {value}
        {suffix && <span className="text-xs font-normal text-zinc-400 sm:text-base"> {suffix}</span>}
      </p>
      {bar !== undefined && (
        <div className="mt-3 h-0.5 bg-zinc-100">
          <div className="h-0.5 bg-zinc-950" style={{ width: `${Math.min(100, Math.max(1, bar * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

function AddAcademicModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<AcademicProfile>(emptyProfile());
  const [pw, setPw] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      title="Yeni akademisyen"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Vazgeç</button>
          <button
            className="btn-primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await backend.admin.create(p, pw);
                toast("Akademisyen eklendi");
                onAdded();
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Spinner light />}Ekle
          </button>
        </>
      }
    >
      <p className="mb-5">Hesap hemen aktif olur. Bu yolla kurum dışı adres de eklenebilir (ör. misafir öğretim üyesi).</p>
      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}
      <ProfileFields value={p} onChange={setP} />
      <label className="label mt-4">Geçici şifre</label>
      <div className="flex gap-2">
        <input className="input font-mono text-zinc-900" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-icon" title="Yeni şifre üret" onClick={() => setPw(genPassword())}><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="mt-3 text-xs text-zinc-400">Bu şifreyi akademisyene iletin. 6 haneli ders kodu otomatik oluşturulur; akademisyen giriş yaptıktan sonra şifresini değiştirebilir.</p>
    </Modal>
  );
}
