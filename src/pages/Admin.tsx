import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { RefreshCw, Search, UserPlus } from "lucide-react";
import { EmptyState, Header, Spinner } from "../components/ui";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useStore } from "../lib/hooks";
import * as api from "../lib/store";
import { formatBytes, formatDate } from "../lib/format";
import { displayName, type AcademicProfile } from "../lib/types";
import { ProfileFields, emptyProfile } from "../components/ProfileFields";

const STORAGE_LIMIT = 10 * 1024 ** 3;

export default function Admin() {
  useStore();
  const nav = useNavigate();
  const toast = useToast();
  const user = api.currentUser();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<api.AcademicRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!user) return <Navigate to="/giris" replace />;
  if (user.role !== "admin") return <Navigate to="/panel" replace />;

  const stats = api.adminStats();
  const rows = api.listAcademics().filter((r) => `${displayName(r)} ${r.email} ${r.faculty} ${r.department}`.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr")));

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        right={
          <>
            <span className="rounded border border-zinc-200 px-2 py-0.5 font-mono text-[10px]">YÖNETİCİ</span>
            <span className="hidden text-zinc-500 sm:inline">{displayName(user)}</span>
            <button className="btn-ghost" onClick={() => { api.logout(); nav("/"); }}>Çıkış</button>
          </>
        }
      />
      <main className="mx-auto max-w-5xl p-5 sm:p-8">
        <section className="card mb-8 grid grid-cols-3 divide-x divide-zinc-200">
          <Stat label="Akademisyen" value={String(stats.academics)} />
          <Stat label="Aktif dosya" value={String(stats.activeFiles)} />
          <Stat label="Depolama" value={formatBytes(stats.bytes)} suffix="/ 10 GB" bar={stats.bytes / STORAGE_LIMIT} />
        </section>

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

        {rows.length === 0 ? (
          <EmptyState title="Akademisyen bulunamadı" text={q ? "Aramanızla eşleşen kayıt yok." : "Henüz kayıtlı akademisyen yok. Sağ üstten ekleyebilirsiniz."} />
        ) : (
          <ul className="card divide-y divide-zinc-100">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm sm:flex-nowrap">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <p className="font-medium">{displayName(r)}</p>
                  <p className="truncate text-xs text-zinc-500">{r.department} · {r.faculty}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {r.email} · {r.fileCount} dosya ({r.activeCount} aktif) · {formatBytes(r.bytes)} · {formatDate(r.createdAt)}
                  </p>
                </div>
                <span className={`inline-flex w-28 items-center gap-1.5 text-xs ${r.active ? "" : "text-zinc-400"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${r.active ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  {r.active ? "Aktif" : "Dondurulmuş"}
                </span>
                <div className="ml-auto flex items-center gap-4 text-xs text-zinc-500">
                  {busy === r.id && <Spinner />}
                  <button className="hover:text-zinc-950" onClick={() => run(r.id, () => api.adminSetActive(r.id, !r.active), r.active ? "Hesap donduruldu, ders kodu devre dışı" : "Hesap yeniden aktifleştirildi")}>
                    {r.active ? "Dondur" : "Aktifleştir"}
                  </button>
                  <button className="hover:text-zinc-950" onClick={() => run(r.id, () => api.adminResetPassword(r.id), "Şifre sıfırlama e-postası gönderildi")}>Şifre sıfırla</button>
                  <button className="text-red-600" onClick={() => setToDelete(r)}>Sil</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {adding && <AddAcademicModal onClose={() => setAdding(false)} />}

      <Modal
        open={!!toDelete}
        title="Akademisyeni sil"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setToDelete(null)}>Vazgeç</button>
            <button className="btn-danger" onClick={() => { const r = toDelete!; setToDelete(null); run(r.id, () => api.adminDeleteAcademic(r.id), "Akademisyen ve dosyaları silindi"); }}>Sil</button>
          </>
        }
      >
        <span className="font-medium text-zinc-900">{toDelete && displayName(toDelete)}</span> hesabı ve {toDelete?.fileCount} dosyası kalıcı olarak silinecek. Bu işlem geri alınamaz.
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

function AddAcademicModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<AcademicProfile>(emptyProfile());
  const [pw, setPw] = useState(api.generateTempPassword());
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
                await api.adminCreateAcademic(p, pw);
                toast("Akademisyen eklendi");
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
      <p className="mb-5">Hesap hemen aktif olur, e-posta doğrulaması gerekmez.</p>
      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}
      <ProfileFields value={p} onChange={setP} />
      <label className="label mt-4">Geçici şifre</label>
      <div className="flex gap-2">
        <input className="input font-mono text-zinc-900" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn-icon" title="Yeni şifre üret" onClick={() => setPw(api.generateTempPassword())}><RefreshCw className="h-4 w-4" /></button>
      </div>
      <p className="mt-3 text-xs text-zinc-400">6 haneli ders kodu otomatik oluşturulur. Akademisyen ilk girişte şifresini değiştirebilir.</p>
    </Modal>
  );
}
