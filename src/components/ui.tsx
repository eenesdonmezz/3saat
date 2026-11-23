import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { extOf } from "../lib/format";
import { resetDemo } from "../lib/store";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <Clock className="h-[18px] w-[18px]" />
      3Saat
    </Link>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="border-b border-zinc-100">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2 text-sm sm:gap-3">{right}</div>
      </div>
    </header>
  );
}

export function FileBadge({ name }: { name: string }) {
  return <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-100 font-mono text-[10px] text-zinc-600 sm:h-11 sm:w-11">{extOf(name)}</div>;
}

export function Spinner({ light }: { light?: boolean }) {
  return <span className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${light ? "border-white/30 border-t-white" : "border-zinc-300 border-t-zinc-900"}`} />;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-14 text-center">
      {icon && <div className="mx-auto mb-4 grid place-items-center text-zinc-300">{icon}</div>}
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="mb-6 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{children}</div>;
}

export function DemoBanner() {
  return (
    <div className="bg-zinc-950 px-4 py-1.5 text-center text-xs text-zinc-300">
      Prototip sürümü · veriler sadece bu tarayıcıda tutulur ·{" "}
      <button className="underline underline-offset-2 hover:text-white" onClick={resetDemo}>Örnek verilere dön</button>
    </div>
  );
}
