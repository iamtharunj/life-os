import { useSyncExternalStore } from 'react';
import type { Coll, DB, DateStr, DayLog, ID, Settings } from './types.ts';
import { today } from './dates.ts';
import * as cloud from './cloud.ts';
import { native } from './platform.ts';
import { secure, Unreadable } from './vault.ts';

// ---------------------------------------------------------------------------
// Tiny signal: module-level state any component can subscribe to.
export function signal<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v: T | ((p: T) => T)) {
      value = typeof v === 'function' ? (v as (p: T) => T)(value) : v;
      subs.forEach(f => f());
    },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
    use(): T { return useSyncExternalStore(this.subscribe, this.get); },
  };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: Settings = {
  name: 'Tharun',
  accent: '#7dff6a',
  theme: 'dark',
  banner: true,
  motion: true,
  sleepTarget: 7.5,
  bedtime: 23 * 60 + 15,
  wake: 6 * 60 + 45,
  waterTarget: 8,
  proteinTarget: 90,
  kcalTarget: 0,
  currency: '₹',
  monthlyBudget: 8000,
  openingBalance: 12000,
  openingDate: today().slice(0, 7) + '-01',
  savingsGoal: 3000,
  expenseCategories: ['Food', 'Transport', 'College', 'Fitness', 'Shopping', 'Entertainment', 'Subscriptions', 'Projects', 'Other'],
  paymentMethods: ['UPI', 'Cash', 'Card'],
  foods: [
    { name: 'Idli + sambar', protein: 10, slot: 'breakfast' },
    { name: 'Eggs + bread', protein: 18, slot: 'breakfast' },
    { name: 'Poha', protein: 6, slot: 'breakfast' },
    { name: 'Rice + dal + sabzi', protein: 16, slot: 'lunch' },
    { name: 'Chicken curry + rice', protein: 32, slot: 'lunch' },
    { name: 'Paneer + roti', protein: 24, slot: 'dinner' },
    { name: 'Chapati + dal', protein: 15, slot: 'dinner' },
    { name: 'Protein shake', protein: 24, slot: 'snack' },
    { name: 'Sprouts / chana', protein: 9, slot: 'snack' },
    { name: 'Tea + biscuits', protein: 2, slot: 'snack' },
  ],
  weekly: { studyHours: 12, workouts: 4, runKm: 12, mindfulMin: 60, muscleSets: 10 },
  muscleOf: {},
  xp: {
    task: 10, taskHigh: 25, sleep: 20, workout: 30, study30: 10, focus: 10,
    dayReview: 10, weekReview: 60, monthReview: 120, projectUpdate: 15, milestone: 50, meditation: 15, journal: 15,
  },
  warnings: { sleep: true, deadline: true, tasks: true, schedule: true, project: true, budget: true, overdue: true, logsleep: true },
  gridStart: 7,
};

export const emptyDB = (): DB => ({
  version: 1,
  savedAt: new Date(0).toISOString(),
  settings: structuredClone(DEFAULT_SETTINGS),
  tasks: [], blocks: [], habits: [], habitLogs: [], sleep: [], meals: [], txns: [], subs: [],
  courses: [], exams: [], study: [], workouts: [], templates: [], projects: [], goals: [],
  notes: [], rewards: [], reviews: [], focus: [], meditations: [], journal: [], missions: [], days: {}, weekTop3: {},
});

/** Fill any keys missing from older/imported files so the app never crashes on shape drift. */
export function migrate(raw: Partial<DB>): DB {
  const base = emptyDB();
  const out = { ...base, ...raw } as DB;
  out.settings = { ...base.settings, ...(raw.settings ?? {}) };
  out.settings.xp = { ...base.settings.xp, ...(raw.settings?.xp ?? {}) };
  out.settings.weekly = { ...base.settings.weekly, ...(raw.settings?.weekly ?? {}) };
  out.settings.warnings = { ...base.settings.warnings, ...(raw.settings?.warnings ?? {}) };
  for (const k of Object.keys(base) as (keyof DB)[]) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) (out as any)[k] = [];
  }
  return out;
}

export function isDB(x: unknown): x is DB {
  return !!x && typeof x === 'object' && 'settings' in x && 'tasks' in x && Array.isArray((x as DB).tasks);
}

