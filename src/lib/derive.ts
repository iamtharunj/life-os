// Every number the UI shows is computed here from stored records. Nothing is cached in the DB.
import type { Block, DB, DateStr, Goal, Habit, Project, SleepLog, Task, Workout } from './types.ts';
import { addDays, diffDays, fmtDate, fmtDur, monthEnd, monthStart, daysInMonth, range, today, weekStart, weekday, dayNum } from './dates.ts';
import { OPEN_STATUSES } from './meta.ts';

const cache = new WeakMap<DB, Map<string, unknown>>();
export function memo<T>(d: DB, key: string, fn: () => T): T {
  let m = cache.get(d);
  if (!m) cache.set(d, (m = new Map()));
  if (!m.has(key)) m.set(key, fn());
  return m.get(key) as T;
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const inRange = (s: DateStr, from: DateStr, to: DateStr) => s >= from && s <= to;
export const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

// ---------------------------------------------------------------- sleep
export const sleepMin = (l: Pick<SleepLog, 'bed' | 'wake'>) => (((l.wake - l.bed) % 1440) + 1440) % 1440;
/** bedtime on a continuous evening scale: 00:30 -> 24:30 */
export const bedN = (bed: number) => (bed < 720 ? bed + 1440 : bed);

export const sleepByDate = (d: DB) => memo(d, 'sleepByDate', () => {
  const m = new Map<DateStr, SleepLog>();
  for (const l of d.sleep) m.set(l.date, l);
  return m;
});
export const sleepOn = (d: DB, date: DateStr) => sleepByDate(d).get(date);

export function sleepStats(d: DB, from: DateStr, to: DateStr) {
  const target = d.settings.sleepTarget * 60;
  const logs = d.sleep.filter(l => inRange(l.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const mins = logs.map(sleepMin);
  const avg = mins.length ? sum(mins) / mins.length : 0;
  const beds = logs.map(l => bedN(l.bed));
  const bedAvg = beds.length ? sum(beds) / beds.length : 0;
  // consistency = standard deviation of bedtime in minutes
  const spread = beds.length > 1 ? Math.sqrt(sum(beds.map(b => (b - bedAvg) ** 2)) / beds.length) : 0;
  return {
    logs, avg, nights: logs.length, spread, bedAvg: bedAvg % 1440,
    good: mins.filter(m => m >= target).length,
    short: mins.filter(m => m < target).length,
    debt: sum(mins.map(m => Math.max(0, target - m))),
  };
}

/** Minutes of sleep the plan allows for the night after `date` (blocks + routine). */
export function sleepLeft(d: DB, date: DateStr) {
  const s = d.settings;
  let start = bedN(s.bedtime);
  let end = s.wake + 1440;
  let culprit: string | undefined;
  for (const i of blocksOn(d, date)) {
    if (i.block.kind === 'sleep' || i.end <= 720) continue;
    if (i.end > start) { start = i.end; culprit = i.block.title; }
  }
  for (const i of blocksOn(d, addDays(date, 1))) {
    if (i.block.kind === 'sleep') continue;
    if (i.start < 240) { if (1440 + i.end > start) { start = 1440 + i.end; culprit = i.block.title; } }
    else if (i.start < 720 && 1440 + i.start < end) { end = 1440 + i.start; culprit = i.block.title; }
  }
  return { min: Math.max(0, end - start), start: start % 1440, end: end % 1440, culprit, short: end - start < s.sleepTarget * 60 };
}

/** Timestamp falls inside the protected sleep window (bedtime + 1h grace .. wake) */
export function isLate(d: DB, iso: string) {
  const t = new Date(iso);
  let m = t.getHours() * 60 + t.getMinutes();
  if (m < 720) m += 1440;
  return m >= bedN(d.settings.bedtime) + 60 && m < d.settings.wake + 1440;
}

// ---------------------------------------------------------------- blocks
export interface Inst { key: string; block: Block; date: DateStr; start: number; end: number; done: boolean; missed: boolean }

export function occursOn(b: Block, date: DateStr) {
  if (!b.repeat?.length) return b.date === date;
  return b.date <= date && (!b.until || date <= b.until) && b.repeat.includes(weekday(date)) && !b.skip?.includes(date);
}
export function blocksOn(d: DB, date: DateStr): Inst[] {
  return memo(d, 'blocks:' + date, () =>
    d.blocks
      .filter(b => occursOn(b, date))
      .map(b => ({
        key: `${b.id}@${date}`, block: b, date, start: b.start, end: b.end,
        done: !!b.done?.includes(date), missed: !!b.missed?.includes(date),
      }))
      .sort((a, b) => a.start - b.start || b.end - a.end));
}

/** Side-by-side columns for overlapping blocks; `overlap` marks real conflicts. */
export function layoutDay(insts: { key: string; start: number; end: number; block?: Block }[]) {
  const out = new Map<string, { col: number; cols: number; overlap: boolean }>();
  const sorted = [...insts].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: typeof sorted = [];
  let colsEnd: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const i of cluster) out.get(i.key)!.cols = colsEnd.length;
    cluster = []; colsEnd = [];
  };
  for (const i of sorted) {
    if (i.start >= clusterEnd) close();
    let col = colsEnd.findIndex(e => e <= i.start);
    if (col < 0) { col = colsEnd.length; colsEnd.push(i.end); } else colsEnd[col] = i.end;
    const overlap = sorted.some(o => o !== i && o.start < i.end && i.start < o.end && o.block?.kind !== 'sleep' && i.block?.kind !== 'sleep');
    out.set(i.key, { col, cols: 1, overlap });
    cluster.push(i);
    clusterEnd = Math.max(clusterEnd, i.end);
  }
  close();
  return out;
}

/** Protected sleep windows inside one calendar day, as [start, end) minute ranges. */
export function sleepBands(s: { bedtime: number; wake: number }): [number, number][] {
  return s.bedtime >= 720 ? [[0, s.wake], [s.bedtime, 1440]] : [[s.bedtime, s.wake]];
}

export function conflictsFor(d: DB, date: DateStr, start: number, end: number, ignoreId?: string) {
  const clashes = blocksOn(d, date).filter(i => i.block.id !== ignoreId && i.block.kind !== 'sleep' && i.start < end && start < i.end);
  const intoSleep = sleepBands(d.settings).some(([a, b]) => start < b && a < end);
  return { clashes, intoSleep };
}

// ---------------------------------------------------------------- tasks
export const isDone = (t: Task) => t.status === 'done';
export const topTasks = (d: DB) => d.tasks.filter(t => !t.parentId);
export const subtasksOf = (d: DB, id: string) => d.tasks.filter(t => t.parentId === id);
export const doneOn = (t: Task, date: DateStr) => !!t.doneAt && fmtDate(new Date(t.doneAt)) === date;

export function tasksForDay(d: DB, date: DateStr) {
  const top3 = d.days[date]?.top3 ?? [];
  return topTasks(d).filter(t =>
    (isDone(t) ? doneOn(t, date) : (t.due && t.due <= date) || top3.includes(t.id)));
}

export const taskSort = (a: Task, b: Task) =>
  Number(isDone(a)) - Number(isDone(b)) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.priority - b.priority;

// ---------------------------------------------------------------- study & focus
export function studyMin(d: DB, from: DateStr, to: DateStr, courseId?: string) {
  const ok = (c?: string) => (courseId ? c === courseId : true);
  return sum(d.study.filter(s => inRange(s.date, from, to) && ok(s.courseId)).map(s => s.min)) +
    sum(d.focus.filter(f => inRange(f.date, from, to) && f.courseId && ok(f.courseId)).map(f => f.min));
}
export const focusMin = (d: DB, from: DateStr, to: DateStr) => sum(d.focus.filter(f => inRange(f.date, from, to)).map(f => f.min));

// ---------------------------------------------------------------- diet
export const mealsOn = (d: DB, date: DateStr) => d.meals.filter(m => m.date === date);
export const proteinOn = (d: DB, date: DateStr) => sum(mealsOn(d, date).map(m => m.protein ?? 0));
export const kcalOn = (d: DB, date: DateStr) => sum(mealsOn(d, date).map(m => m.kcal ?? 0));

export function dietStats(d: DB, from: DateStr, to: DateStr) {
  const days = range(from, to).filter(x => x <= today());
  const logged = days.filter(x => mealsOn(d, x).length);
  const slotsFilled = sum(days.map(x => new Set(mealsOn(d, x).map(m => m.slot)).size));
  const water = days.map(x => d.days[x]?.water ?? 0);
  return {
    days: days.length,
    avgProtein: logged.length ? sum(logged.map(x => proteinOn(d, x))) / logged.length : 0,
    proteinDays: logged.filter(x => proteinOn(d, x) >= d.settings.proteinTarget).length,
    meals: d.meals.filter(m => inRange(m.date, from, to) && !m.skipped).length,
    consistency: pct(slotsFilled, days.length * 4),
    incomplete: days.filter(x => new Set(mealsOn(d, x).map(m => m.slot)).size < 3).length,
    avgWater: water.length ? sum(water) / water.length : 0,
  };
}

// ---------------------------------------------------------------- fitness
export const workoutsIn = (d: DB, from: DateStr, to: DateStr) =>
  d.workouts.filter(w => inRange(w.date, from, to)).sort((a, b) => b.date.localeCompare(a.date));
export const training = (ws: Workout[]) => ws.filter(w => w.type !== 'rest');
export const runKm = (ws: Workout[]) => sum(ws.filter(w => w.type === 'run').map(w => w.km ?? 0));
export const pace = (w: Pick<Workout, 'min' | 'km'>) => (w.km ? w.min / w.km : 0);
export const fmtPace = (p: number) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}/km` : '–');

export function personalRecords(d: DB) {
  return memo(d, 'prs', () => {
    const best = new Map<string, { name: string; kg: number; reps: number; date: DateStr; e1rm: number }>();
    for (const w of d.workouts) for (const ex of w.exercises ?? []) for (const s of ex.sets) {
      const e1rm = s.kg * (1 + s.reps / 30); // Epley estimate
      const cur = best.get(ex.name);
      if (!cur || s.kg > cur.kg || (s.kg === cur.kg && s.reps > cur.reps)) best.set(ex.name, { name: ex.name, kg: s.kg, reps: s.reps, date: w.date, e1rm });
    }
    const runs = d.workouts.filter(w => w.type === 'run' && w.km);
    const longest = runs.reduce<Workout | undefined>((a, w) => (!a || (w.km ?? 0) > (a.km ?? 0) ? w : a), undefined);
    const fastest = runs.filter(w => (w.km ?? 0) >= 3).reduce<Workout | undefined>((a, w) => (!a || pace(w) < pace(a) ? w : a), undefined);
    return { lifts: [...best.values()].sort((a, b) => b.kg - a.kg), longest, fastest };
  });
}

export function lastSets(d: DB, exercise: string) {
  const ws = [...d.workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of ws) { const ex = w.exercises?.find(e => e.name === exercise); if (ex?.sets.length) return ex.sets; }
  return undefined;
}

// ---------------------------------------------------------------- mindfulness
export const meditationsIn = (d: DB, from: DateStr, to: DateStr) => d.meditations.filter(m => inRange(m.date, from, to));
export const journalOn = (d: DB, date: DateStr) => d.journal.filter(j => j.date === date);
export function mindStats(d: DB, from: DateStr, to: DateStr) {
  const meds = meditationsIn(d, from, to);
  const entries = d.journal.filter(j => inRange(j.date, from, to));
  const moods = [...entries.map(j => j.mood), ...meds.map(m => m.moodAfter)].filter((x): x is number => !!x);
  const lifts = meds.filter(m => m.moodBefore && m.moodAfter).map(m => m.moodAfter! - m.moodBefore!);
  return {
    minutes: sum(meds.map(m => m.min)),
    sessions: meds.length,
    days: new Set(meds.map(m => m.date)).size,
    entries: entries.length,
    journalDays: new Set(entries.map(j => j.date)).size,
    words: sum(entries.map(j => j.body.trim().split(/\s+/).filter(Boolean).length)),
    avgMood: moods.length ? sum(moods) / moods.length : 0,
    moodLift: lifts.length ? sum(lifts) / lifts.length : 0,
    gratitude: sum(entries.map(j => j.gratitude?.filter(Boolean).length ?? 0)),
  };
}
export function moodOn(d: DB, date: DateStr) {
  const xs = [...journalOn(d, date).map(j => j.mood), ...d.meditations.filter(m => m.date === date).map(m => m.moodAfter)].filter((x): x is number => !!x);
  return xs.length ? sum(xs) / xs.length : 0;
}

// ---------------------------------------------------------------- projects
export function projectProgress(d: DB, p: Project) {
  const tasks = d.tasks.filter(t => t.projectId === p.id && !t.parentId);
  const total = tasks.length + p.milestones.length * 2; // milestones weigh double
  if (!total) return p.progress ?? 0;
  const done = tasks.filter(isDone).length + p.milestones.filter(m => m.done).length * 2;
  return Math.round((done / total) * 100);
}

export function projectLast(d: DB, p: Project): DateStr | undefined {
  const dates = [
    ...p.updates.map(u => u.date),
    ...p.milestones.flatMap(m => (m.done ? [m.done] : [])),
    ...d.tasks.filter(t => t.projectId === p.id && t.doneAt).map(t => fmtDate(new Date(t.doneAt!))),
    ...d.focus.filter(f => f.projectId === p.id).map(f => f.date),
  ];
  return dates.sort().pop() ?? p.start ?? p.createdAt?.slice(0, 10);
}

export function projectDeadline(p: Project) {
  const ds = [p.deadline, p.hack?.subDeadline].filter((x): x is string => !!x);
  return ds.sort()[0];
}

export function projectAttention(d: DB, p: Project, ref = today()) {
  const reasons: { text: string; level: 'bad' | 'warn' }[] = [];
  if (!OPEN_STATUSES.includes(p.status)) return reasons;
  const dl = projectDeadline(p);
  if (dl) {
    const n = diffDays(dl, ref);
    if (n < 0) reasons.push({ text: `Deadline passed ${-n}d ago`, level: 'bad' });
    else if (n <= 7) reasons.push({ text: n === 0 ? 'Due today' : `Due in ${n}d`, level: n <= 2 ? 'bad' : 'warn' });
  }
  if (p.hack?.regDeadline && p.hack.regDeadline >= ref && diffDays(p.hack.regDeadline, ref) <= 5 && (!p.hack.stage || p.hack.stage === 'Ideation'))
    reasons.push({ text: `Registration closes in ${diffDays(p.hack.regDeadline, ref)}d`, level: 'warn' });
  if (p.status === 'blocked') reasons.push({ text: 'Blocked', level: 'bad' });
  const last = projectLast(d, p);
  if (last && p.status === 'active') {
    const idle = diffDays(ref, last);
    if (idle >= 5) reasons.push({ text: `No progress in ${idle}d`, level: idle >= 10 ? 'bad' : 'warn' });
  }
  if (!p.nextAction?.trim()) reasons.push({ text: 'No next action', level: 'warn' });
  return reasons;
}

export function attentionScore(d: DB, p: Project) {
  return sum(projectAttention(d, p).map(r => (r.level === 'bad' ? 3 : 1))) + (4 - p.priority);
}

// ---------------------------------------------------------------- finance
export const expensesIn = (d: DB, from: DateStr, to: DateStr) => d.txns.filter(t => t.type === 'expense' && inRange(t.date, from, to));
export const spendIn = (d: DB, from: DateStr, to: DateStr) => sum(expensesIn(d, from, to).map(t => t.amount));

export function balance(d: DB) {
  const s = d.settings;
  const since = d.txns.filter(t => t.date >= s.openingDate);
  return s.openingBalance + sum(since.map(t => (t.type === 'income' ? t.amount : -t.amount)));
}

export function monthFinance(d: DB, anyDay: DateStr, ref = today()) {
  const from = monthStart(anyDay), to = monthEnd(anyDay);
  const exp = expensesIn(d, from, to);
  const spent = sum(exp.map(t => t.amount));
  const income = sum(d.txns.filter(t => t.type === 'income' && inRange(t.date, from, to)).map(t => t.amount));
  const budget = d.settings.monthlyBudget;
  const days = daysInMonth(anyDay);
  const isCurrent = ref >= from && ref <= to;
  const elapsed = isCurrent ? dayNum(ref) : ref > to ? days : 0;
  const cats = new Map<string, number>();
  for (const t of exp) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  return {
    from, to, spent, income, budget, days, elapsed,
    remaining: budget - spent,
    usedPct: budget ? (spent / budget) * 100 : 0,
    pacePct: (elapsed / days) * 100,
    safePerDay: isCurrent ? Math.max(0, (budget - spent) / (days - elapsed + 1)) : 0,
    saved: income - spent,
    byCat: [...cats.entries()].map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt),
    largest: [...exp].sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

export const upcomingPayments = (d: DB, days = 14, ref = today()) =>
  d.subs.filter(s => s.active && s.next <= addDays(ref, days)).sort((a, b) => a.next.localeCompare(b.next));

export function nextCycle(date: DateStr, cycle: 'weekly' | 'monthly' | 'yearly') {
  if (cycle === 'weekly') return addDays(date, 7);
  const [y, m, dd] = date.split('-').map(Number);
  const nd = cycle === 'monthly' ? new Date(y, m, 1) : new Date(y + 1, m - 1, 1);
  const last = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
  nd.setDate(Math.min(dd, last));
  return fmtDate(nd);
}

// ---------------------------------------------------------------- habits
const habitLogSet = (d: DB) => memo(d, 'habitLogSet', () => new Set(d.habitLogs.map(l => `${l.habitId}|${l.date}`)));
const projectActivityDays = (d: DB) => memo(d, 'projDays', () => new Set([
  ...d.projects.flatMap(p => p.updates.map(u => u.date)),
  ...d.tasks.filter(t => t.projectId && t.doneAt).map(t => fmtDate(new Date(t.doneAt!))),
  ...d.focus.filter(f => f.projectId).map(f => f.date),
]));

export function habitDone(d: DB, h: Habit, date: DateStr): boolean {
  switch (h.auto) {
    case 'sleep': { const l = sleepOn(d, date); return !!l && sleepMin(l) >= d.settings.sleepTarget * 60; }
    case 'workout': return d.workouts.some(w => w.date === date && w.type !== 'rest');
    case 'study': return studyMin(d, date, date) >= 30;
    case 'water': return (d.days[date]?.water ?? 0) >= d.settings.waterTarget;
    case 'project': return projectActivityDays(d).has(date);
    case 'protein': return proteinOn(d, date) >= d.settings.proteinTarget;
    case 'meditate': return d.meditations.some(m => m.date === date);
    case 'journal': return d.journal.some(j => j.date === date);
    default: return habitLogSet(d).has(`${h.id}|${date}`);
  }
}

/**
 * Streaks that forgive. Daily habits use "never miss twice": one missed day keeps the streak alive,
 * two in a row resets it. Habits with a weekly target count consecutive weeks that hit the target.
 */
export function habitStreak(d: DB, h: Habit, ref = today()) {
  return memo(d, `streak:${h.id}:${ref}`, () => {
    const from = addDays(ref, -364);
    let cur = 0, best = 0;
    if (h.freq >= 7) {
      let missedPrev = false;
      for (const day of range(from, ref)) {
        if (habitDone(d, h, day)) { cur++; missedPrev = false; }
        else if (day === ref) { /* today isn't over */ }
        else if (missedPrev) { cur = 0; }
        else missedPrev = true;
        best = Math.max(best, cur);
      }
      return { cur, best, unit: 'day' as const };
    }
    for (let w = weekStart(from); w <= ref; w = addDays(w, 7)) {
      const count = range(w, addDays(w, 6)).filter(x => x <= ref && habitDone(d, h, x)).length;
      if (count >= h.freq) cur++;
      else if (w !== weekStart(ref)) cur = 0;
      best = Math.max(best, cur);
    }
    return { cur, best, unit: 'week' as const };
  });
}

export function habitRate(d: DB, h: Habit, from: DateStr, to: DateStr) {
  const days = range(from, to).filter(x => x <= today());
  if (!days.length) return 0;
  const done = days.filter(x => habitDone(d, h, x)).length;
  return pct(done, Math.max(1, (days.length * h.freq) / 7));
}
export const activeHabits = (d: DB) => d.habits.filter(h => !h.archived);
export function habitsWeekPct(d: DB, ws: DateStr) {
  const hs = activeHabits(d);
  return hs.length ? Math.round(sum(hs.map(h => habitRate(d, h, ws, addDays(ws, 6)))) / hs.length) : 0;
}

// ---------------------------------------------------------------- goals
export function goalValue(d: DB, g: Goal) {
  const from = g.start ?? g.createdAt?.slice(0, 10) ?? '0000-01-01';
  const to = g.deadline ?? '9999-12-31';
  switch (g.metric) {
    case 'run_km': return runKm(workoutsIn(d, from, to));
    case 'workouts': return training(workoutsIn(d, from, to)).length;
    case 'study_h': return studyMin(d, from, to) / 60;
    case 'focus_h': return focusMin(d, from, to) / 60;
    case 'sleep_nights': return sleepStats(d, from, to).good;
    case 'saved': return sum(d.txns.filter(t => inRange(t.date, from, to)).map(t => (t.type === 'income' ? t.amount : -t.amount)));
    default: return undefined;
  }
}

export function goalProgress(d: DB, g: Goal, depth = 0): number {
  if (g.status === 'done') return 100;
  if (g.metric === 'manual') return g.progress ?? 0;
  const v = goalValue(d, g);
  if (v !== undefined) return g.target ? pct(Math.max(0, v), g.target) : 0;
  if (depth > 6) return 0;
  const parts: number[] = [
    ...d.goals.filter(c => c.parentId === g.id && c.status !== 'dropped').map(c => goalProgress(d, c, depth + 1)),
    ...d.projects.filter(p => p.goalId === g.id).map(p => projectProgress(d, p)),
    ...d.habits.filter(h => h.goalId === g.id && !h.archived).map(h => habitRate(d, h, addDays(today(), -29), today())),
  ];
  const tasks = d.tasks.filter(t => t.goalId === g.id);
  if (tasks.length) parts.push(pct(tasks.filter(isDone).length, tasks.length));
  return parts.length ? Math.round(sum(parts) / parts.length) : g.progress ?? 0;
}

/** Expected progress if the goal were on pace (for "on track?" comparisons) */
export function goalPace(g: Goal, ref = today()) {
  if (!g.deadline) return undefined;
  const start = g.start ?? g.createdAt?.slice(0, 10);
  if (!start) return undefined;
  const total = diffDays(g.deadline, start);
  return total > 0 ? Math.max(0, Math.min(100, Math.round((diffDays(ref, start) / total) * 100))) : 100;
}

// ---------------------------------------------------------------- XP
export interface XPEntry { date: DateStr; xp: number; label: string; src: string }

export function xpLedger(d: DB): XPEntry[] {
  return memo(d, 'xp', () => {
    const x = d.settings.xp;
    const out: XPEntry[] = [];
    const target = d.settings.sleepTarget * 60;
    for (const t of d.tasks) if (t.status === 'done' && t.doneAt) {
      const late = isLate(d, t.doneAt);
      out.push({ date: fmtDate(new Date(t.doneAt)), xp: late ? 0 : t.priority === 1 ? x.taskHigh : x.task, label: late ? `${t.title} (after bedtime, no XP)` : t.title, src: 'task' });
    }
    for (const l of d.habitLogs) {
      const h = d.habits.find(h => h.id === l.habitId);
      if (h && !h.auto) out.push({ date: l.date, xp: h.xp, label: h.name, src: 'habit' });
    }
    for (const l of d.sleep) if (sleepMin(l) >= target) out.push({ date: l.date, xp: x.sleep, label: `Slept ${fmtDur(sleepMin(l))}`, src: 'sleep' });
    for (const w of d.workouts) if (w.type !== 'rest') out.push({ date: w.date, xp: x.workout, label: `Workout · ${w.type}`, src: 'workout' });
    for (const s of d.study) { const n = Math.floor(s.min / 30); if (n) out.push({ date: s.date, xp: n * x.study30, label: `Study · ${s.topic || fmtDur(s.min)}`, src: 'study' }); }
    for (const f of d.focus) out.push({ date: f.date, xp: f.late ? 0 : x.focus, label: f.late ? 'Focus after bedtime (no XP)' : `Focus · ${f.label || fmtDur(f.min)}`, src: 'focus' });
    for (const m of d.meditations) out.push({ date: m.date, xp: x.meditation, label: `Meditation · ${fmtDur(m.min)}`, src: 'mind' });
    const journalDays = new Set<string>();
    for (const j of d.journal) if (!journalDays.has(j.date)) { journalDays.add(j.date); out.push({ date: j.date, xp: x.journal, label: 'Journal entry', src: 'mind' }); }
    for (const r of d.reviews) {
      const v = r.kind === 'day' ? x.dayReview : r.kind === 'week' ? x.weekReview : x.monthReview;
      out.push({ date: (r.updatedAt ?? r.createdAt ?? r.period).slice(0, 10), xp: v, label: `${r.kind[0].toUpperCase() + r.kind.slice(1)} review`, src: 'review' });
    }
    for (const p of d.projects) {
      for (const u of p.updates) out.push({ date: u.date, xp: x.projectUpdate, label: `${p.name}: ${u.text}`, src: 'project' });
      for (const m of p.milestones) if (m.done) out.push({ date: m.done, xp: x.milestone, label: `Milestone · ${m.title}`, src: 'project' });
    }
    for (const m of d.missions) out.push({ date: m.date, xp: m.xp, label: 'Mission complete', src: 'mission' });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  });
}

/** XP needed to go from level L to L+1 */
export const levelNeed = (L: number) => 300 + 150 * (L - 1);
export function levelFor(total: number) {
  let level = 1, rest = total;
  while (rest >= levelNeed(level)) { rest -= levelNeed(level); level++; }
  return { level, into: rest, need: levelNeed(level) };
}
const TITLES: [number, string][] = [[30, 'Legend'], [20, 'Sage'], [15, 'Ranger'], [10, 'Adept'], [5, 'Apprentice'], [1, 'Novice']];
export const levelTitle = (L: number) => TITLES.find(([n]) => L >= n)![1];

export function xpTotals(d: DB, ref = today()) {
  const led = xpLedger(d);
  const total = sum(led.map(e => e.xp));
  const spent = sum(d.rewards.flatMap(r => r.claims.map(() => r.cost)));
  const ws = weekStart(ref);
  return {
    total, spent, available: total - spent,
    today: sum(led.filter(e => e.date === ref).map(e => e.xp)),
    week: sum(led.filter(e => e.date >= ws && e.date <= ref).map(e => e.xp)),
    ...levelFor(total),
  };
}

// ---------------------------------------------------------------- weekly missions
export interface Mission { key: string; title: string; desc: string; value: number; target: number; xp: number; unit: string; claimed: boolean }

export function missions(d: DB, ws: DateStr): Mission[] {
  const we = addDays(ws, 6);
  const s = d.settings;
  const sl = sleepStats(d, ws, we);
  const diet = dietStats(d, ws, we);
  const projDays = range(ws, we).filter(x => projectActivityDays(d).has(x)).length;
  const mind = mindStats(d, ws, we);
  const list: Omit<Mission, 'claimed'>[] = [
    { key: 'rested', title: 'Well rested', desc: `Sleep ≥ ${s.sleepTarget}h on 5 nights`, value: sl.good, target: 5, xp: 100, unit: 'nights' },
    { key: 'scholar', title: 'Scholar', desc: `Study ${s.weekly.studyHours}h this week`, value: +(studyMin(d, ws, we) / 60).toFixed(1), target: s.weekly.studyHours, xp: 100, unit: 'h' },
    { key: 'athlete', title: 'Athlete', desc: `${s.weekly.workouts} training sessions`, value: training(workoutsIn(d, ws, we)).length, target: s.weekly.workouts, xp: 100, unit: 'sessions' },
    { key: 'builder', title: 'Builder', desc: 'Move a project forward on 3 days', value: projDays, target: 3, xp: 80, unit: 'days' },
    { key: 'fuel', title: 'Fuelled', desc: `Hit ${s.proteinTarget}g protein on 4 days`, value: diet.proteinDays, target: 4, xp: 60, unit: 'days' },
    { key: 'calm', title: 'Still mind', desc: `${s.weekly.mindfulMin} min of meditation`, value: mind.minutes, target: s.weekly.mindfulMin, xp: 60, unit: 'min' },
  ];
  return list.map(m => ({ ...m, key: `${ws}:${m.key}`, claimed: d.missions.some(c => c.key === `${ws}:${m.key}`) }));
}

// ---------------------------------------------------------------- day progress
export function dayProgress(d: DB, date: DateStr) {
  const tasks = tasksForDay(d, date);
  const blocks = blocksOn(d, date).filter(i => !['meal', 'sleep'].includes(i.block.kind));
  const habits = activeHabits(d).filter(h => h.freq >= 7 || habitDone(d, h, date));
  const done = tasks.filter(isDone).length + blocks.filter(b => b.done).length + habits.filter(h => habitDone(d, h, date)).length;
  const total = tasks.length + blocks.length + habits.length;
  return { done, total, pct: pct(done, total) };
}

// ---------------------------------------------------------------- warnings
export interface Warn { key: string; level: 'info' | 'warn' | 'bad'; text: string; to?: string; kind: string }

export function warnings(d: DB, now = new Date()): Warn[] {
  const ref = fmtDate(now);
  const on = d.settings.warnings;
  const out: Warn[] = [];
  const ws = weekStart(ref);
  if (on.logsleep && !sleepOn(d, ref) && now.getHours() >= 5)
    out.push({ key: 'logsleep', level: 'info', text: 'Last night\'s sleep isn\'t logged yet.', to: '/sleep', kind: 'logsleep' });
  if (on.sleep) {
    const short = sleepStats(d, ws, ref).short;
    if (short >= 2) out.push({ key: 'sleep', level: short >= 3 ? 'bad' : 'warn', text: `Sleep target missed ${short} nights this week.`, to: '/sleep', kind: 'sleep' });
  }
  if (on.schedule) {
    const left = sleepLeft(d, ref);
    if (left.short) out.push({ key: 'schedule', level: 'bad', text: `Tonight's schedule leaves only ${fmtDur(left.min)} for sleep${left.culprit ? ` (${left.culprit})` : ''}. Move something, not your sleep.`, to: '/week', kind: 'schedule' });
  }
  if (on.deadline) {
    const soon = addDays(ref, 2);
    for (const t of topTasks(d)) if (!isDone(t) && t.due && t.due >= ref && t.due <= soon && t.kind && t.kind !== 'task')
      out.push({ key: 'dl:' + t.id, level: t.due === ref ? 'bad' : 'warn', text: `${t.title} due ${t.due === ref ? 'today' : diffDays(t.due, ref) === 1 ? 'tomorrow' : `in ${diffDays(t.due, ref)} days`}.`, to: '/academics', kind: 'deadline' });
    for (const e of d.exams) if (e.date >= ref && diffDays(e.date, ref) <= 3) {
      const c = d.courses.find(c => c.id === e.courseId);
      out.push({ key: 'ex:' + e.id, level: 'warn', text: `${c?.code ?? ''} ${e.type} in ${diffDays(e.date, ref) || 0} days · prep ${e.prep}%.`, to: '/academics', kind: 'deadline' });
    }
  }
  if (on.overdue) {
    const n = topTasks(d).filter(t => !isDone(t) && t.due && t.due < ref).length;
    if (n) out.push({ key: 'overdue', level: 'warn', text: `${n} overdue task${n > 1 ? 's' : ''}.`, to: '/tasks', kind: 'overdue' });
  }
  if (on.tasks && now.getHours() >= 17) {
    const n = tasksForDay(d, ref).filter(t => !isDone(t) && t.due === ref).length;
    if (n >= 3) out.push({ key: 'tasks', level: 'info', text: `${n} unfinished tasks today. Reschedule what won't happen tonight.`, to: '/tasks', kind: 'tasks' });
  }
  if (on.project) for (const p of d.projects) {
    if (p.status !== 'active') continue;
    const last = projectLast(d, p);
    const idle = last ? diffDays(ref, last) : 0;
    if (idle >= 6) out.push({ key: 'pj:' + p.id, level: 'warn', text: `No progress on ${p.name} in ${idle} days.`, to: `/projects/${p.id}`, kind: 'project' });
  }
  if (on.budget) {
    const f = monthFinance(d, ref, ref);
    if (f.budget && f.usedPct >= 100) out.push({ key: 'budget', level: 'bad', text: `Monthly budget exceeded by ${d.settings.currency}${Math.round(-f.remaining)}.`, to: '/finance', kind: 'budget' });
    else if (f.budget && f.usedPct >= 80 && f.usedPct > f.pacePct) out.push({ key: 'budget', level: 'warn', text: `${Math.round(f.usedPct)}% of this month's budget used (${Math.round(f.pacePct)}% of the month gone).`, to: '/finance', kind: 'budget' });
  }
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------------------------------------------------------------- search
export interface Hit { kind: string; id: string; title: string; sub?: string }
export function search(d: DB, q: string): Hit[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const m = (...xs: (string | number | undefined)[]) => xs.some(x => x !== undefined && String(x).toLowerCase().includes(s));
  const hits: Hit[] = [];
  for (const t of d.tasks) if (m(t.title, t.notes)) hits.push({ kind: t.kind === 'assignment' || t.kind === 'lab' ? 'assignment' : 'task', id: t.id, title: t.title, sub: t.due ? `due ${t.due}` : t.status });
  for (const p of d.projects) if (m(p.name, p.description, p.team, p.hack?.competition)) hits.push({ kind: 'project', id: p.id, title: p.name, sub: p.status });
  for (const c of d.courses) if (m(c.name, c.code, c.faculty)) hits.push({ kind: 'course', id: c.id, title: `${c.code} · ${c.name}`, sub: c.faculty });
  for (const n of d.notes) if (m(n.title, n.body)) hits.push({ kind: 'note', id: n.id, title: n.title || n.body.slice(0, 60), sub: n.date });
  for (const j of d.journal) if (m(j.body, j.prompt, ...(j.gratitude ?? []))) hits.push({ kind: 'journal', id: j.id, title: j.body.slice(0, 60) || 'Journal', sub: j.date });
  for (const t of d.txns) if (m(t.note, t.category, t.amount)) hits.push({ kind: 'expense', id: t.id, title: `${d.settings.currency}${t.amount} · ${t.note || t.category}`, sub: t.date });
  for (const b of d.blocks) if (m(b.title, b.location)) hits.push({ kind: 'block', id: b.id, title: b.title, sub: b.repeat?.length ? 'recurring' : b.date });
  for (const g of d.goals) if (m(g.title, g.description, g.why)) hits.push({ kind: 'goal', id: g.id, title: g.title, sub: g.level });
  for (const h of d.habits) if (m(h.name, h.category)) hits.push({ kind: 'habit', id: h.id, title: h.name, sub: h.category });
  for (const e of d.exams) if (m(e.type, e.syllabus, d.courses.find(c => c.id === e.courseId)?.code)) hits.push({ kind: 'exam', id: e.id, title: `${d.courses.find(c => c.id === e.courseId)?.code ?? ''} ${e.type}`, sub: e.date });
  return hits.slice(0, 40);
}

