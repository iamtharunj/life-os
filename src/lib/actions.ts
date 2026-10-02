// Domain actions: the verbs the UI uses. Each is one small, undo-friendly store write.
import type { Block, DB, DateStr, Habit, Priority, Project, Task } from './types.ts';
import { add, dayLog, getDB, mutate, remove, setDay, toast, uid, update } from './store.ts';
import { addDays, parseDateWord, today, fmtDate } from './dates.ts';
import { habitDone, isLate, nextCycle } from './derive.ts';
import type { Inst as I } from './derive.ts';

// ---------------------------------------------------------------- tasks
export function toggleTask(t: Task) {
  const done = t.status !== 'done';
  const now = new Date().toISOString();
  update('tasks', t.id, { status: done ? 'done' : 'todo', doneAt: done ? now : undefined });
  if (done && isLate(getDB(), now)) toast('Done — but no XP after bedtime. Sleep is the better investment now.', { kind: 'warn' });
}
export function setTaskStatus(t: Task, status: Task['status']) {
  update('tasks', t.id, { status, doneAt: status === 'done' ? t.doneAt ?? new Date().toISOString() : undefined });
}

/**
 * Quick-capture grammar: "Finish report fri !1 #robovitics"
 *  - date words: today, tom, mon..sun, +3d, 12/10, @2026-10-12
 *  - !1 !2 !3 (or !high !med !low) priority
 *  - #word matches a project name or course code/name
 */
export function parseTaskText(text: string, d: DB = getDB()) {
  const out: Partial<Task> & { title: string } = { title: '' };
  const words: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/^@/, '');
    const pr = raw.match(/^!(1|2|3|h|high|m|med|l|low)$/i);
    if (pr) { const k = pr[1].toLowerCase(); out.priority = (k.startsWith('h') || k === '1' ? 1 : k.startsWith('l') || k === '3' ? 3 : 2) as Priority; continue; }
    if (raw.startsWith('#') && raw.length > 2) {
      const q = raw.slice(1).toLowerCase();
      const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const acronym = (s: string) => s.split(/[^A-Za-z0-9]+/).filter(w => w && !/^(of|and|the|&)$/i.test(w)).map(w => w[0]).join('').toLowerCase();
      const c = d.courses.find(c => acronym(c.name) === q) ?? d.courses.find(c => c.code.toLowerCase().includes(q) || squash(c.name).includes(q));
      const p = d.projects.find(p => acronym(p.name) === q || squash(p.name).includes(q));
      if (p) { out.projectId = p.id; continue; }
      if (c) { out.courseId = c.id; continue; }
    }
    const isDateToken = raw.startsWith('@') || /^(today|tod|tomorrow|tom|tmr|nextweek|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\+\d+d?|\d{1,2}[/.]\d{1,2})$/i.test(raw);
    const date = isDateToken ? parseDateWord(w) : undefined;
    if (date) { out.due = date; continue; }
    words.push(raw);
  }
  out.title = words.join(' ').trim();
  return out;
}

export function quickTask(text: string, defaults: Partial<Task> = {}) {
  const p = parseTaskText(text);
  if (!p.title) return;
  const id = add('tasks', { priority: 2, status: 'todo', ...defaults, ...p } as Task);
  return id;
}

export function setTop3(date: DateStr, ids: string[]) { setDay(date, { top3: ids.slice(0, 3) }); }
export function addTop3(date: DateStr, text: string) {
  const cur = dayLog(getDB(), date).top3;
  const id = quickTask(text, { due: date, priority: 1 });
  if (id) setTop3(date, [...cur, id]);
}
export function pinTop3(date: DateStr, taskId: string) {
  const cur = dayLog(getDB(), date).top3;
  if (cur.includes(taskId)) setTop3(date, cur.filter(x => x !== taskId));
  else if (cur.length >= 3) toast('Top 3 is full. Unpin one first — three is the point.');
  else setTop3(date, [...cur, taskId]);
}

// ---------------------------------------------------------------- habits
export function toggleHabit(h: Habit, date: DateStr = today()) {
  const d = getDB();
  if (h.auto) { toast('This habit tracks itself from your logs.'); return; }
  const log = d.habitLogs.find(l => l.habitId === h.id && l.date === date);
  if (log) mutate(x => ({ habitLogs: x.habitLogs.filter(l => l !== log) }));
  else add('habitLogs', { habitId: h.id, date });
}
export const isHabitDone = (h: Habit, date: DateStr) => habitDone(getDB(), h, date);

