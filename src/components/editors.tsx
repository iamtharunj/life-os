import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen, CalendarPlus, CheckSquare, ChevronDown, ChevronUp, Dumbbell, FileText, Flag, Gift, GraduationCap, Layers, Leaf, Lightbulb, Link2,
  Moon, NotebookPen, Plus, Receipt, Repeat, Rocket, Target, Trash2, TrendingUp, Utensils, X, Flame, ClipboardList, Feather, type LucideIcon,
} from 'lucide-react';
import type { Coll, DB } from '../lib/types.ts';
import { add, remove, signal, toast, update, useDB } from '../lib/store.ts';
import { today, fmtTime, parseTime, fmtDur, niceDate, dow, WEEKDAY_LETTERS } from '../lib/dates.ts';
import {
  AREAS, BLOCK_KINDS, CARDIO_KINDS, COURSE_COLORS, COURSE_TYPES, EXAM_TYPES, GOAL_LEVELS, GOAL_METRICS, HABIT_AUTO, HACK_STAGES, JOURNAL_PROMPTS,
  MEAL_SLOTS, MEDITATION_TYPES, PRIORITY, PROJECT_STATUS, PROJECT_TYPES, STUDY_TYPES, TASK_STATUS, WORKOUT_TYPES, kindColor,
} from '../lib/meta.ts';
import { conflictsFor, fmtPace, habitDone, lastSets, activeHabits, sleepLeft, sleepMin, subtasksOf, isDone } from '../lib/derive.ts';
import { addWater, parseTaskText, toggleBlockDone, markMissed, skipOccurrence, toggleHabit, toggleTask } from '../lib/actions.ts';
import { Btn, CheckBox, Chips, IconBtn, Modal, MoodPick, Pill, QuickAdd, Toggle } from './ui.tsx';
import { safeHref } from '../lib/platform.ts';
import { ICONS, IconOf } from './icons.tsx';

// ------------------------------------------------------------------ requests
export type EditorKind =
  | 'task' | 'assignment' | 'block' | 'habit' | 'habitlog' | 'sleep' | 'meal' | 'expense' | 'income' | 'sub' | 'course' | 'exam'
  | 'study' | 'workout' | 'project' | 'goal' | 'note' | 'idea' | 'reward' | 'template' | 'meditation' | 'journal';
export interface EditorReq { kind: EditorKind; id?: string; defaults?: Record<string, unknown>; capture?: boolean; instDate?: string }
export const editor = signal<EditorReq | null>(null);
export const openEditor = (kind: EditorKind, opts: Omit<EditorReq, 'kind'> = {}) => editor.set({ kind, ...opts });
export const openCapture = (kind: EditorKind = 'task', defaults?: Record<string, unknown>) => editor.set({ kind, capture: true, defaults });

/** Auto-tracked habits complete from real logs, so clicking one opens the log that feeds it. */
export function autoHabitAction(a: string) {
  const map: Record<string, () => void> = {
    sleep: () => openCapture('sleep'), workout: () => openCapture('workout'), study: () => openCapture('study'),
    water: () => addWater(today(), 1), project: () => { location.hash = '/projects'; }, protein: () => openCapture('meal'),
    meditate: () => { location.hash = '/mind'; }, journal: () => openCapture('journal'),
  };
  map[a]?.();
}

// ------------------------------------------------------------------ field schema
type Opt = { k: string | number; label: string; color?: string };
type FT = 'text' | 'textarea' | 'num' | 'date' | 'time' | 'select' | 'chips' | 'weekdays' | 'range' | 'bool' | 'mood' | 'icon' | 'color' | 'dur' | 'lines';
interface FD {
  k: string; label: string; t: FT;
  opts?: Opt[] | ((d: DB, v: any) => Opt[]);
  more?: boolean; ph?: string; full?: boolean; auto?: boolean;
  show?: (v: any, d: DB) => boolean;
  hint?: (v: any, d: DB) => ReactNode;
  min?: number; max?: number; step?: number; presets?: number[]; rows?: number; count?: number;
}
interface Def {
  title: string; icon: LucideIcon; coll: Coll; fields: FD[];
  init: (d: DB, def: Record<string, any>) => any;
  toRecord?: (v: any, d: DB, isNew: boolean) => any;
  extra?: (p: { v: any; set: (v: any) => void; d: DB; isNew: boolean }) => ReactNode;
  top?: (p: { v: any; set: (v: any) => void; d: DB }) => ReactNode;
  warn?: (v: any, d: DB) => ReactNode;
  validate?: (v: any) => string | undefined;
  /** For one-record-per-key data (sleep per night): id of the record a new entry should replace. */
  sameAs?: (v: any, d: DB) => string | undefined;
  saved?: string;
  cap: string;
}

const none: Opt = { k: '', label: '—' };
const courseOpts = (d: DB): Opt[] => [none, ...d.courses.map(c => ({ k: c.id, label: `${c.code} · ${c.name}`, color: c.color }))];
const projectOpts = (d: DB): Opt[] => [none, ...d.projects.filter(p => p.status !== 'archived').map(p => ({ k: p.id, label: p.name }))];
const goalOpts = (d: DB): Opt[] => [none, ...d.goals.filter(g => g.status === 'active').map(g => ({ k: g.id, label: `${GOAL_LEVELS[g.level]} · ${g.title}` }))];
const taskOpts = (d: DB): Opt[] => [none, ...d.tasks.filter(t => !isDone(t) && !t.parentId).map(t => ({ k: t.id, label: t.title }))];
const prioOpts: Opt[] = [1, 2, 3].map(k => ({ k, label: PRIORITY[k].label }));
const areaOpts: Opt[] = Object.entries(AREAS).map(([k, a]) => ({ k, label: a.label, color: a.color }));
const cats = (d: DB): Opt[] => d.settings.expenseCategories.map(c => ({ k: c, label: c }));
const dash = (x: unknown) => (x === '' ? undefined : x);
const clean = (o: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dash(v)]));

const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o: any, path: string, val: unknown): any => {
  const [k, ...rest] = path.split('.');
  return { ...o, [k]: rest.length ? setPath(o?.[k] ?? {}, rest.join('.'), val) : val };
};
const nowSlot = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'; };