// ---------------------------------------------------------------- avatar speech (hover)
export function buddyLines(d: DB, now = new Date()): string[] {
  if (isLate(d, now.toISOString())) return ['Past bedtime. The quests will wait — go sleep.', 'Sleep is the real power-up. See you tomorrow.'];
  const T = fmtDate(now);
  const xp = xpTotals(d, T);
  const lines = [`Level ${xp.level} ${levelTitle(xp.level)}. ${xp.need - xp.into} XP to the next level.`];
  const l = sleepOn(d, T);
  if (l) lines.push(sleepMin(l) >= d.settings.sleepTarget * 60 ? `${fmtDur(sleepMin(l))} of sleep. Fully charged.` : `Only ${fmtDur(sleepMin(l))} of sleep. Go easy today, bed early tonight.`);
  const top = d.days[T]?.top3 ?? [];
  const done = top.filter(id => d.tasks.find(t => t.id === id)?.status === 'done').length;
  if (top.length) lines.push(done === top.length ? 'Top 3 cleared. Legendary.' : `Top 3: ${done}/${top.length} done. Which one next?`);
  const best = activeHabits(d).map(h => ({ h, s: habitStreak(d, h, T) })).sort((a, b) => b.s.cur - a.s.cur)[0];
  if (best && best.s.cur >= 3) lines.push(`${best.s.cur}-${best.s.unit} streak on “${best.h.name}”. Don't break it.`);
  if (xp.today) lines.push(`+${xp.today} XP today. Nice.`);
  lines.push('One thing at a time.', 'Small steps still count.', 'Hydrate. Seriously.');
  return lines;
}
