import { useEffect, useState, useSyncExternalStore } from "react";
import { getVersion, subscribe } from "./store";

/** Veri katmanı değiştiğinde bileşeni yeniden çizer. */
export function useStore() {
  return useSyncExternalStore(subscribe, getVersion);
}

/** Geri sayımlar için her saniye güncellenen zaman. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