const taskFields = (assignment: boolean): FD[] => [
  { k: 'title', label: 'Title', t: 'text', auto: true, full: true, ph: assignment ? 'e.g. DME problem set 4' : "What needs doing?  try: 'Lab record fri !1 #HT'",
    hint: (v, d) => { const p = parseTaskText(v.title ?? '', d); const bits = [p.due && `due ${niceDate(p.due)}`, p.priority && PRIORITY[p.priority].label, p.projectId && d.projects.find(x => x.id === p.projectId)?.name, p.courseId && d.courses.find(x => x.id === p.courseId)?.code].filter(Boolean); return bits.length ? `→ ${bits.join(' · ')}` : null; } },
  ...(assignment ? [{ k: 'courseId', label: 'Course', t: 'select', opts: courseOpts } as FD, { k: 'kind', label: 'Type', t: 'chips', opts: [{ k: 'assignment', label: 'Assignment' }, { k: 'lab', label: 'Lab' }] } as FD] : []),
  { k: 'due', label: 'Due', t: 'date' },
  { k: 'priority', label: 'Priority', t: 'chips', opts: prioOpts },
  { k: 'status', label: 'Status', t: 'chips', opts: Object.entries(TASK_STATUS).map(([k, label]) => ({ k, label })), more: true, full: true },
  ...(assignment ? [] : [
    { k: 'area', label: 'Area', t: 'chips', opts: areaOpts, more: true, full: true } as FD,
    { k: 'projectId', label: 'Project', t: 'select', opts: projectOpts, more: true } as FD,
    { k: 'courseId', label: 'Course', t: 'select', opts: courseOpts, more: true } as FD,
  ]),
  { k: 'goalId', label: 'Goal', t: 'select', opts: goalOpts, more: true },
  { k: 'estMin', label: 'Estimate (min)', t: 'num', more: true, min: 0, step: 15 },
  { k: 'actMin', label: 'Actual (min)', t: 'num', more: true, min: 0, step: 15 },
  { k: 'notes', label: 'Notes', t: 'textarea', more: true, full: true },
];
const taskToRecord = (v: any, d: DB) => {
  const p = parseTaskText(v.title ?? '', d);
  const rec = clean({ ...v, ...Object.fromEntries(Object.entries(p).filter(([, x]) => x !== undefined)) });
  rec.priority = Number(rec.priority ?? 2);
  if (rec.status === 'done' && !rec.doneAt) rec.doneAt = new Date().toISOString();
  if (rec.status !== 'done') rec.doneAt = undefined;
  if (rec.estMin !== undefined) rec.estMin = Number(rec.estMin) || undefined;
  if (rec.actMin !== undefined) rec.actMin = Number(rec.actMin) || undefined;
  return rec;
};

