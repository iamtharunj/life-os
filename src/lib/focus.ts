// Global focus / meditation timer. Stored as an end timestamp, so it survives reloads and page changes.
import { add, getDB, signal, toast } from './store.ts';
import { isLate } from './derive.ts';
import { recordFocus } from './actions.ts';
import { fmtDate } from './dates.ts';
import { native } from './platform.ts';
import { secure } from './vault.ts';

export interface FocusLink { courseId?: string; projectId?: string; taskId?: string; label?: string }
export interface TimerState {
  kind: 'focus' | 'meditate';
  phase: 'idle' | 'work' | 'break';
  endsAt?: number;
  left?: number; // ms remaining while paused
  workMin: number;
  breakMin: number;
  link: FocusLink;
  medType?: string;
  startedAt?: string;
  cycles: number;
}

const KEY = 'lifeos.timer';
const initial: TimerState = { kind: 'focus', phase: 'idle', workMin: 25, breakMin: 5, link: {}, cycles: 0 };
const load = (): TimerState => {
  if (native) return initial; // the app keeps this encrypted, so it arrives a moment later (below)
  try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return initial; }
};
export const timer = signal<TimerState>(load());
if (native) secure.get(KEY).then(v => { if (v && timer.get() === initial) timer.set({ ...initial, ...JSON.parse(v) }); }).catch(() => {});
timer.subscribe(() => { secure.set(KEY, JSON.stringify(timer.get())).catch(() => {}); });

export const remainingMs = (s: TimerState, now = Date.now()) =>
  s.phase === 'idle' ? s.workMin * 60000 : s.left !== undefined ? s.left : Math.max(0, (s.endsAt ?? now) - now);
export const running = (s: TimerState) => s.phase !== 'idle' && s.left === undefined;
export const fmtClock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function chime(times = 2) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i % 2 ? 660 : 880;
      const t = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 1.3);
    }
  } catch { /* audio unavailable */ }
}
function notify(title: string, body: string) {
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body }); } catch { /* ignore */ }
}

export function startTimer(opts: Partial<TimerState> & { kind: TimerState['kind'] }) {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  const s = { ...timer.get(), ...opts };
  timer.set({ ...s, phase: 'work', endsAt: Date.now() + s.workMin * 60000, left: undefined, startedAt: new Date().toISOString() });
}
export function pauseTimer() {
  const s = timer.get();
  if (!running(s)) return;
  timer.set({ ...s, left: remainingMs(s) });
}
export function resumeTimer() {
  const s = timer.get();
  if (s.left === undefined) return;
  timer.set({ ...s, endsAt: Date.now() + s.left, left: undefined });
}

/** Stop early. Work phases of 5+ minutes still count. */
export function stopTimer() {
  const s = timer.get();
  if (s.phase === 'work' && s.startedAt) {
    const doneMin = (s.workMin * 60000 - remainingMs(s)) / 60000;
    if (doneMin >= 5) save(s, Math.round(doneMin));
  }
  timer.set({ ...s, phase: 'idle', endsAt: undefined, left: undefined });
}

function save(s: TimerState, min: number) {
  if (s.kind === 'meditate') {
    add('meditations', { date: fmtDate(new Date(s.startedAt ?? Date.now())), min, type: s.medType ?? 'Silent' });
    toast(`Meditation logged · ${min} min`);
    return;
  }
  const late = isLate(getDB(), new Date().toISOString());
  recordFocus(min, s.link, s.startedAt ?? new Date().toISOString(), late);
  if (late) toast('Logged, but no XP after bedtime. Sleep is the better investment now.', { kind: 'warn' });
}

/** Called every second by the app shell. */
export function tickTimer() {
  const s = timer.get();
  if (!running(s) || remainingMs(s) > 0) return;
  if (s.phase === 'work') {
    save(s, s.workMin);
    chime(3);
    if (s.kind === 'meditate') {
      notify('Meditation complete', 'Notice how you feel.');
      timer.set({ ...s, phase: 'idle', endsAt: undefined });
      return;
    }
    notify('Focus session complete', `Take a ${s.breakMin}-minute break.`);
    timer.set({ ...s, phase: 'break', endsAt: Date.now() + s.breakMin * 60000, cycles: s.cycles + 1 });
  } else {
    chime(2);
    notify('Break over', 'Ready for another round?');
    toast('Break over. Ready when you are.');
    timer.set({ ...s, phase: 'idle', endsAt: undefined });
  }
}
