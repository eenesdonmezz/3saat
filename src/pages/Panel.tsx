import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Copy, Download, RefreshCw, Search, Share, Square, Trash2, Upload, User as UserIcon } from "lucide-react";
import { EmptyState, FileBadge, Header, Spinner } from "../components/ui";
import { Modal } from "../components/Modal";
import { useToast } from "../components/Toast";
import { useNow } from "../lib/hooks";
import { backend, type FileItem, type Me } from "../lib/backend";
import { useAuth } from "../lib/auth";
import { MAX_FILE_BYTES, SHARE_DURATION_MS, formatBytes, formatCode, formatDate, formatRemaining, formatTime } from "../lib/format";
import { displayName, type AcademicProfile } from "../lib/types";
import { ProfileFields } from "../components/ProfileFields";

interface UploadItem { key: string; name: string; pct: number; status: "uploading" | "done" | "error"; error?: string }

const isActive = (f: FileItem, now: number) => f.sharedAt !== null && now - f.sharedAt < SHARE_DURATION_MS;
const remainingMs = (f: FileItem, now: number) => (f.sharedAt === null ? 0 : f.sharedAt + SHARE_DURATION_MS - now);

export default function Panel() {
  const { me: user, setMe } = useAuth();
  const [clockSkew, setClockSkew] = useState(0);
  const now = useNow() + clockSkew;
  const nav = useNavigate();
  const toast = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"active" | "archive">("active");
  const [q, setQ] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [toDelete, setToDelete] = useState<FileItem | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await backend.myFiles();
      setFiles(r.files);
      setClockSkew(r.serverTime - Date.now());
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.role === "academic") reload();
  }, [user?.role, reload]);

  const { active, archive, bytes } = useMemo(() => {
    const match = (f: FileItem) => f.name.toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"));
    const a = files.filter((f) => isActive(f, now)).sort((x, y) => (y.sharedAt ?? 0) - (x.sharedAt ?? 0));
    const r = files.filter((f) => !isActive(f, now)).sort((x, y) => (y.sharedAt ?? y.uploadedAt) - (x.sharedAt ?? x.uploadedAt));
    return { active: a.filter(match), archive: r.filter(match), bytes: files.reduce((s, f) => s + f.size, 0) };
  }, [files, now, q]);
  const totalActive = files.filter((f) => isActive(f, now)).length;

  if (!user) return <Navigate to="/giris" replace />;
  if (user.role === "admin") return <Navigate to="/yonetim" replace />;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      await reload();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const startUploads = (list: FileList | null) => {
    if (!list?.length) return;
    setTab("active");
    Array.from(list).forEach((file) => {
      const key = crypto.randomUUID();
      const tooBig = file.size > MAX_FILE_BYTES;
      setUploads((u) => [...u, { key, name: file.name, pct: 0, status: tooBig ? "error" : "uploading", error: tooBig ? "500 MB sınırını aşıyor" : undefined }]);
      if (tooBig) return;
      backend
        .upload(file, (pct) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct } : x))))
        .then(() => {
          reload();
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "done", pct: 100 } : x)));
          setTimeout(() => setUploads((u) => u.filter((x) => x.key !== key)), 2500);
        })
        .catch((e: Error) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "error", error: e.message } : x))));
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    startUploads(e.dataTransfer.files);
  };

  return (
    <div className="min-h-screen">
      <Header
        right={
          <>
            <span className="hidden text-zinc-500 sm:inline">{displayName(user)}</span>
            <button className="btn-icon" title="Hesap ayarları" aria-label="Hesap ayarları" onClick={() => setAccountOpen(true)}><UserIcon className="h-4 w-4" /></button>
            <button className="btn-ghost" onClick={async () => { await backend.logout().catch(() => {}); setMe(null); nav("/"); }}>Çıkış</button>
          </>
        }
      />
      <main className="mx-auto max-w-5xl p-5 sm:p-8">
        {/* Ders kodu */}
        <section className="flex flex-col justify-between gap-5 border-b border-zinc-100 pb-7 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Ders kodunuz</p>
            <p className="mt-2 font-mono text-4xl tracking-[0.2em] sm:text-5xl">{user.code ? formatCode(user.code) : "——"}</p>
            <p className="mt-2 text-xs text-zinc-400">Öğrencileriniz bu kodla ana sayfadan materyallerinize ulaşır.</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(user.code ?? "").then(() => toast("Ders kodu kopyalandı"), () => toast("Kopyalanamadı", "error"))}><Copy className="h-4 w-4" />Kopyala</button>
              <button className="btn-ghost" onClick={() => setConfirmRegen(true)}><RefreshCw className="h-4 w-4" />Yenile</button>
            </div>
            <p className="text-sm text-zinc-500">
              <span className="font-medium text-zinc-900">{totalActive}</span> aktif · <span className="font-medium text-zinc-900">{files.length - totalActive}</span> arşivde · <span className="font-medium text-zinc-900">{formatBytes(bytes)}</span>
            </p>
          </div>
        </section>

        {/* Yükleme alanı */}
        <section
          className={`my-7 cursor-pointer rounded-xl border border-dashed px-4 py-9 text-center transition ${drag ? "border-zinc-950 bg-zinc-50" : "border-zinc-300 hover:border-zinc-950"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => { startUploads(e.target.files); e.target.value = ""; }} />
          <Upload className="mx-auto h-[22px] w-[22px] text-zinc-400" />
          <p className="mt-3 text-sm">Dosyaları sürükleyin ya da <span className="underline underline-offset-2">seçin</span></p>
          <p className="mt-1 text-xs text-zinc-400">Her tür dosya · birden fazla · tek dosya en fazla 500 MB</p>
          <p className="text-xs text-zinc-400">Yüklenen dosya hemen 3 saatliğine paylaşılır.</p>
          {uploads.length > 0 && (
            <div className="mx-auto mt-5 max-w-md space-y-4 text-left" onClick={(e) => e.stopPropagation()}>
              {uploads.map((u) => (
                <div key={u.key}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">{u.name}</span>
                    <span className={`shrink-0 font-mono ${u.status === "error" ? "text-red-600" : u.status === "done" ? "text-emerald-600" : "text-zinc-500"}`}>
                      {u.status === "error" ? u.error : u.status === "done" ? "Paylaşıldı" : `${u.pct}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-0.5 bg-zinc-100">
                    <div className={`h-0.5 transition-all ${u.status === "error" ? "bg-red-500" : u.status === "done" ? "bg-emerald-500" : "bg-zinc-950"}`} style={{ width: `${u.status === "error" ? 100 : u.pct}%` }} />
                  </div>
                </div>
              ))}
              {uploads.some((u) => u.status === "error") && (
                <button className="text-xs text-zinc-500 underline" onClick={() => setUploads((u) => u.filter((x) => x.status !== "error"))}>Hataları temizle</button>
              )}
            </div>
          )}
        </section>

        {/* Sekmeler */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm" role="tablist">
            {(["active", "archive"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-md px-3 py-1.5 ${tab === t ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}>
                {t === "active" ? `Aktif (${totalActive})` : `Arşiv (${files.length - totalActive})`}
              </button>
            ))}
          </div>
          <div className="relative w-40 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <input className="input py-1.5 pl-8" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {!loaded ? (
          <div className="card divide-y divide-zinc-100" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="h-11 w-11 animate-pulse rounded-lg bg-zinc-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                  <div className="h-2.5 w-1/5 animate-pulse rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === "active" ? (
          active.length === 0 ? (
            <EmptyState title={q ? "Sonuç yok" : "Şu anda paylaşılan dosya yok"} text={q ? "Aramanızla eşleşen aktif dosya bulunamadı." : "Yukarıdan bir dosya yükleyin ve ders kodunuzu öğrencilerinizle paylaşın. Dosya 3 saat boyunca görünür."} />
          ) : (
            <ul className="card divide-y divide-zinc-100">
              {active.map((f) => {
                const rem = remainingMs(f, now);
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap sm:gap-4">
                    <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto sm:gap-4">
                      <FileBadge name={f.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{formatBytes(f.size)} · {formatTime(f.sharedAt!)} paylaşıldı</p>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className={`font-mono text-xs ${rem < 30 * 60_000 ? "text-amber-600" : "text-zinc-500"}`} title="Öğrencilerin dosyayı görebileceği kalan süre">{formatRemaining(rem)} kaldı</span>
                      <button className="btn-icon" title="İndir" onClick={() => backend.downloadOwn(f.id).catch((e: Error) => toast(e.message, "error"))}><Download className="h-4 w-4" /></button>
                      <button className="btn-ghost" disabled={busy === f.id} onClick={() => run(f.id, () => backend.stop(f.id), "Paylaşım durduruldu, dosya arşive taşındı")}>
                        {busy === f.id ? <Spinner /> : <Square className="h-4 w-4" />}Durdur
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : archive.length === 0 ? (
          <EmptyState title={q ? "Sonuç yok" : "Arşiv boş"} text={q ? "Aramanızla eşleşen arşiv dosyası bulunamadı." : "Paylaşım süresi dolan dosyalar burada saklanır."} />
        ) : (
          <>
            <ul className="card divide-y divide-zinc-100">
              {archive.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap sm:gap-4">
                  <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto sm:gap-4">
                    <FileBadge name={f.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{formatBytes(f.size)} · {f.sharedAt ? `Son paylaşım ${formatDate(f.sharedAt)}` : "Paylaşım durduruldu"}</p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button className="btn-primary" disabled={busy === f.id} onClick={() => run(f.id, () => backend.reshare(f.id), "Tekrar paylaşıldı, 3 saat yeniden başladı")}>
                      {busy === f.id ? <Spinner light /> : <Share className="h-4 w-4" />}Tekrar paylaş
                    </button>
                    <button className="btn-icon" title="İndir" onClick={() => backend.downloadOwn(f.id).catch((e: Error) => toast(e.message, "error"))}><Download className="h-4 w-4" /></button>
                    <button className="btn-icon text-red-600" title="Kalıcı sil" onClick={() => setToDelete(f)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-400">Süresi dolan dosyalar öğrencilerden gizlenir ama silinmez. Siz silene kadar burada kalır.</p>
          </>
        )}
      </main>

      <Modal
        open={confirmRegen}
        title="Ders kodunu yenile"
        onClose={() => setConfirmRegen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmRegen(false)}>Vazgeç</button>
            <button className="btn-primary" disabled={busy === "regen"} onClick={() => run("regen", async () => { const code = await backend.regenerateCode(); setMe({ ...user, code }); setConfirmRegen(false); }, "Yeni ders kodunuz oluşturuldu")}>
              {busy === "regen" && <Spinner light />}Yenile
            </button>
          </>
        }
      >
        Yeni bir 6 haneli kod oluşturulacak. Mevcut kod (<span className="font-mono text-zinc-900">{user.code ? formatCode(user.code) : ""}</span>) anında geçersiz olur; öğrencilerinize yeni kodu bildirmeniz gerekir.
      </Modal>

      <Modal
        open={!!toDelete}
        title="Kalıcı olarak sil"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setToDelete(null)}>Vazgeç</button>
            <button className="btn-danger" onClick={() => { const f = toDelete!; setToDelete(null); run(f.id, () => backend.remove(f.id), "Dosya kalıcı olarak silindi"); }}>
              <Trash2 className="h-4 w-4" />Sil
            </button>
          </>
        }
      >
        <span className="font-medium text-zinc-900">{toDelete?.name}</span> kalıcı olarak silinecek. Bu işlem geri alınamaz.
      </Modal>

      {accountOpen && <AccountModal user={user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}

export function AccountModal({ user, onClose }: { user: Me; onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [p, setP] = useState<AcademicProfile>({ title: user.title, name: user.name, email: user.email, faculty: user.faculty, department: user.department });
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = user.role === "admin";
  return (
    <Modal
      open
      title="Hesap ayarları"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Vazgeç</button>
          <button
            className="btn-primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                if (!isAdmin) await backend.updateProfile(p);
                if (pw || current) await backend.changePassword(current, pw);
                await refresh();
                toast("Bilgileriniz kaydedildi");
                onClose();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Spinner light />}Kaydet
          </button>
        </>
      }
    >
      <div className="mt-4">
        {!isAdmin && <ProfileFields value={p} onChange={setP} email="readonly" />}
        <p className={`text-xs font-medium text-zinc-900 ${isAdmin ? "" : "mt-6"}`}>Şifre değiştir</p>
        <label className="label mt-3">Mevcut şifre</label>
        <input type="password" className="input text-zinc-900" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <label className="label mt-3">Yeni şifre</label>
        <input type="password" className="input text-zinc-900" placeholder="En az 8 karakter" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <p className="mt-2 text-xs text-zinc-400">Şifrenizi değiştirmek istemiyorsanız bu alanları boş bırakın.</p>
      </div>
    </Modal>
  );
}