const DEFS: Record<Exclude<EditorKind, 'habitlog'>, Def> = {
  task: {
    title: 'Task', icon: CheckSquare, coll: 'tasks', cap: 'Task', saved: 'Task added',
    fields: taskFields(false),
    init: (_d, def) => ({ priority: 2, status: 'todo', kind: 'task', ...def }),
    toRecord: taskToRecord,
    validate: v => (v.title?.trim() ? undefined : 'Give it a title'),
    extra: ({ v, d, isNew }) => <Subtasks parent={v} d={d} isNew={isNew} />,
  },
  assignment: {
    title: 'Assignment', icon: GraduationCap, coll: 'tasks', cap: 'Assignment', saved: 'Assignment added',
    fields: taskFields(true),
    init: (_d, def) => ({ priority: 2, status: 'todo', kind: 'assignment', area: 'academics', due: undefined, ...def }),
    toRecord: taskToRecord,
    validate: v => (v.title?.trim() ? undefined : 'Give it a title'),
  },
  block: {
    title: 'Time block', icon: CalendarPlus, coll: 'blocks', cap: 'Event', saved: 'Block scheduled',
    fields: [
      { k: 'title', label: 'Title', t: 'text', auto: true, full: true, ph: 'e.g. Study: fins & extended surfaces' },
      { k: 'kind', label: 'Type', t: 'chips', full: true, opts: Object.entries(BLOCK_KINDS).map(([k, x]) => ({ k, label: x.label, color: kindColor(k as any) })) },
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'start', label: 'Start', t: 'time' },
      { k: 'end', label: 'End', t: 'time' },
      { k: 'repeat', label: 'Repeat weekly on', t: 'weekdays', full: true },
      { k: 'until', label: 'Repeat until', t: 'date', show: v => !!v.repeat?.length },
      { k: 'location', label: 'Location', t: 'text', more: true },
      { k: 'courseId', label: 'Course', t: 'select', opts: courseOpts, more: true },
      { k: 'projectId', label: 'Project', t: 'select', opts: projectOpts, more: true },
      { k: 'taskId', label: 'Task', t: 'select', opts: taskOpts, more: true },
      { k: 'goalId', label: 'Goal', t: 'select', opts: goalOpts, more: true },
      { k: 'notes', label: 'Notes', t: 'textarea', more: true, full: true },
    ],
    init: (d, def) => ({ kind: 'study', date: today(), start: 18 * 60, end: 19 * 60, done: [], ...def }),
    toRecord: v => { const r = clean(v); if (!r.repeat?.length) { r.repeat = undefined; r.until = undefined; } return r; },
    validate: v => (!v.title?.trim() ? 'Give it a title' : v.end <= v.start ? 'End must be after start' : undefined),
    warn: (v, d) => {
      if (v.end <= v.start) return null;
      const c = conflictsFor(d, v.date, v.start, v.end, v.id);
      const out: ReactNode[] = [];
      if (c.clashes.length) out.push(<div key="c" className="warn-item bad"><Layers />Overlaps {c.clashes.map(x => `${x.block.title} (${fmtTime(x.start)}–${fmtTime(x.end)})`).join(', ')}</div>);
      if (c.intoSleep && v.kind !== 'sleep') {
        const sim = { ...d, blocks: [...d.blocks.filter(b => b.id !== v.id), { ...v, id: v.id ?? 'preview' }] };
        const left = sleepLeft(sim, v.start < 720 && v.end <= 720 ? addDaysLocal(v.date, -1) : v.date);
        out.push(<div key="s" className="warn-item warn"><Moon />Cuts into protected sleep{left.short ? ` — leaves only ${fmtDur(left.min)} (target ${d.settings.sleepTarget}h)` : ''}.</div>);
      }
      return out.length ? <div className="col">{out}</div> : null;
    },
  },
  habit: {
    title: 'Habit', icon: Flame, coll: 'habits', cap: 'Habit',
    fields: [
      { k: 'name', label: 'Name', t: 'text', auto: true, full: true, ph: 'e.g. Read 20 pages' },
      { k: 'freq', label: 'Target days per week', t: 'chips', full: true, opts: [1, 2, 3, 4, 5, 6, 7].map(k => ({ k, label: k === 7 ? 'Daily' : `${k}×` })) },
      { k: 'icon', label: 'Icon', t: 'icon', full: true },
      { k: 'category', label: 'Category', t: 'text', ph: 'Health, Learning…' },
      { k: 'xp', label: 'XP per check-in', t: 'num', min: 0, step: 5, show: v => !v.auto },
      { k: 'auto', label: 'Track automatically from', t: 'select', full: true, opts: [{ k: '', label: 'Manual check-in' }, ...Object.entries(HABIT_AUTO).map(([k, label]) => ({ k, label }))], more: true },
      { k: 'goalId', label: 'Supports goal', t: 'select', opts: goalOpts, more: true },
      { k: 'notes', label: 'Notes', t: 'textarea', more: true, full: true },
    ],
    init: (_d, def) => ({ freq: 7, xp: 10, icon: 'star', category: 'Routine', ...def }),
    toRecord: v => ({ ...clean(v), freq: Number(v.freq), xp: Number(v.xp) || 0 }),
    validate: v => (v.name?.trim() ? undefined : 'Name the habit'),
  },
  sleep: {
    title: 'Sleep', icon: Moon, coll: 'sleep', cap: 'Sleep', saved: 'Sleep logged',
    fields: [
      { k: 'bed', label: 'Went to bed', t: 'time', auto: true },
      { k: 'wake', label: 'Woke up', t: 'time' },
      { k: 'date', label: 'Morning of', t: 'date' },
      { k: 'quality', label: 'Quality', t: 'chips', opts: [1, 2, 3, 4, 5].map(k => ({ k, label: '★'.repeat(k) })) },
      { k: 'notes', label: 'Notes', t: 'text', more: true, full: true, ph: 'Caffeine late? Woke up at night?' },
    ],
    init: (d, def) => ({ date: today(), bed: d.settings.bedtime, wake: d.settings.wake, ...def }),
    toRecord: v => clean(v),
    sameAs: (v, d) => d.sleep.find(l => l.date === v.date && l.id !== v.id)?.id,
    top: ({ v, d }) => {
      const m = sleepMin(v);
      const ok = m >= d.settings.sleepTarget * 60;
      return <div className="row" style={{ marginBottom: 12 }}><span className="hero-num" style={{ fontSize: 34 }}>{fmtDur(m)}</span><Pill tone={ok ? 'good' : 'bad'}>{ok ? '✓ target met' : `${fmtDur(d.settings.sleepTarget * 60 - m)} short`}</Pill></div>;
    },
  },
  meal: {
    title: 'Meal', icon: Utensils, coll: 'meals', cap: 'Meal', saved: 'Meal logged',
    fields: [
      { k: 'slot', label: 'Meal', t: 'chips', full: true, opts: MEAL_SLOTS.map(s => ({ k: s.k, label: s.label })) },
      { k: 'food', label: 'What did you eat?', t: 'text', auto: true, full: true, ph: 'e.g. Rice + dal + curd' },
      { k: 'protein', label: 'Protein (g, approx)', t: 'num', min: 0, step: 1 },
      { k: 'quality', label: 'Food quality', t: 'chips', opts: [{ k: 1, label: 'Poor' }, { k: 2, label: 'Okay' }, { k: 3, label: 'Good' }] },
      { k: 'kcal', label: 'Calories (optional)', t: 'num', more: true, min: 0, step: 10 },
      { k: 'date', label: 'Date', t: 'date', more: true },
      { k: 'skipped', label: 'Skipped this meal', t: 'bool', more: true },
      { k: 'notes', label: 'Notes', t: 'text', more: true, full: true },
    ],
    init: (_d, def) => ({ date: today(), slot: nowSlot(), quality: 2, ...def }),
    toRecord: v => ({ ...clean(v), protein: v.protein === '' || v.protein === undefined ? undefined : Number(v.protein), kcal: v.kcal ? Number(v.kcal) : undefined, food: v.skipped && !v.food ? 'Skipped' : v.food }),
    validate: v => (v.food?.trim() || v.skipped ? undefined : 'What did you eat?'),
    top: ({ v, set, d }) => <FoodPresets v={v} set={set} d={d} />,
  },
  expense: {
    title: 'Expense', icon: Receipt, coll: 'txns', cap: 'Expense', saved: 'Expense logged',
    fields: [
      { k: 'amount', label: 'Amount', t: 'num', auto: true, min: 0, step: 1 },
      { k: 'note', label: 'What for?', t: 'text', ph: 'e.g. Night canteen' },
      { k: 'category', label: 'Category', t: 'chips', full: true, opts: cats },
      { k: 'method', label: 'Paid with', t: 'chips', opts: d => d.settings.paymentMethods.map(k => ({ k, label: k })) },
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'recurring', label: 'Recurring expense', t: 'bool', more: true },
    ],
    init: (d, def) => ({ date: today(), type: 'expense', category: 'Food', method: d.settings.paymentMethods[0], ...def }),
    toRecord: v => ({ ...clean(v), amount: Math.abs(Number(v.amount)) }),
    validate: v => (Number(v.amount) > 0 ? undefined : 'Enter an amount'),
  },
  income: {
    title: 'Income', icon: TrendingUp, coll: 'txns', cap: 'Income', saved: 'Income added',
    fields: [
      { k: 'amount', label: 'Amount', t: 'num', auto: true, min: 0 },
      { k: 'note', label: 'Note', t: 'text', ph: 'e.g. Monthly allowance' },
      { k: 'category', label: 'Source', t: 'chips', full: true, opts: ['Allowance', 'Stipend', 'Freelance', 'Prize', 'Refund', 'Other'].map(k => ({ k, label: k })) },
      { k: 'date', label: 'Date', t: 'date' },
    ],
    init: (_d, def) => ({ date: today(), type: 'income', category: 'Allowance', method: 'Bank', ...def }),
    toRecord: v => ({ ...clean(v), amount: Math.abs(Number(v.amount)) }),
    validate: v => (Number(v.amount) > 0 ? undefined : 'Enter an amount'),
  },
  sub: {
    title: 'Subscription / payment', icon: Repeat, coll: 'subs', cap: 'Payment',
    fields: [
      { k: 'name', label: 'Name', t: 'text', auto: true, ph: 'e.g. Spotify' },
      { k: 'amount', label: 'Amount', t: 'num', min: 0 },
      { k: 'cycle', label: 'Every', t: 'chips', opts: [{ k: 'weekly', label: 'Week' }, { k: 'monthly', label: 'Month' }, { k: 'yearly', label: 'Year' }] },
      { k: 'next', label: 'Next due', t: 'date' },
      { k: 'category', label: 'Category', t: 'select', opts: cats },
      { k: 'active', label: 'Active', t: 'bool' },
    ],
    init: (_d, def) => ({ cycle: 'monthly', next: today(), category: 'Subscriptions', active: true, ...def }),
    toRecord: v => ({ ...clean(v), amount: Number(v.amount) || 0 }),
    validate: v => (v.name?.trim() ? undefined : 'Name it'),
  },
  course: {
    title: 'Course', icon: GraduationCap, coll: 'courses', cap: 'Course',
    fields: [
      { k: 'name', label: 'Course name', t: 'text', auto: true, full: true },
      { k: 'code', label: 'Code', t: 'text', ph: 'BMEE301L' },
      { k: 'credits', label: 'Credits', t: 'num', min: 0 },
      { k: 'faculty', label: 'Faculty', t: 'text' },
      { k: 'type', label: 'Type', t: 'chips', opts: COURSE_TYPES.map(k => ({ k, label: k })) },
      { k: 'color', label: 'Color', t: 'color', full: true },
      { k: 'notes', label: 'Notes', t: 'textarea', full: true, more: true },
    ],
    init: (d, def) => ({ type: 'Theory', color: COURSE_COLORS[d.courses.length % COURSE_COLORS.length], ...def }),
    toRecord: v => ({ ...clean(v), credits: v.credits ? Number(v.credits) : undefined, code: v.code || v.name?.slice(0, 6).toUpperCase() }),
    validate: v => (v.name?.trim() ? undefined : 'Name the course'),
  },
  exam: {
    title: 'Exam', icon: FileText, coll: 'exams', cap: 'Exam',
    fields: [
      { k: 'courseId', label: 'Course', t: 'select', opts: courseOpts, auto: true },
      { k: 'type', label: 'Exam', t: 'chips', full: true, opts: EXAM_TYPES.map(k => ({ k, label: k })) },
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'time', label: 'Time', t: 'time' },
      { k: 'syllabus', label: 'Syllabus', t: 'textarea', full: true },
      { k: 'prep', label: 'Preparation', t: 'range', full: true },
      { k: 'priority', label: 'Priority', t: 'chips', opts: prioOpts },
      { k: 'notes', label: 'Notes', t: 'textarea', more: true, full: true },
    ],
    init: (_d, def) => ({ type: 'CAT-1', date: today(), time: 9 * 60, prep: 0, priority: 2, ...def }),
    toRecord: v => ({ ...clean(v), prep: Number(v.prep) || 0, priority: Number(v.priority) }),
  },
  study: {
    title: 'Study session', icon: BookOpen, coll: 'study', cap: 'Study',
    fields: [
      { k: 'courseId', label: 'Course', t: 'select', opts: courseOpts, auto: true },
      { k: 'topic', label: 'Topic', t: 'text', ph: 'e.g. Transient conduction' },
      { k: 'min', label: 'Duration', t: 'dur', full: true, presets: [25, 45, 60, 90, 120] },
      { k: 'type', label: 'Type', t: 'chips', full: true, opts: STUDY_TYPES.map(k => ({ k, label: k })) },
      { k: 'date', label: 'Date', t: 'date', more: true },
      { k: 'notes', label: 'Notes', t: 'textarea', more: true, full: true },
    ],
    init: (_d, def) => ({ date: today(), min: 60, type: 'Revision', ...def }),
    toRecord: v => ({ ...clean(v), min: Number(v.min) || 0 }),
    validate: v => (Number(v.min) > 0 ? undefined : 'How long?'),
  },
  workout: {
    title: 'Workout', icon: Dumbbell, coll: 'workouts', cap: 'Workout', saved: 'Workout logged',
    fields: [
      { k: 'type', label: 'Activity', t: 'chips', full: true, opts: Object.entries(WORKOUT_TYPES).map(([k, w]) => ({ k, label: w.label })) },
      { k: 'activity', label: 'Cardio type', t: 'chips', full: true, opts: CARDIO_KINDS.map(k => ({ k, label: k })), show: v => v.type === 'cardio' },
      { k: 'min', label: 'Duration', t: 'dur', full: true, presets: [30, 45, 60, 75, 90] },
      { k: 'km', label: 'Distance (km)', t: 'num', step: 0.1, min: 0, show: v => WORKOUT_TYPES[v.type as keyof typeof WORKOUT_TYPES]?.distance, hint: v => (v.km && v.min ? `Pace ${fmtPace(v.min / v.km)}` : null) },
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'effort', label: 'Effort', t: 'chips', more: true, opts: [1, 2, 3, 4, 5].map(k => ({ k, label: ['', 'Easy', 'Light', 'Moderate', 'Hard', 'Max'][k] })) },
      { k: 'notes', label: 'Notes', t: 'textarea', full: true, more: true, ph: 'How did it feel? Anything to remember?' },
    ],
    init: (_d, def) => ({ date: today(), type: 'gym', min: 60, exercises: [], ...def }),
    toRecord: v => ({ ...clean(v), min: Number(v.min) || 0, km: v.km ? Number(v.km) : undefined, exercises: v.type === 'gym' ? (v.exercises ?? []).filter((e: any) => e.name?.trim()) : undefined }),
    extra: ({ v, set, d }) => (v.type === 'gym' ? <ExerciseEditor v={v} set={set} d={d} /> : null),
  },
  project: {
    title: 'Project', icon: Rocket, coll: 'projects', cap: 'Project', saved: 'Project created',
    fields: [
      { k: 'name', label: 'Name', t: 'text', auto: true, full: true },
      { k: 'type', label: 'Type', t: 'chips', full: true, opts: Object.entries(PROJECT_TYPES).map(([k, p]) => ({ k, label: p.label })) },
      { k: 'status', label: 'Status', t: 'select', opts: Object.entries(PROJECT_STATUS).map(([k, label]) => ({ k, label })) },
      { k: 'priority', label: 'Priority', t: 'chips', opts: prioOpts },
      { k: 'deadline', label: 'Deadline', t: 'date' },
      { k: 'start', label: 'Start', t: 'date', more: true },
      { k: 'nextAction', label: 'Next action', t: 'text', full: true, ph: 'The very next physical step' },
      { k: 'goal', label: 'Project goal', t: 'text', full: true, more: true, ph: 'What does done look like?' },
      { k: 'description', label: 'Description', t: 'textarea', full: true, more: true },
      { k: 'team', label: 'Team', t: 'text', more: true },
      { k: 'goalId', label: 'Supports goal', t: 'select', opts: goalOpts, more: true },
      { k: 'progress', label: 'Manual progress (used when there are no tasks or milestones)', t: 'range', full: true, more: true },
      { k: 'hack.competition', label: 'Competition', t: 'text', show: v => v.type === 'hackathon' },
      { k: 'hack.stage', label: 'Stage', t: 'chips', full: true, opts: HACK_STAGES.map(k => ({ k, label: k })), show: v => v.type === 'hackathon' },
      { k: 'hack.regDeadline', label: 'Registration deadline', t: 'date', show: v => v.type === 'hackathon' },
      { k: 'hack.subDeadline', label: 'Submission deadline', t: 'date', show: v => v.type === 'hackathon' },
      { k: 'hack.problem', label: 'Problem statement', t: 'textarea', full: true, show: v => v.type === 'hackathon', more: true },
      { k: 'hack.idea', label: 'Idea', t: 'textarea', full: true, show: v => v.type === 'hackathon', more: true },
      { k: 'hack.stack', label: 'Tech stack', t: 'text', show: v => v.type === 'hackathon', more: true },
      { k: 'hack.submissionLink', label: 'Submission link', t: 'text', show: v => v.type === 'hackathon', more: true },
      { k: 'hack.result', label: 'Result', t: 'text', show: v => v.type === 'hackathon', more: true },
      { k: 'resources', label: 'Resources', t: 'textarea', full: true, more: true },
      { k: 'notes', label: 'Notes', t: 'textarea', full: true, more: true },
    ],
    init: (_d, def) => ({ type: 'personal', status: 'active', priority: 2, start: today(), milestones: [], links: [], updates: [], ...def }),
    toRecord: v => ({ ...clean(v), priority: Number(v.priority), progress: v.progress === undefined ? undefined : Number(v.progress), hack: v.type === 'hackathon' ? v.hack ?? {} : v.hack }),
    validate: v => (v.name?.trim() ? undefined : 'Name the project'),
    extra: ({ v, set }) => <LinksEditor v={v} set={set} />,
  },
  goal: {
    title: 'Goal', icon: Target, coll: 'goals', cap: 'Goal',
    fields: [
      { k: 'title', label: 'Goal', t: 'text', auto: true, full: true },
      { k: 'level', label: 'Horizon', t: 'chips', full: true, opts: Object.entries(GOAL_LEVELS).map(([k, label]) => ({ k, label })) },
      { k: 'parentId', label: 'Part of', t: 'select', full: true, opts: (d, v) => { const order = Object.keys(GOAL_LEVELS); return [none, ...d.goals.filter(g => g.id !== v.id && order.indexOf(g.level) < order.indexOf(v.level)).map(g => ({ k: g.id, label: `${GOAL_LEVELS[g.level]} · ${g.title}` }))]; } },
      { k: 'why', label: 'Why it matters', t: 'textarea', full: true, rows: 2 },
      { k: 'metric', label: 'Progress comes from', t: 'select', full: true, opts: Object.entries(GOAL_METRICS).map(([k, m]) => ({ k, label: m.label })) },
      { k: 'target', label: 'Target', t: 'num', min: 0, show: v => !['auto', 'manual'].includes(v.metric), hint: v => GOAL_METRICS[v.metric as keyof typeof GOAL_METRICS]?.unit },
      { k: 'progress', label: 'Progress', t: 'range', full: true, show: v => v.metric === 'manual' },
      { k: 'deadline', label: 'Deadline', t: 'date' },
      { k: 'start', label: 'Counting from', t: 'date', more: true },
      { k: 'nextAction', label: 'Next action', t: 'text', full: true },
      { k: 'area', label: 'Area', t: 'chips', full: true, more: true, opts: [...areaOpts, { k: 'sleep', label: 'Sleep' }] },
      { k: 'description', label: 'Description', t: 'textarea', full: true, more: true },
      { k: 'status', label: 'Status', t: 'chips', more: true, full: true, opts: ['active', 'done', 'paused', 'dropped'].map(k => ({ k, label: k[0].toUpperCase() + k.slice(1) })) },
    ],
    init: (_d, def) => ({ level: 'quarter', status: 'active', metric: 'auto', start: today(), ...def }),
    toRecord: v => ({ ...clean(v), target: v.target ? Number(v.target) : undefined, progress: v.progress !== undefined ? Number(v.progress) : undefined }),
    validate: v => (v.title?.trim() ? undefined : 'Name the goal'),
  },
  note: {
    title: 'Note', icon: NotebookPen, coll: 'notes', cap: 'Note', saved: 'Saved to inbox',
    fields: [
      { k: 'body', label: 'Note', t: 'textarea', auto: true, full: true, rows: 4, ph: 'Anything. Sort it later.' },
      { k: 'title', label: 'Title', t: 'text', more: true, full: true },
      { k: 'courseId', label: 'Course', t: 'select', opts: courseOpts, more: true },
      { k: 'projectId', label: 'Project', t: 'select', opts: projectOpts, more: true },
      { k: 'pinned', label: 'Pin to Today', t: 'bool', more: true },
    ],
    init: (_d, def) => ({ date: today(), ...def }),
    toRecord: (v, _d, isNew) => ({ ...clean(v), inbox: isNew ? !v.courseId && !v.projectId && !v.pinned : v.inbox }),
    validate: v => (v.body?.trim() ? undefined : 'Write something'),
  },
  idea: {
    title: 'Idea', icon: Lightbulb, coll: 'notes', cap: 'Idea', saved: 'Idea captured',
    fields: [{ k: 'body', label: 'Idea', t: 'textarea', auto: true, full: true, rows: 4, ph: 'Project idea, hackathon angle, thing to try…' }],
    init: (_d, def) => ({ date: today(), idea: true, inbox: true, ...def }),
    toRecord: v => clean(v),
    validate: v => (v.body?.trim() ? undefined : 'Write the idea'),
  },
  reward: {
    title: 'Reward', icon: Gift, coll: 'rewards', cap: 'Reward',
    fields: [
      { k: 'name', label: 'Reward', t: 'text', auto: true, full: true, ph: 'e.g. Movie night' },
      { k: 'cost', label: 'XP cost', t: 'num', min: 0, step: 50 },
      { k: 'icon', label: 'Icon', t: 'icon', full: true },
    ],
    init: (_d, def) => ({ cost: 500, icon: 'gift', claims: [], ...def }),
    toRecord: v => ({ ...clean(v), cost: Number(v.cost) || 0 }),
    validate: v => (v.name?.trim() ? undefined : 'Name it'),
  },
  template: {
    title: 'Workout template', icon: ClipboardList, coll: 'templates', cap: 'Template',
    fields: [
      { k: 'name', label: 'Name', t: 'text', auto: true, full: true, ph: 'Push / Pull / Legs / Full body' },
      { k: 'exercises', label: 'Exercises (one per line)', t: 'lines', full: true },
    ],
    init: (_d, def) => ({ exercises: [], ...def }),
    toRecord: v => ({ ...clean(v), exercises: (v.exercises ?? []).map((s: string) => s.trim()).filter(Boolean) }),
    validate: v => (v.name?.trim() ? undefined : 'Name it'),
  },
  meditation: {
    title: 'Meditation', icon: Leaf, coll: 'meditations', cap: 'Meditate', saved: 'Meditation logged',
    fields: [
      { k: 'type', label: 'Practice', t: 'chips', full: true, opts: MEDITATION_TYPES.map(k => ({ k, label: k })) },
      { k: 'min', label: 'Duration', t: 'dur', full: true, presets: [5, 10, 15, 20, 30] },
      { k: 'moodBefore', label: 'Mood before', t: 'mood' },
      { k: 'moodAfter', label: 'Mood after', t: 'mood' },
      { k: 'date', label: 'Date', t: 'date', more: true },
      { k: 'notes', label: 'Notes', t: 'textarea', full: true, more: true, ph: 'What came up?' },
    ],
    init: (_d, def) => ({ date: today(), type: 'Breathing', min: 10, ...def }),
    toRecord: v => ({ ...clean(v), min: Number(v.min) || 0 }),
    validate: v => (Number(v.min) > 0 ? undefined : 'How long?'),
  },
  journal: {
    title: 'Journal', icon: Feather, coll: 'journal', cap: 'Journal', saved: 'Journal saved',
    fields: [
      { k: 'mood', label: 'How are you feeling?', t: 'mood' },
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'prompt', label: 'Prompt (optional)', t: 'select', full: true, opts: [{ k: '', label: 'Free writing' }, ...JOURNAL_PROMPTS.map(k => ({ k, label: k }))] },
      { k: 'body', label: 'Write', t: 'textarea', auto: true, full: true, rows: 7, ph: 'No rules. Just write what is true right now.' },
      { k: 'gratitude', label: 'Three good things', t: 'lines', full: true, count: 3 },
    ],
    init: (_d, def) => ({ date: today(), gratitude: ['', '', ''], ...def }),
    toRecord: v => ({ ...clean(v), gratitude: (v.gratitude ?? []).filter((s: string) => s?.trim()) }),
    validate: v => (v.body?.trim() || v.gratitude?.some((g: string) => g?.trim()) ? undefined : 'Write a line or a good thing'),
  },
};
const addDaysLocal = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const CAPTURE_KINDS: { k: EditorKind; icon: LucideIcon; label: string }[] = [
  { k: 'task', icon: CheckSquare, label: 'Task' },
  { k: 'expense', icon: Receipt, label: 'Expense' },
  { k: 'meal', icon: Utensils, label: 'Meal' },
  { k: 'workout', icon: Dumbbell, label: 'Workout' },
  { k: 'habitlog', icon: Flame, label: 'Habits' },
  { k: 'sleep', icon: Moon, label: 'Sleep' },
  { k: 'note', icon: NotebookPen, label: 'Note' },
  { k: 'idea', icon: Lightbulb, label: 'Idea' },
  { k: 'assignment', icon: GraduationCap, label: 'Assignment' },
  { k: 'block', icon: CalendarPlus, label: 'Event' },
  { k: 'project', icon: Rocket, label: 'Project' },
  { k: 'meditation', icon: Leaf, label: 'Meditate' },
  { k: 'journal', icon: BookOpen, label: 'Journal' },
  { k: 'study', icon: Flag, label: 'Study' },
];