// ---------------------------------------------------------------- water
export function addWater(date: DateStr, delta: number) {
  const cur = dayLog(getDB(), date).water;
  setDay(date, { water: Math.max(0, cur + delta) });
}

// ---------------------------------------------------------------- blocks
const toggleIn = (xs: DateStr[] | undefined, date: DateStr) => (xs?.includes(date) ? xs.filter(x => x !== date) : [...(xs ?? []), date]);

export function toggleBlockDone(i: I) {
  update('blocks', i.block.id, { done: toggleIn(i.block.done, i.date), missed: i.block.missed?.filter(x => x !== i.date) });
}
export function markMissed(i: I) {
  update('blocks', i.block.id, { missed: toggleIn(i.block.missed, i.date), done: i.block.done?.filter(x => x !== i.date) });
}
export function skipOccurrence(i: I) {
  if (!i.block.repeat?.length) { remove('blocks', i.block.id, 'Block removed'); return; }
  mutate(d => ({ blocks: d.blocks.map(b => (b.id === i.block.id ? { ...b, skip: [...(b.skip ?? []), i.date] } : b)) }), { undoable: true });
  toast('Skipped this occurrence', { action: 'Undo', onAction: () => update('blocks', i.block.id, { skip: i.block.skip }) });
}

/** Move/resize an occurrence. Recurring series detach just this day into a one-off copy. */
export function moveInstance(i: I, date: DateStr, start: number, end: number) {
  const b = i.block;
  if (!b.repeat?.length) { update('blocks', b.id, { date, start, end }); return; }
  const copy: Block = { ...b, id: uid(), date, start, end, repeat: undefined, until: undefined, skip: undefined, done: b.done?.includes(i.date) ? [date] : [], missed: [] };
  mutate(d => ({ blocks: [...d.blocks.map(x => (x.id === b.id ? { ...x, skip: [...(x.skip ?? []), i.date] } : x)), copy] }), { undoable: true });
  toast('Moved this occurrence only', { action: 'Undo', onAction: () => mutate(d => ({ blocks: d.blocks.filter(x => x.id !== copy.id).map(x => (x.id === b.id ? { ...x, skip: b.skip } : x)) })) });
}

// ---------------------------------------------------------------- projects
export function addProjectUpdate(p: Project, text: string, date: DateStr = today()) {
  update('projects', p.id, { updates: [...p.updates, { id: uid(), date, text }] });
}
export function toggleMilestone(p: Project, msId: string) {
  update('projects', p.id, { milestones: p.milestones.map(m => (m.id === msId ? { ...m, done: m.done ? undefined : today() } : m)) });
}
export function addMilestone(p: Project, title: string, due?: DateStr) {
  update('projects', p.id, { milestones: [...p.milestones, { id: uid(), title, due }] });
}

// ---------------------------------------------------------------- finance
export function paySubscription(id: string) {
  const s = getDB().subs.find(x => x.id === id);
  if (!s) return;
  add('txns', { date: today(), amount: s.amount, type: 'expense', category: s.category, method: 'UPI', note: s.name, recurring: true });
  update('subs', s.id, { next: nextCycle(s.next, s.cycle) });
  toast(`Paid ${s.name}. Next due ${nextCycle(s.next, s.cycle)}`);
}

// ---------------------------------------------------------------- gamification
export function claimReward(id: string, available: number) {
  const r = getDB().rewards.find(x => x.id === id);
  if (!r) return;
  if (available < r.cost) { toast(`Need ${r.cost - available} more XP`); return; }
  update('rewards', r.id, { claims: [...r.claims, new Date().toISOString()] });
  toast(`Reward unlocked: ${r.name}. Enjoy it.`, { kind: 'level' });
}
export function claimMission(key: string, xp: number) {
  const d = getDB();
  if (d.missions.some(m => m.key === key)) return;
  mutate(x => ({ missions: [...x.missions, { key, xp, date: today() }] }));
}

// ---------------------------------------------------------------- focus
export function recordFocus(min: number, link: { courseId?: string; projectId?: string; taskId?: string; label?: string }, startISO: string, late: boolean) {
  if (min < 1) return;
  add('focus', { date: fmtDate(new Date(startISO)), start: startISO, min: Math.round(min), late, ...link });
  if (link.taskId) {
    const t = getDB().tasks.find(x => x.id === link.taskId);
    if (t) update('tasks', t.id, { actMin: (t.actMin ?? 0) + Math.round(min), status: t.status === 'todo' ? 'doing' : t.status });
  }
}

export const yesterday = () => addDays(today(), -1);
