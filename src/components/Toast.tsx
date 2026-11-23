import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, Check } from "lucide-react";

type Kind = "success" | "error";
interface ToastItem { id: number; text: string; kind: Kind }

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="animate-toast flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm text-white shadow-lg">
            {t.kind === "success" ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-amber-400" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