// ---------------------------------------------------------------------------
// The database
const LS_KEY = 'lifeos.db';
const LS_REV = 'lifeos.rev'; // cloud revision this device last synced
const LS_DIRTY = 'lifeos.dirty'; // '1' while this device holds changes the cloud hasn't accepted yet
let db: DB = emptyDB();
const listeners = new Set<() => void>();
export type SyncState = 'loading' | 'saved' | 'saving' | 'local' | 'offline' | 'error';
export const sync = signal<SyncState>('loading');
export const ready = signal(false);
/** Where the planner lives: a file via the local server, the encrypted cloud copy, or only this browser. */
export const storage = signal<'file' | 'cloud' | 'browser'>('browser');
/** Hosted build only: what has to happen before the planner can open. */
export type GateKind = 'setup' | 'unlock' | 'unconfigured' | 'offline' | 'recover';
export const gate = signal<null | { kind: GateKind; salt?: string; note?: string; empty?: boolean }>(null);

export const getDB = () => db;
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useDB = (): DB => useSyncExternalStore(subscribe, getDB);

let serverOK = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
let pushing = false;
let rev = 0;
let seedFn: () => DB = emptyDB;

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* quota or private mode */ } },
};
const setRev = (n: number) => { rev = n; ls.set(LS_REV, String(n)); };
/** Write this device's copy of the planner (encrypted in the app). False only in the app, when that write failed. */
async function keepLocal(body: string) {
  try { await secure.set(LS_KEY, body); return true; }
  catch { return !native; } // website: a full or blocked localStorage was always ignored
}

function setDB(next: DB, persist = true) {
  db = next;
  listeners.forEach(f => f());
  if (persist) scheduleSave();
}

function scheduleSave() {
  pending = true;
  sync.set('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, storage.get() === 'cloud' ? 1500 : 400);
}

export async function flush() {
  clearTimeout(saveTimer);
  if (!pending) return;
  pending = false;
  db = { ...db, savedAt: new Date().toISOString() };
  const body = JSON.stringify(db);
  const kept = await keepLocal(body);
  if (storage.get() === 'cloud') return flushCloud(body, kept);
  if (!serverOK) { sync.set('local'); return; }
  try {
    const r = await fetch('/api/db', { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } });
    sync.set(r.ok ? 'saved' : 'error');
  } catch {
    sync.set('error');
    pending = true; // retry on next change / focus
  }
}

async function flushCloud(body: string, kept = true) {
  if (pushing) { pending = true; return; } // one upload at a time; the running one re-flushes when it finishes
  pushing = true;
  ls.set(LS_DIRTY, '1');
  try {
    const r = await cloud.push(body, rev, db.savedAt);
    if (r.ok) {
      setRev(r.rev);
      ls.set(LS_DIRTY, '');
      if (!pending) sync.set('saved');
    } else {
      // Another device saved first. Take its copy rather than overwrite it.
      await adoptCloud();
      toast('Another device saved newer data, so it was loaded here. Your last change on this device was not kept.', { kind: 'warn' });
    }
  } catch (e) {
    if (e instanceof cloud.WrongPassphrase) { relock(); return; }
    pending = true; // offline or server trouble: the change is safe on this device and retried on reconnect
    sync.set(kept ? 'offline' : 'error'); // never "saved here" when the copy on this device was not written
  } finally {
    pushing = false;
    if (pending && sync.get() !== 'offline') scheduleSave();
  }
}

/** Replace this device's planner with the cloud copy. */
async function adoptCloud() {
  const latest = await cloud.pull();
  if (!latest) return;
  setRev(latest.rev);
  ls.set(LS_DIRTY, '');
  await keepLocal(latest.json);
  pending = false;
  clearTimeout(saveTimer);
  setDB(migrate(JSON.parse(latest.json)), false);
  sync.set('saved');
}
async function relock() { await cloud.forget(); location.reload(); }

