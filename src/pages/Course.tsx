import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Download, Inbox, RefreshCw } from "lucide-react";
import { EmptyState, FileBadge, Header, Spinner } from "../components/ui";
import { useToast } from "../components/Toast";
import { ApiError, studentDownload, studentFiles } from "../lib/store";
import { formatBytes } from "../lib/format";
import type { PublicFile } from "../lib/types";

interface State { code: string; ownerName: string; ownerDepartment: string; files: PublicFile[] }

/** Öğrenci ekranı. Ders kodu URL'de değil, sadece sayfa durumunda tutulur. */
export default function Course() {
  const loc = useLocation();
  const initial = loc.state as State | null;
  const toast = useToast();
  const [data, setData] = useState<State | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!initial) return;
    setRefreshing(true);
    try {
      const res = await studentFiles(initial.code);
      setData({ code: initial.code, ...res });
    } catch {
      /* kod geçersizleştiyse liste boşalır */
      setData((d) => (d ? { ...d, files: [] } : d));
    } finally {
      setRefreshing(false);
    }
  }, [initial]);

  // Süresi dolan dosyalar listeden kendiliğinden düşsün diye dakikada bir yenilenir.
  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!initial || !data) return <Navigate to="/" replace />;

  const download = async (f: PublicFile) => {
    setBusy(f.id);
    try {
      await studentDownload(data.code, f.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "İndirme başarısız.", "error");
      if (e instanceof ApiError && e.code === "expired") refresh();
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    setBusy("all");
    for (const f of data.files) {
      try {
        await studentDownload(data.code, f.id);
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        /* süresi dolanı atla */
      }
    }
    setBusy(null);
    toast(`${data.files.length} dosya indirildi`);
  };

  return (
    <div className="min-h-screen">
      <Header right={<Link to="/" className="btn-ghost">Başka ders kodu</Link>} />
      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Öğretim üyesi</p>
            <h1 className="mt-1 text-2xl font-semibold">{data.ownerName}</h1>
            {data.ownerDepartment && <p className="text-sm text-zinc-500">{data.ownerDepartment}</p>}
            <p className="mt-3 text-sm text-zinc-500">{data.files.length ? `${data.files.length} dosya paylaşılıyor` : "Şu anda paylaşım yok"}</p>
          </div>
          {data.files.length > 1 && (
            <button className="btn-primary" onClick={downloadAll} disabled={busy !== null}>
              {busy === "all" ? <Spinner light /> : <Download className="h-4 w-4" />}
              Tümünü indir
            </button>
          )}
        </div>

        {data.files.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="Şu anda paylaşılan dosya yok"
            text="Öğretim üyeniz yeni bir materyal paylaştığında burada görünecek."
            action={<button className="btn-ghost" onClick={refresh} disabled={refreshing}>{refreshing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}Yenile</button>}
          />
        ) : (
          <ul className="card divide-y divide-zinc-100">
            {data.files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 p-4 hover:bg-zinc-50 sm:gap-4">
                <FileBadge name={f.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{formatBytes(f.size)}</p>
                </div>
                <button className="btn-icon" title="İndir" aria-label={`${f.name} indir`} onClick={() => download(f)} disabled={busy !== null}>
                  {busy === f.id ? <Spinner /> : <Download className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
