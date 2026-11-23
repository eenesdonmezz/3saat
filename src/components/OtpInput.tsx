import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
  disabled?: boolean;
}

/**
 * 6 kutulu ders kodu girişi.
 * Tek bir gerçek input kutuların üzerinde durur; yazma, silme, yapıştırma ve
 * telefonlardaki SMS/klavye önerileri sorunsuz çalışır.
 */
export function OtpInput({ value, onChange, onComplete, error, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");

  // Kontrol bittiğinde (hatalı kod vb.) imleç tekrar kutulara döner.
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  return (
    <div className="relative mx-auto w-fit" onClick={() => ref.current?.focus()}>
      <div className="flex justify-center gap-1.5 sm:gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const current = focused && !disabled && (i === value.length || (i === 5 && value.length === 6));
          return (
            <div key={i} className="flex">
              {i === 3 && <div className="w-2 sm:w-3" />}
              <div
                className={`grid h-14 w-11 place-items-center rounded-lg border bg-white font-mono text-2xl transition sm:h-16 sm:w-14 ${
                  error ? "border-red-500" : current ? "border-zinc-950" : "border-zinc-200"
                } ${disabled ? "text-zinc-400" : ""}`}
              >
                {digits[i] ?? ""}
              </div>
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6 haneli ders kodu"
        maxLength={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(clean);
          if (clean.length === 6) onComplete?.(clean);
        }}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