/** This device's copy. Throws Unreadable (app only) when it exists but cannot be decrypted. */
async function readLocal(): Promise<DB | null> {
  try {
    const raw = await secure.get(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return isDB(parsed) ? parsed : null;
  } catch (e) { if (e instanceof Unreadable) throw e; return null; }
}

async function readServer(): Promise<DB | null | undefined> {
  try {
    const r = await fetch('/api/db', { cache: 'no-store' });
    if (!r.ok) return undefined;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return undefined; // static hosting without the API
    serverOK = true;
    const parsed = await r.json();
    return isDB(parsed) ? parsed : null;
  } catch { return undefined; }
}

// ponytail: whole-document sync; the file server is last-write-wins, the cloud refuses stale saves (409).
// Per-record merge if two devices ever need to edit at the same moment.
let refreshing = false;
/** Pick up newer data from the server (window focus, back online, app resumed). */
export async function refresh() {
  if (!ready.get() || refreshing) return;
  if (pending) { flush(); return; }
  refreshing = true;
  try {
    if (storage.get() === 'cloud') {
      const now = await cloud.meta();
      if (!now) return; // still offline
      try {
        if ((now.rev ?? 0) !== rev) await adoptCloud();
        else if (sync.get() === 'offline') sync.set('saved');
      } catch (e) { if (e instanceof cloud.WrongPassphrase) relock(); }
      return;
    }
    const s = await readServer();
    if (s && s.savedAt > db.savedAt) setDB(migrate(s), false);
  } finally { refreshing = false; }
}

export async function load(seed: () => DB) {
  seedFn = seed;
  let lostKeys = false;
  try { await cloud.restore(); } catch { lostKeys = true; } // app only: saved keys exist but cannot be decrypted
  const m = await cloud.meta();
  // The app always syncs with the hosted backend; the website decides by what its own server offers.
  if (native || m || cloud.savedCreds()) { storage.set('cloud'); await loadCloud(m, lostKeys); }
  else await loadFile();

  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else refresh();
  });
  window.addEventListener('pagehide', () => {
    if (pending) keepLocal(JSON.stringify(db));
  });
}

async function loadFile() {
  const [server, local] = [await readServer(), await readLocal()];
  if (serverOK) storage.set('file');
  let chosen: DB | null = server ?? null;
  // Prefer whichever copy was saved most recently (e.g. edits made while the server was down)
  if (local && (!chosen || local.savedAt > chosen.savedAt)) chosen = local;
  if (chosen) setDB(migrate(chosen), chosen !== server && serverOK);
  else setDB(seedFn(), true);
  if (!pending) sync.set(serverOK ? 'saved' : 'local');
  ready.set(true);
}

async function loadCloud(m?: cloud.Meta, lostKeys = false) {
  rev = Number(ls.get(LS_REV)) || 0;
  if (m && !m.configured) { gate.set({ kind: 'unconfigured' }); return; }
  const creds = cloud.savedCreds();
  if (!creds || (m?.exists && creds.salt !== m.salt)) {
    await cloud.forget();
    const note = lostKeys ? 'This phone could not read its saved keys, so it needs your passphrase again.' : undefined;
    // Offline with no keys (app only): we cannot tell whether a planner exists, so neither create nor unlock yet.
    gate.set(m ? { kind: m.exists ? 'unlock' : 'setup', salt: m.salt, note } : { kind: 'offline', note });
    return;
  }
  try { await openCloud(!m); } catch { relock(); }
}

