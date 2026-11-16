import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { formatTime } from '../renderer/PlayerRenderer';

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-white text-black hover:bg-white/90',
    secondary: 'bg-white/10 text-white hover:bg-white/15',
    danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25',
    ghost: 'text-white/70 hover:bg-white/10 hover:text-white',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-[background-color,opacity,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold tracking-wide text-white/50 uppercase">{title}</h3>
        {hint && <p className="mt-1 text-xs text-white/45">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min || 1)) * 100;
  return (
    <label className={`block ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex items-center justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="text-white/50 tabular-nums">{display ?? value}</span>
      </span>
      <input
        type="range"
        className="ios-range mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-white/[0.07] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
            o.value === value ? 'bg-white/20 text-white shadow-sm' : 'text-white/55 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-white/70">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[15px] text-white placeholder-white/30 transition-colors outline-none focus:border-white/40 disabled:opacity-40"
      />
    </label>
  );
}

/** Parse "1:23", "83", atau "1:23.5" menjadi detik. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => Number(p.replace(',', '.')));
  if (parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length > 3) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Input waktu "m:ss" yang baru di-commit saat blur / Enter. */
export function TimeField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (sec: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatTime(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatTime(value));
  }, [value]);
  const commit = () => {
    const v = parseTime(text);
    if (v !== null) onCommit(v);
    setText(formatTime(v ?? value));
  };
  return (
    <label className="block flex-1">
      <span className="text-sm text-white/70">{label}</span>
      <input
        type="text"
        value={text}
        disabled={disabled}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onChange={(e) => setText(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[15px] text-white tabular-nums transition-colors outline-none focus:border-white/40 disabled:opacity-40"
      />
    </label>
  );
}

export function FilePicker({
  accept,
  multiple,
  onFiles,
  children,
  variant = 'secondary',
  className,
  disabled,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Button variant={variant} className={className} disabled={disabled} onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  );
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
