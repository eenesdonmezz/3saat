import { useEffect, type ReactNode } from "react";

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-zinc-950/25 p-4 backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-toast max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-2 font-semibold">{title}</h3>
        <div className="text-sm text-zinc-500">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}
