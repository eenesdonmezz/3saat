import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { backend, type Me } from "./backend";
import { Spinner } from "../components/ui";

interface AuthState {
  me: Me | null;
  /** Kendi kendine kayıtta kabul edilen kurum e-posta alan adı */
  domain: string;
  refresh: () => Promise<Me | null>;
  setMe: (m: Me | null) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [domain, setDomain] = useState("");
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const m = await backend.me().catch(() => null);
    setMe(m);
    return m;
  }, []);

  useEffect(() => {
    Promise.all([backend.config().then((c) => setDomain(c.allowedEmailDomain)).catch(() => {}), refresh()]).finally(() => setReady(true));
  }, [refresh]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }
  return <Ctx.Provider value={{ me, domain, refresh, setMe }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider eksik");
  return v;
}