// ------------------------------------------------------------------ host
export function EditorHost() {
  const req = editor.use();
  const d = useDB();
  if (!req) return null;
  return <EditorModal key={`${req.kind}:${req.id ?? 'new'}:${req.instDate ?? ''}`} req={req} d={d} />;
}

function EditorModal({ req, d }: { req: EditorReq; d: DB }) {
  const close = () => editor.set(null);
  const kindSwitch = req.capture && (
    <div className="cap-kinds" role="tablist" aria-label="Capture type">
      {CAPTURE_KINDS.map(k => (
        <button key={k.k} type="button" role="tab" aria-selected={req.kind === k.k} className={`cap-kind ${req.kind === k.k ? 'on' : ''}`} onClick={() => editor.set({ kind: k.k, capture: true })}>
          <k.icon />{k.label}
        </button>
      ))}
    </div>
  );
  if (req.kind === 'habitlog') {
    return (
      <Modal open onClose={close} title="Quick capture" icon={Plus} wide>
        {kindSwitch}
        <div className="modal-b"><HabitLogger d={d} /></div>
        <div className="modal-f"><Btn variant="ghost" onClick={() => openEditor('habit')}>New habit</Btn><div className="grow" /><Btn variant="primary" onClick={close}>Done</Btn></div>
      </Modal>
    );
  }
  return <FormModal req={req} d={d} close={close} kindSwitch={kindSwitch} />;
}

