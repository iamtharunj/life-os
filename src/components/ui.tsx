import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Check, Plus, X, type LucideIcon } from 'lucide-react';
import { signal } from '../lib/store.ts';

// ------------------------------------------------------------------ router (hash based)
const readHash = () => (location.hash.replace(/^#/, '') || '/today');
export const route = signal(readHash());
window.addEventListener('hashchange', () => { route.set(readHash()); window.scrollTo({ top: 0 }); });
export const nav = (to: string) => { if (readHash() !== to) location.hash = to; };
export const useRoute = () => route.use().split('?')[0].split('/').filter(Boolean);

// ------------------------------------------------------------------ hooks
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
/** Local UI state that survives reloads (tabs, filters). Never used for real data. */
export function usePref<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem('lifeos.pref.' + key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  const set = (x: T) => { setV(x); try { localStorage.setItem('lifeos.pref.' + key, JSON.stringify(x)); } catch { /* ignore */ } };
  return [v, set] as const;
}

// ------------------------------------------------------------------ format
export const money = (n: number, cur = '₹') =>
  `${n < 0 ? '−' : ''}${cur}${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
export const compact = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------------ primitives
export function Card({ title, icon: Icon, actions, children, className = '', style, id }: {
  title?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children?: ReactNode; className?: string; style?: CSSProperties; id?: string;
}) {
  return (
    <section className={`card ${className}`} style={style} id={id}>
      {(title || actions) && (
        <div className="card-h">
          {title && <div className="label">{Icon && <Icon />}{title}</div>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'lg'; icon?: LucideIcon };
export function Btn({ variant, size, icon: Icon, children, className = '', ...rest }: BtnProps) {
  return (
    <button type="button" className={`btn ${variant ?? ''} ${size ?? ''} ${className}`} {...rest}>
      {Icon && <Icon />}{children}
    </button>
  );
}
export function IconBtn({ icon: Icon, label, sm, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; sm?: boolean }) {
  return <button type="button" className={`icon-btn ${sm ? 'sm' : ''} ${className}`} aria-label={label} title={label} {...rest}><Icon /></button>;
}

export function CheckBox({ on, onChange, round, lg, label, color }: { on: boolean; onChange: () => void; round?: boolean; lg?: boolean; label: string; color?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} title={label}
      className={`check ${on ? 'on' : ''} ${round ? 'round' : ''} ${lg ? 'lg' : ''}`}
      style={color && on ? { background: color, borderColor: color } : color ? { borderColor: color } : undefined}
      onClick={e => { e.stopPropagation(); onChange(); }}>
      {on && <Check />}
    </button>
  );
}

export function Meter({ value, color, thick, pixel, title }: { value: number; color?: string; thick?: boolean; pixel?: boolean; title?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`meter ${thick ? 'thick' : ''} ${pixel ? 'pixel' : ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} title={title ?? `${Math.round(v)}%`}>
      <i style={{ width: `${v}%`, ...(color ? (pixel ? { background: `repeating-linear-gradient(90deg, ${color} 0 8px, transparent 8px 10px)` } : { background: color }) : {}) }} />
    </div>
  );
}

export function Pill({ children, tone, color, className = '', title }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'accent' | 'outline'; color?: string; className?: string; title?: string }) {
  return (
    <span className={`pill ${tone ?? ''} ${className}`} title={title}>
      {color && <span className="dot" style={{ background: color }} />}{children}
    </span>
  );
}

export function Stat({ k, v, unit, d, tone, big }: { k: ReactNode; v: ReactNode; unit?: string; d?: ReactNode; tone?: 'good' | 'warn' | 'bad'; big?: boolean }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v" style={big ? { fontSize: 30 } : undefined}>{v}{unit && <small>{unit}</small>}</div>
      {d && <div className={`d ${tone ?? 'muted'}`}>{d}</div>}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint, action }: { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div className="t">{title}</div>
      {hint && <div className="small">{hint}</div>}
      {action && <div className="mt8">{action}</div>}
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { k: K; label: ReactNode; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.k} role="tab" aria-selected={value === t.k} className={value === t.k ? 'on' : ''} onClick={() => onChange(t.k)}>
          {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<K extends string | number>({ options, value, onChange }: { options: { k: K; label: ReactNode; icon?: LucideIcon }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(o => (
        <button key={String(o.k)} type="button" role="radio" aria-checked={value === o.k} className={value === o.k ? 'on' : ''} onClick={() => onChange(o.k)}>
          {o.icon && <o.icon />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<K extends string | number>({ options, value, onChange, allowNone }: {
  options: { k: K; label: ReactNode; color?: string; icon?: LucideIcon }[]; value: K | undefined; onChange: (k: K | undefined) => void; allowNone?: boolean;
}) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={String(o.k)} type="button" className={`chip ${value === o.k ? 'on' : ''}`} aria-pressed={value === o.k}
          onClick={() => onChange(allowNone && value === o.k ? undefined : o.k)}>
          {o.color && <span className="sw" style={{ background: o.color }} />}{o.icon && <o.icon />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: ReactNode }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <em className="tiny muted" style={{ fontStyle: 'normal' }}>{hint}</em>}
    </label>
  );
}

export function Modal({ open, onClose, title, icon: Icon, children, footer, wide, className = '' }: {
  open: boolean; onClose: () => void; title?: ReactNode; icon?: LucideIcon; children: ReactNode; footer?: ReactNode; wide?: boolean; className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-h">
            {Icon && <Icon size={18} className="accent" />}
            <h3 className="grow">{title}</h3>
            <IconBtn icon={X} label="Close" onClick={onClose} />
          </div>
        )}
        {children}
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 6, color = 'var(--accent)', track = 'var(--card-3)', children }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function QuickAdd({ placeholder, onAdd, icon: Icon = Plus, autoFocus }: { placeholder: string; onAdd: (text: string) => void; icon?: LucideIcon; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="quick-add">
      <Icon />
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder}
        onKeyDown={e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          if (v.trim()) { onAdd(v.trim()); setV(''); }
        }} />
      {v && <span className="kbd">↵</span>}
    </div>
  );
}

const FACES = ['', '😣', '😕', '😐', '🙂', '😄'];
export function MoodPick({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="mood" role="radiogroup" aria-label="Mood">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} title={['', 'Rough', 'Low', 'Okay', 'Good', 'Great'][n]}
          onClick={() => onChange(value === n ? undefined : n)}>{FACES[n]}</button>
      ))}
    </div>
  );
}
export const moodFace = (n?: number) => (n ? FACES[Math.round(n)] : '');

/** Query params from the hash route, e.g. #/calendar?view=month&day=2026-10-01 */
export const useQuery = () => new URLSearchParams(route.use().split('?')[1] ?? '');

/** True on phone-sized screens; layouts switch to mobile-first variants rather than shrinking. */
export function useMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

/** Subtle 3D tilt + glow that follows the cursor. Spread onto a `.tilt` element. */
export const tilt = {
  onMouseMove(e: React.MouseEvent<HTMLElement>) {
    if (document.documentElement.dataset.motion === 'off') return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  },
  onMouseLeave(e: React.MouseEvent<HTMLElement>) {
    e.currentTarget.style.removeProperty('--rx');
    e.currentTarget.style.removeProperty('--ry');
  },
};