/** `strict`: fail instead of falling back to the offline copy (used while checking a typed passphrase). */
async function openCloud(offline = false, strict = false) {
  let local: DB | null = null;
  let lost = false; // app only: the copy on this phone exists but cannot be decrypted
  try { local = await readLocal(); } catch { lost = true; }
  const dirty = ls.get(LS_DIRTY) === '1';
  let latest: Awaited<ReturnType<typeof cloud.pull>> | undefined;
  if (!offline) {
    try { latest = await cloud.pull(); }
    catch (e) { if (strict || e instanceof cloud.WrongPassphrase) throw e; }
  }
  if (lost && !latest) {
    // Fail closed: never start an empty planner over data we could not read. The recovery screen lets the user decide.
    // `empty`: the cloud is known to hold nothing, so starting over cannot replace anything there.
    gate.set({ kind: 'recover', empty: latest === null, note: latest === null ? 'Your cloud copy is empty, so there is nothing to restore from.' : 'Go online and try again to restore from your encrypted cloud copy.' });
    return;
  }
  if (latest === undefined) { // offline: work from this device's copy and sync when back online
    setDB(migrate(local ?? seedFn()), false);
    pending = dirty;
    sync.set('offline');
  } else if (latest === null) { // nothing in the cloud yet: this device's planner becomes the first copy
    rev = 0;
    setDB(migrate(local ?? seedFn()), true);
  } else if (dirty && local && latest.rev === rev) { // changes made offline here, and no other device saved meanwhile
    setDB(migrate(local), true);
  } else {
    if (lost) toast(`This phone could not read its saved copy, so the planner was restored from the cloud.${dirty ? ' Changes made offline here were lost.' : ''}`, { kind: 'warn' });
    else if (dirty) toast('Changes made offline on this device were replaced by newer data from another device.', { kind: 'warn' });
    setRev(latest.rev);
    ls.set(LS_DIRTY, '');
    await keepLocal(latest.json);
    setDB(migrate(JSON.parse(latest.json)), false);
    sync.set('saved');
  }
  gate.set(null);
  ready.set(true);
}