function FormModal({ req, d, close, kindSwitch }: { req: EditorReq; d: DB; close: () => void; kindSwitch: ReactNode }) {
  const def = DEFS[req.kind as Exclude<EditorKind, 'habitlog'>];
  const existing = req.id ? (d[def.coll] as any[]).find(x => x.id === req.id) : undefined;
  const isNew = !existing;
  const [v, setV] = useState<any>(() => (existing ? structuredClone(existing) : def.init(d, req.defaults ?? {})));
  const [more, setMore] = useState(!isNew);
  const [err, setErr] = useState<string>();
  const visible = def.fields.filter(f => (!f.show || f.show(v, d)));
  const hasMore = visible.some(f => f.more);
  const shown = visible.filter(f => more || !f.more);
  const warn = def.warn?.(v, d);

  const save = () => {
    const e = def.validate?.(v);
    if (e) { setErr(e); return; }
    const rec = def.toRecord ? def.toRecord(v, d, isNew) : v;
    const twin = isNew ? def.sameAs?.(v, d) : undefined;
    if (twin) update(def.coll, twin, { ...rec, id: twin });
    else if (isNew) add(def.coll, rec);
    else update(def.coll, existing.id, rec);
    if (isNew) toast(def.saved ?? `${def.title} added`);
    close();
  };
  const del = () => { remove(def.coll, existing.id, `${def.title} deleted`); close(); };
  const inst = req.instDate && existing && req.kind === 'block'
    ? { key: '', block: existing, date: req.instDate, start: existing.start, end: existing.end, done: !!existing.done?.includes(req.instDate), missed: !!existing.missed?.includes(req.instDate) }
    : undefined;

  return (
    <Modal open onClose={close} title={req.capture ? 'Quick capture' : `${isNew ? 'New' : 'Edit'} ${def.title.toLowerCase()}`} icon={req.capture ? Plus : def.icon} wide={req.capture || def.fields.length > 8}
      footer={<>
        {!isNew && <Btn variant="danger" icon={Trash2} onClick={del}>Delete</Btn>}
        {hasMore && <Btn variant="ghost" icon={more ? ChevronUp : ChevronDown} onClick={() => setMore(!more)}>{more ? 'Fewer' : 'More'} options</Btn>}
        <div className="grow" />
        {err && <span className="bad small">{err}</span>}
        <Btn onClick={close} className="hide-m">Cancel</Btn>
        <Btn variant="primary" onClick={save}>{isNew ? 'Save' : 'Update'} <span className="kbd" style={{ borderColor: 'rgba(0,0,0,.2)', color: 'inherit', background: 'transparent' }}>↵</span></Btn>
      </>}>
      {kindSwitch}
      <form className="modal-b" onSubmit={e => { e.preventDefault(); save(); }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}>
        {inst && (
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <span className="muted small">{dow(inst.date)} {niceDate(inst.date)}:</span>
            <Btn size="sm" variant={inst.done ? 'primary' : undefined} onClick={() => { toggleBlockDone(inst); close(); }}>{inst.block.kind === 'class' ? 'Attended' : 'Done'}</Btn>
            {inst.block.kind === 'class' && <Btn size="sm" onClick={() => { markMissed(inst); close(); }}>{inst.missed ? 'Unmark missed' : 'Missed'}</Btn>}
            {!!inst.block.repeat?.length && <Btn size="sm" onClick={() => { skipOccurrence(inst); close(); }}>Skip this day</Btn>}
            {!!inst.block.repeat?.length && <span className="tiny muted">Edits below change the whole series.</span>}
          </div>
        )}
        {def.top?.({ v, set: setV, d })}
        <div className="form-grid">
          {shown.map(f => <FieldInput key={f.k} f={f} v={v} set={setV} d={d} />)}
        </div>
        {warn && <div className="mt12">{warn}</div>}
        {def.extra?.({ v, set: setV, d, isNew })}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function FieldInput({ f, v, set, d }: { f: FD; v: any; set: (v: any) => void; d: DB }) {
  const val = get(v, f.k);
  const put = (x: unknown) => set(setPath(v, f.k, x));
  const opts = typeof f.opts === 'function' ? f.opts(d, v) : f.opts ?? [];
  const hint = f.hint?.(v, d);
  let input: ReactNode;
  switch (f.t) {
    case 'text': input = <input className="input" value={val ?? ''} placeholder={f.ph} autoFocus={f.auto} onChange={e => put(e.target.value)} />; break;
    case 'textarea': input = <textarea className="textarea" value={val ?? ''} placeholder={f.ph} autoFocus={f.auto} rows={f.rows ?? 3} onChange={e => put(e.target.value)} />; break;
    case 'num': input = <input className="input num" type="number" inputMode="decimal" value={val ?? ''} min={f.min} step={f.step ?? 'any'} autoFocus={f.auto} placeholder={f.ph}
      onChange={e => put(e.target.value === '' ? undefined : Number(e.target.value))} />; break;
    case 'date': input = <input className="input" type="date" value={val ?? ''} onChange={e => put(e.target.value || undefined)} />; break;
    case 'time': input = <input className="input" type="time" value={val !== undefined ? fmtTime(val) : ''} autoFocus={f.auto} step={300} onChange={e => e.target.value && put(parseTime(e.target.value))} />; break;
    case 'select': input = (
      <select className="select" value={val ?? ''} autoFocus={f.auto} onChange={e => put(e.target.value === '' ? undefined : e.target.value)}>
        {opts.map(o => <option key={String(o.k)} value={o.k}>{o.label}</option>)}
      </select>); break;
    case 'chips': input = <Chips options={opts.map(o => ({ k: o.k, label: o.label, color: o.color }))} value={val} onChange={put} />; break;
    case 'weekdays': input = (
      <div className="chips">
        {[1, 2, 3, 4, 5, 6, 0].map(n => {
          const on = (val ?? []).includes(n);
          return <button type="button" key={n} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} style={{ width: 36, justifyContent: 'center' }}
            onClick={() => put(on ? val.filter((x: number) => x !== n) : [...(val ?? []), n])}>{WEEKDAY_LETTERS[n]}</button>;
        })}
        <button type="button" className="chip" onClick={() => put([1, 2, 3, 4, 5])}>Weekdays</button>
        {!!val?.length && <button type="button" className="chip" onClick={() => put([])}>Once</button>}
      </div>); break;
    case 'range': input = <div className="row"><input type="range" min={0} max={100} step={5} value={val ?? 0} onChange={e => put(Number(e.target.value))} /><span className="num small" style={{ width: 38, textAlign: 'right' }}>{val ?? 0}%</span></div>; break;
    case 'bool': input = <div className="row"><Toggle on={!!val} onChange={put} label={f.label} /></div>; break;
    case 'mood': input = <MoodPick value={val} onChange={put} />; break;
    case 'icon': input = (
      <div className="chips">
        {Object.keys(ICONS).slice(0, 24).map(k => <button type="button" key={k} className={`chip ${val === k ? 'on' : ''}`} style={{ width: 34, justifyContent: 'center', padding: 0 }} aria-label={k} onClick={() => put(k)}><IconOf name={k} size={14} /></button>)}
      </div>); break;
    case 'color': input = (
      <div className="chips">{COURSE_COLORS.map(c => <button type="button" key={c} aria-label={c} className={`chip ${val === c ? 'on' : ''}`} style={{ width: 34, justifyContent: 'center', padding: 0 }} onClick={() => put(c)}><span className="swatch" style={{ background: c, width: 14, height: 14 }} /></button>)}</div>); break;
    case 'dur': input = (
      <div className="row wrap">
        {f.presets?.map(p => <button type="button" key={p} className={`chip ${val === p ? 'on' : ''}`} onClick={() => put(p)}>{fmtDur(p)}</button>)}
        <input className="input num" type="number" min={1} value={val ?? ''} onChange={e => put(e.target.value === '' ? undefined : Number(e.target.value))} style={{ width: 90 }} aria-label="minutes" /><span className="muted small">min</span>
      </div>); break;
    case 'lines': {
      const arr: string[] = val ?? [];
      if (f.count) {
        input = <div className="col gap-4">{Array.from({ length: f.count }, (_, i) => <input key={i} className="input" value={arr[i] ?? ''} placeholder={`${i + 1}.`} onChange={e => { const a = [...arr]; a[i] = e.target.value; put(a); }} />)}</div>;
      } else {
        input = <textarea className="textarea" rows={5} value={arr.join('\n')} onChange={e => put(e.target.value.split('\n'))} placeholder="Bench press&#10;Overhead press&#10;…" />;
      }
      break;
    }
  }
  const wide = f.full || ['textarea', 'chips', 'weekdays', 'dur', 'lines', 'icon', 'color'].includes(f.t);
  return (
    <div className={`field ${wide ? 'full' : ''}`}>
      <span>{f.label}</span>
      {input}
      {hint && <em className="tiny accent" style={{ fontStyle: 'normal' }}>{hint}</em>}
    </div>
  );
}

// ------------------------------------------------------------------ custom sections
function Subtasks({ parent, d, isNew }: { parent: any; d: DB; isNew: boolean }) {
  if (isNew) return <p className="tiny muted mt12">Save the task to add subtasks.</p>;
  const subs = subtasksOf(d, parent.id);
  return (
    <div className="mt16">
      <div className="label" style={{ marginBottom: 6 }}>Subtasks {subs.length > 0 && `· ${subs.filter(isDone).length}/${subs.length}`}</div>
      <div className="list">
        {subs.map(s => (
          <div className="li" key={s.id}>
            <CheckBox on={isDone(s)} onChange={() => toggleTask(s)} label={`Complete ${s.title}`} />
            <input className={`input bare grow ${isDone(s) ? 'strike' : ''}`} defaultValue={s.title} onBlur={e => e.target.value.trim() && e.target.value !== s.title && update('tasks', s.id, { title: e.target.value.trim() })} />
            <IconBtn icon={X} sm label="Remove subtask" onClick={() => remove('tasks', s.id, 'Subtask removed')} />
          </div>
        ))}
      </div>
      <div className="mt8"><QuickAdd placeholder="Add subtask" onAdd={t => add('tasks', { title: t, parentId: parent.id, projectId: parent.projectId, courseId: parent.courseId, priority: 2, status: 'todo' })} /></div>
    </div>
  );
}

function FoodPresets({ v, set, d }: { v: any; set: (v: any) => void; d: DB }) {
  const recent = useMemo(() => {
    const seen = new Map<string, number | undefined>();
    for (const m of [...d.meals].reverse()) if (m.slot === v.slot && !m.skipped && !seen.has(m.food) && seen.size < 6) seen.set(m.food, m.protein);
    return seen;
  }, [d.meals, v.slot]);
  const presets = d.settings.foods.filter(f => !f.slot || f.slot === v.slot);
  const all = new Map<string, number | undefined>([...presets.map(p => [p.name, p.protein] as const), ...recent]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="tiny muted" style={{ marginBottom: 6 }}>Tap what you had (mess favourites + recent)</div>
      <div className="chips">
        {[...all.entries()].slice(0, 10).map(([name, p]) => (
          <button type="button" key={name} className={`chip ${v.food === name ? 'on' : ''}`} onClick={() => set({ ...v, food: name, protein: p })}>
            {name}{p !== undefined && <span className="muted num tiny">{p}g</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExerciseEditor({ v, set, d }: { v: any; set: (v: any) => void; d: DB }) {
  const exs: { name: string; sets: { reps: number; kg: number }[] }[] = v.exercises ?? [];
  const put = (next: typeof exs) => set({ ...v, exercises: next });
  const known = useMemo(() => [...new Set([...d.templates.flatMap(t => t.exercises), ...d.workouts.flatMap(w => w.exercises?.map(e => e.name) ?? [])])].sort(), [d.templates, d.workouts]);
  const fromTemplate = (id: string) => {
    const t = d.templates.find(x => x.id === id);
    if (!t) return;
    set({ ...v, template: t.name, exercises: t.exercises.map(name => ({ name, sets: (lastSets(d, name) ?? [{ reps: 8, kg: 0 }, { reps: 8, kg: 0 }, { reps: 8, kg: 0 }]).map(s => ({ ...s })) })) });
  };
  return (
    <div className="mt16">
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="label">Exercises</div>
        <div className="row">
          {d.templates.map(t => <button key={t.id} type="button" className={`chip ${v.template === t.name ? 'on' : ''}`} onClick={() => fromTemplate(t.id)}>{t.name}</button>)}
        </div>
      </div>
      <datalist id="exercise-names">{known.map(k => <option key={k} value={k} />)}</datalist>
      <div className="col">
        {exs.map((ex, i) => (
          <div key={i} className="sub-card">
            <div className="row">
              <input className="input bare bold grow" list="exercise-names" value={ex.name} placeholder="Exercise" onChange={e => put(exs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <IconBtn icon={X} sm label="Remove exercise" onClick={() => put(exs.filter((_, j) => j !== i))} />
            </div>
            <div className="row wrap mt4">
              {ex.sets.map((s, k) => (
                <div key={k} className="row gap-4 pill outline" style={{ height: 30, padding: '0 4px' }}>
                  <input className="input bare num" style={{ width: 34, height: 24, textAlign: 'right' }} type="number" aria-label="reps" value={s.reps} onChange={e => put(exs.map((x, j) => (j === i ? { ...x, sets: x.sets.map((y, m) => (m === k ? { ...y, reps: Number(e.target.value) } : y)) } : x)))} />
                  <span className="muted">×</span>
                  <input className="input bare num" style={{ width: 46, height: 24 }} type="number" step={2.5} aria-label="kg" value={s.kg} onChange={e => put(exs.map((x, j) => (j === i ? { ...x, sets: x.sets.map((y, m) => (m === k ? { ...y, kg: Number(e.target.value) } : y)) } : x)))} />
                  <span className="muted tiny">kg</span>
                  <button type="button" className="icon-btn sm" aria-label="Remove set" onClick={() => put(exs.map((x, j) => (j === i ? { ...x, sets: x.sets.filter((_, m) => m !== k) } : x)))}><X /></button>
                </div>
              ))}
              <Btn size="sm" variant="ghost" icon={Plus} onClick={() => put(exs.map((x, j) => (j === i ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { reps: 8, kg: 0 }) }] } : x)))}>Set</Btn>
            </div>
          </div>
        ))}
        <Btn size="sm" icon={Plus} onClick={() => put([...exs, { name: '', sets: [{ reps: 8, kg: 0 }] }])}>Add exercise</Btn>
      </div>
    </div>
  );
}

function LinksEditor({ v, set }: { v: any; set: (v: any) => void }) {
  const links: { label: string; url: string }[] = v.links ?? [];
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  return (
    <div className="mt16">
      <div className="label" style={{ marginBottom: 6 }}><Link2 />Links</div>
      {links.map((l, i) => (
        <div className="li" key={i}>
          <a className="grow ellipsis accent" href={safeHref(l.url)} target="_blank" rel="noreferrer">{l.label || l.url}</a>
          <IconBtn icon={X} sm label="Remove link" onClick={() => set({ ...v, links: links.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <div className="row mt8">
        <input className="input" placeholder="Label" value={label} onChange={e => setLabel(e.target.value)} style={{ maxWidth: 160 }} />
        <input className="input" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
        <Btn icon={Plus} onClick={() => { if (!url.trim()) return; set({ ...v, links: [...links, { label: label.trim(), url: url.trim() }] }); setLabel(''); setUrl(''); }}>Add</Btn>
      </div>
    </div>
  );
}

export function HabitLogger({ d, date = today() }: { d: DB; date?: string }) {
  const hs = activeHabits(d);
  return (
    <div className="g g2">
      {hs.map(h => {
        const done = habitDone(d, h, date);
        return (
          <div key={h.id} role="button" tabIndex={0} className="sub-card row click" style={{ cursor: 'pointer', opacity: h.auto && !done ? 0.75 : 1 }}
            onClick={() => (h.auto ? autoHabitAction(h.auto) : toggleHabit(h, date))}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!h.auto) toggleHabit(h, date); } }}>
            <CheckBox on={done} onChange={() => (h.auto ? autoHabitAction(h.auto) : toggleHabit(h, date))} label={h.name} />
            <IconOf name={h.icon} />
            <span className="grow">{h.name}</span>
            {h.auto && <Pill tone="outline">auto</Pill>}
          </div>
        );
      })}
    </div>
  );
}
