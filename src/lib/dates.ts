import type { DateStr } from './types.ts';

// All dates are local-calendar strings; never round-trip through UTC.
const pad = (n: number) => String(n).padStart(2, '0');

export const fmtDate = (d: Date): DateStr => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: DateStr): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = (): DateStr => fmtDate(new Date());
export const addDays = (s: DateStr, n: number): DateStr => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};
export const diffDays = (a: DateStr, b: DateStr): number =>
  Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
export const weekday = (s: DateStr): number => parseDate(s).getDay();
/** Monday of the week containing s */
export const weekStart = (s: DateStr): DateStr => addDays(s, -((weekday(s) + 6) % 7));
export const weekDays = (start: DateStr): DateStr[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const monthKey = (s: DateStr): string => s.slice(0, 7);
export const monthStart = (s: DateStr): DateStr => s.slice(0, 7) + '-01';
export const daysInMonth = (s: DateStr): number => {
  const d = parseDate(monthStart(s));
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};
export const monthEnd = (s: DateStr): DateStr => addDays(monthStart(s), daysInMonth(s) - 1);
export const addMonths = (s: DateStr, n: number): DateStr => {
  const d = parseDate(monthStart(s));
  d.setMonth(d.getMonth() + n);
  return fmtDate(d);
};
export const range = (from: DateStr, to: DateStr): DateStr[] => {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
export const nowMin = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const fmtTime = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return min >= 1440 ? '24:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
export const parseTime = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fmtDur = (min: number): string => {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};
export const fmtHours = (min: number): string => `${(min / 60).toFixed(min >= 600 ? 0 : 1)}h`;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dow = (s: DateStr) => DOW[weekday(s)];
export const dowLong = (s: DateStr) => DOW_LONG[weekday(s)];
export const monthName = (s: DateStr, long = false) => (long ? MON_LONG : MON)[parseDate(s).getMonth()];
export const dayNum = (s: DateStr) => parseDate(s).getDate();
export const shortDate = (s: DateStr) => `${MON[parseDate(s).getMonth()]} ${dayNum(s)}`;
export const niceDate = (s: DateStr) => `${dow(s)}, ${shortDate(s)}`;
export const longDate = (s: DateStr) => `${dowLong(s)}, ${MON_LONG[parseDate(s).getMonth()]} ${dayNum(s)}`;
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export { DOW };

/** "today", "tomorrow", "in 3d", "2d ago" */
export const relDay = (s: DateStr, ref: DateStr = today()): string => {
  const n = diffDays(s, ref);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return `${dow(s)} · ${n}d`;
  return n > 0 ? `in ${n}d` : `${-n}d ago`;
};

export const isoWeek = (s: DateStr): number => {
  const d = parseDate(s);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
};

/** Parse loose date words used in quick capture: today, tom, mon..sun, +3, 12/10, 2026-10-12 */
export const parseDateWord = (w: string, ref: DateStr = today()): DateStr | undefined => {
  const s = w.toLowerCase();
  if (s === 'today' || s === 'tod') return ref;
  if (s === 'tomorrow' || s === 'tom' || s === 'tmr') return addDays(ref, 1);
  if (/^\+\d+d?$/.test(s)) return addDays(ref, parseInt(s.slice(1)));
  if (s === 'nextweek') return addDays(weekStart(ref), 7);
  const i = DOW.findIndex(d => s.startsWith(d.toLowerCase()) && s.length <= 9 && DOW_LONG.some(l => l.toLowerCase().startsWith(s)));
  if (i >= 0) {
    const delta = (i - weekday(ref) + 7) % 7 || 7;
    return addDays(ref, delta);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})$/);
  if (m) {
    const y = parseInt(ref.slice(0, 4));
    let d = `${y}-${pad(+m[2])}-${pad(+m[1])}`; // DD/MM (India)
    if (d < ref) d = `${y + 1}-${pad(+m[2])}-${pad(+m[1])}`;
    return d;
  }
  return undefined;
};