/** Passphrase screen → derive keys on this device, then open (throws WrongPassphrase if it doesn't match). */
export async function unlockCloud(passphrase: string) {
  await cloud.unlock(passphrase, gate.get()?.salt);
  try { await openCloud(false, true); }
  catch (e) { await cloud.forget(); throw e; }
}
/** Recovery screen (app only): carry on with a backup file or a fresh planner after the local copy proved unreadable. */
export function recoverWith(next: DB | null) {
  setDB(migrate(next ?? seedFn()), true);
  gate.set(null);
  ready.set(true);
}
/** Re-encrypt the planner under a new passphrase. Other devices are asked for it the next time they sync. */
export async function changePassphrase(current: string, next: string) {
  const old = cloud.savedCreds()!;
  if ((await cloud.derive(current, old.salt)).token !== old.token) throw new cloud.WrongPassphrase('That is not your current passphrase.');
  const salt = cloud.newSalt();
  const creds = { salt, ...(await cloud.derive(next, salt)) };
  while (pushing) await new Promise(r => setTimeout(r, 100)); // let a save that is already uploading finish
  pushing = true;
  try {
    let r = await cloud.push(JSON.stringify(db), rev, db.savedAt, creds);
    if (!r.ok) { await adoptCloud(); r = await cloud.push(JSON.stringify(db), rev, db.savedAt, creds); } // another device saved first: take its copy, then retry once
    if (!r.ok) throw new Error('conflict');
    setRev(r.rev);
  } finally {
    pushing = false;
    if (pending) scheduleSave();
  }
}
export const cloudBackups = cloud.backups;
export async function restoreBackup(day: string) {
  const b = await cloud.pull(day);
  if (!b) return false;
  replaceDB(JSON.parse(b.json));
  return true;
}
/** Forget the passphrase and the local copy on this device. The encrypted cloud copy is untouched. */
export async function lockDevice() {
  await cloud.forget();
  try { await secure.remove(LS_KEY); } catch { /* ignore */ }
  for (const k of [LS_REV, LS_DIRTY]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  location.reload();
}

// ---------------------------------------------------------------------------
// Mutations. Every change creates a new top-level object so React sees it.
const undoStack: DB[] = [];
const snapshot = () => { undoStack.push(db); if (undoStack.length > 30) undoStack.shift(); };

export function undo() {
  const prev = undoStack.pop();
  if (prev) { setDB({ ...prev }); toast('Restored'); }
}

export function mutate(fn: (d: DB) => Partial<DB>, opts: { undoable?: boolean } = {}) {
  if (opts.undoable) snapshot();
  setDB({ ...db, ...fn(db) });
}

type Item<C extends Coll> = DB[C][number];

export function add<C extends Coll>(coll: C, item: Omit<Item<C>, 'id'> & { id?: ID }): ID {
  const id = item.id ?? uid();
  const full = { createdAt: new Date().toISOString(), ...item, id } as Item<C>;
  mutate(d => ({ [coll]: [...(d[coll] as Item<C>[]), full] }));
  return id;
}

export function update<C extends Coll>(coll: C, id: ID, patch: Partial<Item<C>>) {
  mutate(d => ({ [coll]: (d[coll] as Item<C>[]).map(x => (x.id === id ? { ...x, ...patch } : x)) }));
}

export function upsert<C extends Coll>(coll: C, item: Item<C>) {
  if ((db[coll] as Item<C>[]).some(x => x.id === item.id)) update(coll, item.id, item);
  else add(coll, item);
}

/** Delete with undo. Also cleans dangling references so nothing points at a ghost. */
export function remove<C extends Coll>(coll: C, id: ID, label = 'Deleted') {
  snapshot();
  const next: Partial<DB> = { [coll]: (db[coll] as Item<C>[]).filter(x => x.id !== id) };
  const unlink = <K extends Coll>(k: K, field: string) => {
    const arr = (next[k] ?? db[k]) as any[];
    next[k] = arr.map(x => (x[field] === id ? { ...x, [field]: undefined } : x)) as any;
  };
  if (coll === 'projects') { unlink('tasks', 'projectId'); unlink('blocks', 'projectId'); unlink('notes', 'projectId'); unlink('focus', 'projectId'); }
  if (coll === 'courses') { unlink('tasks', 'courseId'); unlink('blocks', 'courseId'); unlink('exams', 'courseId'); unlink('study', 'courseId'); unlink('notes', 'courseId'); unlink('focus', 'courseId'); }
  if (coll === 'goals') { unlink('tasks', 'goalId'); unlink('projects', 'goalId'); unlink('habits', 'goalId'); unlink('goals', 'parentId'); unlink('blocks', 'goalId'); }
  if (coll === 'tasks') {
    next.tasks = (next.tasks ?? db.tasks).filter(t => t.parentId !== id);
    unlink('blocks', 'taskId');
    unlink('focus', 'taskId');
  }
  if (coll === 'habits') next.habitLogs = db.habitLogs.filter(l => l.habitId !== id);
  setDB({ ...db, ...next });
  toast(label, { action: 'Undo', onAction: undo });
}

export function setDay(date: DateStr, patch: Partial<DayLog>) {
  mutate(d => ({ days: { ...d.days, [date]: { ...(d.days[date] ?? { top3: [], water: 0 }), ...patch, demo: false } } }));
}
export const dayLog = (d: DB, date: DateStr): DayLog => d.days[date] ?? { top3: [], water: 0 };

export function setSettings(patch: Partial<Settings>) {
  mutate(d => ({ settings: { ...d.settings, ...patch } }));
}

export function replaceDB(next: DB) {
  snapshot();
  setDB(migrate(next));
}

// ---------------------------------------------------------------------------
// Toasts
export interface Toast { id: string; msg: string; kind?: 'xp' | 'level' | 'warn' | 'info'; action?: string; onAction?: () => void }
export const toasts = signal<Toast[]>([]);
export function toast(msg: string, opts: Omit<Toast, 'id' | 'msg'> = {}) {
  const t: Toast = { id: uid(), msg, ...opts };
  toasts.set(ts => [...ts.slice(-3), t]);
  setTimeout(() => toasts.set(ts => ts.filter(x => x.id !== t.id)), opts.action ? 6000 : 3000);
}

// Confirm dialog (promise based so any handler can `await confirmBox(...)`)
export interface ConfirmReq { title: string; body?: string; danger?: boolean; ok?: string; typeToConfirm?: string; secret?: boolean; resolve: (ok: boolean, typed: string) => void }
export const confirmReq = signal<ConfirmReq | null>(null);
export const confirmBox = (title: string, opts: Partial<Omit<ConfirmReq, 'title' | 'resolve'>> = {}) =>
  new Promise<boolean>(resolve => confirmReq.set({ title, ...opts, resolve }));
/** Same dialog with a password field. Resolves with what was typed, or null when cancelled. */
export const askSecret = (title: string, opts: Pick<ConfirmReq, 'body' | 'ok'> = {}) =>
  new Promise<string | null>(resolve => confirmReq.set({ title, ...opts, secret: true, resolve: (ok, typed) => resolve(ok ? typed : null) }));
