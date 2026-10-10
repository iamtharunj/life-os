// Run: npm test   (Node >= 23 strips the types natively)
import assert from 'node:assert/strict';
import { emptyDB } from './store.ts';
import { addDays, parseDateWord, weekStart, fmtDur, monthEnd } from './dates.ts';
import {
  blocksOn, habitStreak, layoutDay, levelFor, monthFinance, nextCycle, sleepLeft, sleepMin, conflictsFor, isLate, goalProgress, xpTotals,
} from './derive.ts';
import type { DB } from './types.ts';

const T = '2026-09-30'; // a Wednesday
const db = (patch: Partial<DB> = {}): DB => ({ ...emptyDB(), ...patch });

// dates
assert.equal(weekStart(T), '2026-09-28');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(parseDateWord('tom', T), '2026-10-01');
assert.equal(parseDateWord('fri', T), '2026-10-02');
assert.equal(parseDateWord('wed', T), '2026-10-07', 'same weekday means next week');
assert.equal(parseDateWord('5/10', T), '2026-10-05');
assert.equal(monthEnd('2026-02-10'), '2026-02-28');
assert.equal(fmtDur(462), '7h 42m');

// sleep duration crosses midnight
assert.equal(sleepMin({ bed: 23 * 60 + 30, wake: 7 * 60 }), 450);
assert.equal(sleepMin({ bed: 30, wake: 7 * 60 }), 390);

// recurring blocks: weekdays, skip, until
const cls = { id: 'c', title: 'DSA', date: '2026-09-01', start: 600, end: 660, kind: 'class' as const, repeat: [1, 3], skip: ['2026-10-07'], until: '2026-11-30' };
const d1 = db({ blocks: [cls] });
assert.equal(blocksOn(d1, T).length, 1, 'Wednesday class occurs');
assert.equal(blocksOn(d1, '2026-10-01').length, 0, 'not on Thursday');
assert.equal(blocksOn(d1, '2026-10-07').length, 0, 'skipped occurrence');
assert.equal(blocksOn(d1, '2026-12-02').length, 0, 'after until');

// overlap layout
const lay = layoutDay([
  { key: 'a', start: 600, end: 720 },
  { key: 'b', start: 660, end: 780 },
  { key: 'c', start: 800, end: 860 },
]);
assert.equal(lay.get('a')!.cols, 2);
assert.equal(lay.get('b')!.col, 1);
assert.equal(lay.get('a')!.overlap, true);
assert.equal(lay.get('c')!.overlap, false);

// sleep protection: routine 23:15-06:45 = 7.5h ok; a 00:30 hackathon block breaks it
const base = db();
assert.equal(sleepLeft(base, T).min, 450);
assert.equal(sleepLeft(base, T).short, false);
const late = db({ blocks: [{ id: 'h', title: 'Hack', date: '2026-10-01', start: 0, end: 90, kind: 'hackathon' }] });
assert.equal(sleepLeft(late, T).min, 5 * 60 + 15); // 01:30 -> 06:45
assert.equal(sleepLeft(late, T).short, true);
const early = db({ blocks: [{ id: 'g', title: 'Gym', date: '2026-10-01', start: 360, end: 420, kind: 'gym' }] });
assert.equal(sleepLeft(early, T).min, 7 * 60 + 45 - 60);
assert.equal(conflictsFor(base, T, 23 * 60, 24 * 60).intoSleep, true);
assert.equal(conflictsFor(base, T, 10 * 60, 11 * 60).intoSleep, false);
assert.equal(isLate(base, new Date(2026, 8, 30, 1, 30).toISOString()), true);
assert.equal(isLate(base, new Date(2026, 8, 30, 23, 50).toISOString()), false);

// forgiving streak: one miss keeps it, two in a row resets
const h = { id: 'h1', name: 'Read', icon: '', category: '', freq: 7, xp: 10 };
const logs = (days: number[]) => days.map((n, i) => ({ id: 'l' + i, habitId: 'h1', date: addDays(T, -n) }));
assert.equal(habitStreak(db({ habits: [h], habitLogs: logs([0, 1, 3, 4]) }), h, T).cur, 4, 'one gap forgiven');
assert.equal(habitStreak(db({ habits: [h], habitLogs: logs([0, 1, 4, 5]) }), h, T).cur, 2, 'two misses reset');
assert.equal(habitStreak(db({ habits: [h], habitLogs: logs([1, 2]) }), h, T).cur, 2, 'today not over yet');

// levels
assert.deepEqual(levelFor(0), { level: 1, into: 0, need: 300 });
assert.deepEqual(levelFor(300), { level: 2, into: 0, need: 450 });
assert.equal(levelFor(760).level, 3);

// XP is derived: tasks completed after bedtime earn nothing
const xpdb = db({
  tasks: [
    { id: 't1', title: 'a', priority: 1, status: 'done', doneAt: new Date(2026, 8, 30, 15).toISOString() },
    { id: 't2', title: 'b', priority: 2, status: 'done', doneAt: new Date(2026, 8, 30, 2).toISOString() },
  ],
});
assert.equal(xpTotals(xpdb, T).total, 25);

// finance
const fin = db({
  txns: [
    { id: '1', date: '2026-09-02', amount: 2000, type: 'expense', category: 'Food' },
    { id: '2', date: '2026-09-10', amount: 500, type: 'expense', category: 'Transport' },
    { id: '3', date: '2026-09-01', amount: 5000, type: 'income', category: 'Allowance' },
    { id: '4', date: '2026-08-31', amount: 999, type: 'expense', category: 'Food' },
  ],
});
fin.settings.monthlyBudget = 5000;
const mf = monthFinance(fin, T, '2026-09-15');
assert.equal(mf.spent, 2500);
assert.equal(mf.remaining, 2500);
assert.equal(mf.byCat[0].cat, 'Food');
assert.equal(mf.saved, 2500);
assert.equal(nextCycle('2026-01-31', 'monthly'), '2026-02-28');

// goal metric progress
const g = db({ workouts: [{ id: 'w', date: T, type: 'run', min: 30, km: 5 }], goals: [{ id: 'g', title: 'Run', level: 'year', status: 'active', metric: 'run_km', target: 100, start: '2026-01-01', deadline: '2026-12-31' }] });
assert.equal(goalProgress(g, g.goals[0]), 5);

console.log('selftest: all checks passed');

// demo seed is internally consistent and fully removable
import { seedDB, withoutDemo } from './seed.ts';
const seeded = seedDB();
const ids = new Set([...seeded.projects, ...seeded.courses, ...seeded.goals, ...seeded.tasks].map(x => x.id));
for (const t of seeded.tasks) for (const k of ['projectId', 'courseId', 'goalId', 'parentId'] as const) if (t[k]) assert.ok(ids.has(t[k]!), `dangling ${k} on ${t.title}`);
const clean = withoutDemo(seeded);
assert.equal(clean.tasks.length + clean.sleep.length + clean.txns.length + Object.keys(clean.days).length, 0);
assert.ok(xpTotals(seeded).total > 1000, 'demo history earns XP');
console.log('selftest: seed ok');

// quick-capture grammar
import { parseTaskText } from './actions.ts';
const pt = parseTaskText('Finish problem set fri !1 #DME', seeded);
assert.equal(pt.title, 'Finish problem set');
assert.equal(pt.priority, 1);
assert.equal(seeded.courses.find(c => c.id === pt.courseId)?.name, 'Design of Machine Elements');
assert.equal(seeded.courses.find(c => c.id === parseTaskText('read #HT', seeded).courseId)?.name, 'Heat Transfer');
assert.ok(parseTaskText('tune model #amazon', seeded).projectId, 'project tag');
assert.equal(parseTaskText('Plan today stuff', seeded).title, 'Plan stuff', 'bare date words are consumed');
console.log('selftest: capture grammar ok');

// muscle groups: sprites are well-formed, every muscle is drawn, exercises map sensibly
import { BODY_BACK, BODY_FRONT, BODY_KEY, MUSCLE_IDS, muscleStats, musclesOf, suggestTemplate } from './muscles.ts';
for (const rows of [BODY_FRONT, BODY_BACK]) {
  assert.equal(rows.length, 46);
  for (const r of rows) { assert.equal(r.length, 27, `row "${r}"`); assert.match(r, /^[.ofscbaqvtlrwgh]+$/); assert.equal(r, [...r].reverse().join(''), 'body is symmetric'); }
}
const drawn = new Set([...BODY_FRONT, ...BODY_BACK].join('').split('').map(c => BODY_KEY[c]).filter(Boolean));
for (const m of MUSCLE_IDS) assert.ok(drawn.has(m), `${m} appears on the body map`);
const mo = (n: string) => musclesOf(n).primary;
assert.deepEqual(['Bench press', 'Incline DB press', 'Leg press', 'Overhead press', 'Tricep pushdown', 'Lat pulldown', 'Bicep curl', 'Leg curl', 'Romanian deadlift', 'Deadlift', 'Squat', 'Calf raise', 'Pull-ups', 'Barbell row', 'Upright row', 'Face pull', 'Hanging leg raise', 'Hip thrust'].map(mo),
  ['chest', 'chest', 'quads', 'shoulders', 'triceps', 'back', 'biceps', 'hamstrings', 'hamstrings', 'lowerback', 'quads', 'calves', 'back', 'back', 'shoulders', 'shoulders', 'abs', 'glutes']);
assert.equal(musclesOf('Bench press', { 'bench press': 'triceps' }).primary, 'triceps', 'user override wins');
assert.equal(mo('Zumba'), undefined);
const mdb = db({ workouts: [{ id: 'g1', date: T, type: 'gym', min: 60, exercises: [{ name: 'Bench press', sets: [{ reps: 8, kg: 50 }, { reps: 8, kg: 50 }] }] }], templates: [{ id: 'tp', name: 'Legs', exercises: ['Squat'] }, { id: 'tc', name: 'Chest', exercises: ['Bench press'] }] });
const ms = muscleStats(mdb, T);
assert.equal(ms.chest.sets7, 2);
assert.equal(ms.triceps.sets7, 1, 'secondary muscles count half');
assert.equal(ms.chest.volume7, 800);
assert.equal(ms.chest.daysSince, 0);
assert.equal(ms.chest.weekly[7], 2);
assert.equal(suggestTemplate(mdb, ms)?.t.name, 'Legs', 'suggests the rested muscle group, not the one trained today');
console.log('selftest: muscles ok');

// end-to-end encryption: round-trips, compresses, and fails closed with the wrong passphrase
import { derive, newSalt, seal, unseal } from './cloud.ts';
const salt = newSalt();
const k1 = await derive('correct horse battery', salt, 1000);
assert.deepEqual(k1, await derive('correct horse battery', salt, 1000), 'same passphrase + salt gives the same keys');
const k2 = await derive('correct horse battery!', salt, 1000);
assert.notEqual(k1.key, k2.key);
assert.notEqual(k1.token, k2.token);
assert.notEqual(k1.key, (await derive('correct horse battery', newSalt(), 1000)).key, 'salt changes the keys');
assert.equal(k1.token.length, 64);
const plain = JSON.stringify(seeded);
const blob = await seal(k1.key, plain);
assert.equal(await unseal(k1.key, blob), plain);
assert.ok(!blob.includes('Heat Transfer') && !atob(blob).includes('Heat Transfer'), 'nothing readable in the blob');
assert.ok(blob.length < plain.length / 3, `gzip keeps it small (${plain.length} -> ${blob.length})`);
assert.notEqual(blob, await seal(k1.key, plain), 'fresh IV every save');
await assert.rejects(unseal(k2.key, blob), 'wrong key cannot decrypt');
await assert.rejects(unseal(k1.key, blob.slice(0, 40) + (blob[40] === 'A' ? 'B' : 'A') + blob.slice(41)), 'tampering is detected');
console.log(`selftest: encryption ok (${Math.round(plain.length / 1024)} KB planner -> ${Math.round(blob.length / 1024)} KB encrypted)`);

// changing the passphrase, against the real server handlers with an in-memory store
// @ts-expect-error plain JS module without types
import { GET, PUT, store } from '../../api/cloud.js';
{
  const mem = new Map<string, string>();
  store.configured = () => true;
  store.pipeline = async (cmds: string[][]) => cmds.map(([op, k, ...rest]) => {
    if (op === 'GET') return mem.get(k) ?? null;
    if (op === 'SET') { mem.set(k, rest[0]); return 'OK'; }
    if (op === 'KEYS') return [...mem.keys()].filter(x => x.startsWith(k.slice(0, -1)));
    if (op === 'DEL') return [k, ...rest].filter(x => mem.delete(x)).length;
    return 1; // INCR / EXPIRE
  });
  const call = (method: 'GET' | 'PUT', token: string, body?: object, q = '') =>
    (method === 'GET' ? GET : PUT)(new Request('http://x/api/cloud' + q, { method, headers: { authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) })) as Promise<Response>;
  const salt2 = newSalt();
  const k3 = await derive('a brand new passphrase', salt2, 1000);
  const blob3 = await seal(k3.key, plain);
  const rekey = { blob: blob3, salt: salt2, newToken: k3.token };
  assert.equal((await call('PUT', k1.token, { blob, base: 0, salt })).status, 200);
  mem.set('lifeos:bak:2026-01-01', mem.get('lifeos:main')!);
  assert.equal((await call('PUT', k1.token, { blob, base: 1, salt })).status, 200);
  assert.ok(mem.has('lifeos:bak:2026-01-01'), 'an ordinary save leaves the backups alone');
  assert.equal((await call('PUT', k2.token, { ...rekey, base: 2 })).status, 401, 'only the current passphrase can change it');
  assert.equal((await call('PUT', k1.token, { ...rekey, base: 1 })).status, 409, 'a stale device cannot change it');
  assert.equal((await call('PUT', k1.token, { ...rekey, base: 2, newToken: 'short' })).status, 400);
  assert.equal((await call('GET', k1.token)).status, 200, 'refused changes leave the old passphrase working');
  assert.equal((await call('PUT', k1.token, { ...rekey, base: 2 })).status, 200);
  assert.equal((await call('GET', k1.token)).status, 401, 'the old passphrase is locked out');
  assert.equal(await unseal(k3.key, (await (await call('GET', k3.token)).json()).blob), plain);
  assert.equal((await (await call('GET', '', undefined, '?meta')).json()).salt, salt2, 'other devices see a new salt and ask again');
  assert.deepEqual((await (await call('GET', k3.token, undefined, '?backups')).json()).days, [new Date().toISOString().slice(0, 10)], 'backups under the old passphrase are gone');
  assert.equal((await call('PUT', k3.token, { blob: blob3, base: 3, salt: salt2 })).status, 200, 'saving carries on with the new one');
  console.log('selftest: passphrase change ok');
}

// pixel scenery must build at every hour (a daytime-only crash once blanked the whole app)
import { buildScene, phaseOf } from './scene.ts';
(globalThis as any).ImageData ??= class { data: Uint8ClampedArray; constructor(width: number, height: number) { this.data = new Uint8ClampedArray(width * height * 4); } };
const phases = new Set<string>();
for (let hour = 0; hour < 24; hour++) {
  phases.add(phaseOf(hour));
  for (const [W, H] of [[64, 48], [133, 48], [248, 64], [300, 72], [174, 120], [72, 64]]) for (const seed of [3, 7, 11, 23]) {
    const sc = buildScene(W, H, phaseOf(hour), seed);
    assert.equal(sc.back.data.length, W * H * 4, `scene at ${hour}:00 ${W}x${H}`);
    assert.ok(sc.back.data.some(v => v > 0), 'sky was painted');
  }
}
assert.deepEqual([...phases].sort(), ['dawn', 'day', 'dusk', 'night']);
console.log('selftest: scenery ok at every hour');

// "Remove demo data" keeps everything the user put in, and only that
import { demoSummary } from './seed.ts';
{
  const d = seedDB();
  const demoProject = d.projects[0].id, demoHabit = d.habits.find(h => !h.auto)!.id, demoTask = d.tasks[0].id;
  const now = new Date().toISOString();
  d.courses.push({ id: 'my-c1', name: 'Fluid Mechanics', code: 'BMEE204L', createdAt: now });
  d.tasks.push({ id: 'my-t1', title: 'My real task', priority: 2, status: 'todo', projectId: demoProject, courseId: 'my-c1', createdAt: now });
  d.tasks.push({ id: 'my-t2', title: 'Subtask of a sample task', priority: 2, status: 'todo', parentId: demoTask, createdAt: now });
  d.blocks.push({ id: 'my-b1', title: 'Fluid Mechanics', date: T, start: 600, end: 650, kind: 'class', courseId: 'my-c1', repeat: [1, 3], createdAt: now });
  d.habitLogs.push({ id: 'my-hl', habitId: demoHabit, date: T, createdAt: now });
  d.workouts.push({ id: 'my-w1', date: T, type: 'run', min: 30, km: 5, createdAt: now });
  d.days[T] = { top3: ['my-t1', demoTask], water: 5, demo: false };
  d.weekTop3['2026-10-05'] = ['Ship my own thing', '', ''];
  d.weekTop3['2026-10-12'] = ['Mine', 'Heat Transfer assignment + CAT prep', 'Sleep ≥ 7.5h five nights'];
  d.missions.push({ key: 'x:athlete', date: now.slice(0, 10), xp: 100 });
  const sum = demoSummary(d);
  const c = withoutDemo(d);
  assert.deepEqual(c.courses.map(x => x.id), ['my-c1']);
  assert.deepEqual(c.tasks.map(x => x.id), ['my-t1', 'my-t2']);
  assert.equal(c.tasks[0].projectId, undefined, 'link to a removed sample project is cleared');
  assert.equal(c.tasks[0].courseId, 'my-c1', 'link to your own course is kept');
  assert.equal(c.tasks[1].parentId, undefined, 'orphaned subtask becomes a normal task');
  assert.equal(c.blocks.length, 1);
  assert.equal(c.habitLogs.length, 0, 'check-ins on removed sample habits go with them');
  assert.equal(c.workouts.length, 1);
  assert.deepEqual(c.days[T], { top3: ['my-t1'], water: 5, demo: false });
  assert.equal(Object.keys(c.days).length, 1, 'sample days are removed');
  assert.deepEqual(c.weekTop3, { '2026-10-05': ['Ship my own thing', '', ''], '2026-10-12': ['Mine', '', ''] }, 'your week priorities stay, the sample lines go');
  assert.ok(!JSON.stringify({ ...c, settings: 0 }).includes('demo-') && !JSON.stringify(c).includes('Heat Transfer'), 'no trace of sample content');
  assert.deepEqual(c.missions.map(m => m.key), ['x:athlete'], 'your mission claims stay');
  assert.equal(c.settings, d.settings);
  for (const k of ['sleep', 'meals', 'txns', 'projects', 'goals', 'habits', 'exams', 'notes', 'reviews', 'rewards', 'templates', 'subs', 'journal', 'meditations', 'focus', 'study'] as const) assert.equal(c[k].length, 0, k);
  assert.ok(sum.removed > 500 && sum.kept.join(', ') === '2 tasks, 1 time block, 1 course, 1 workout', sum.kept.join(', '));
  assert.equal(demoSummary(c).removed, 0, 'second run has nothing to remove');
  console.log(`selftest: demo removal ok (removes ${sum.removed}, keeps ${sum.kept.join(', ')})`);
}

// ------------------------------------------------------------------ Android app
// Which backend the code talks to: same-origin on the website, exactly the production endpoint in the app.
import { CLOUD_ORIGIN, cloudApi, native, safeHref } from './platform.ts';
assert.equal(native, false, 'tests run as the website');
assert.equal(cloudApi(false), '/api/cloud', 'website stays same-origin');
assert.equal(cloudApi(true), 'https://life-os-ecru-omega.vercel.app/api/cloud', 'app uses the fixed HTTPS endpoint');
assert.ok(CLOUD_ORIGIN.startsWith('https://') && new URL(CLOUD_ORIGIN).origin === CLOUD_ORIGIN, 'an https origin, nothing more');
// Links in planner data: only web and mail links become clickable
assert.equal(safeHref('https://github.com/x'), 'https://github.com/x');
assert.equal(safeHref(' github.com/x '), 'https://github.com/x', 'a bare host is treated as https');
assert.equal(safeHref('mailto:a@b.co'), 'mailto:a@b.co');
for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'intent://x#Intent;end', 'file:///etc/passwd', 'content://x', 'tel:123', 'blob:https://x/1', '', undefined])
  assert.equal(safeHref(bad), undefined, `not clickable: ${bad}`);
console.log('selftest: api host and link rules ok');

// CORS: the app's origin (from the Capacitor config) and the site may read responses; nobody else, no wildcard.
import { readFileSync } from 'node:fs';
// @ts-expect-error plain JS module without types
import { OPTIONS } from '../../api/cloud.js';
{
  const cap = JSON.parse(readFileSync(new URL('../../capacitor.config.json', import.meta.url), 'utf8'));
  const appOrigin = `${cap.server.androidScheme}://${cap.server.hostname}`;
  assert.equal(appOrigin, 'https://localhost');
  assert.ok(!cap.server.url && cap.server.cleartext === false && cap.android.allowMixedContent === false, 'bundled assets, no cleartext');
  assert.equal(cap.loggingBehavior, 'none', 'the bridge must not log plugin calls: they carry the planner');
  assert.equal(cap.android.webContentsDebuggingEnabled, false);
  const hit = (method: 'GET' | 'PUT' | 'OPTIONS', origin?: string, q = '', token = '') =>
    ({ GET, PUT, OPTIONS })[method](new Request('http://x/api/cloud' + q, { method, headers: { ...(origin && { origin }), ...(token && { authorization: `Bearer ${token}` }) }, body: method === 'PUT' ? '{}' : undefined })) as Promise<Response>;
  for (const origin of [appOrigin, CLOUD_ORIGIN]) {
    const pre = await hit('OPTIONS', origin);
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), origin, 'exact origin echoed');
    assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, PUT, OPTIONS');
    assert.equal(pre.headers.get('access-control-allow-headers'), 'authorization, content-type');
    assert.equal(pre.headers.get('access-control-allow-credentials'), null, 'no cookie CORS with bearer auth');
    assert.equal(pre.headers.get('vary'), 'Origin');
    assert.equal((await hit('GET', origin, '?meta')).headers.get('access-control-allow-origin'), origin);
    const denied = await hit('GET', origin, '', 'f'.repeat(64));
    assert.equal(denied.status, 401, 'CORS does not replace the token');
    assert.equal(denied.headers.get('access-control-allow-origin'), origin, 'the app can read the error');
    assert.equal((await hit('PUT', origin, '', 'f'.repeat(64))).status, 400);
  }
  for (const origin of ['https://evil.example', 'http://localhost', 'https://localhost:8080', 'https://localhost.evil.example', 'capacitor://localhost', 'null', '*', undefined]) {
    for (const res of [await hit('OPTIONS', origin), await hit('GET', origin, '?meta'), await hit('GET', origin, '', 'f'.repeat(64))]) {
      assert.equal(res.headers.get('access-control-allow-origin'), null, `no access for ${origin}`);
      assert.equal(res.headers.get('access-control-allow-methods'), null);
      assert.equal(res.headers.get('vary'), 'Origin', 'caches must not mix origins');
    }
  }
  assert.equal((await hit('GET', undefined, '?meta')).status, 200, 'the website (same origin, no Origin header) still works');
  console.log('selftest: cors ok');
}

// Reminders: a pure plan from the planner, stable ids, private wording by default
import { planReminders, reminderId, syncReminders, type Reminder } from './reminders.ts';
import { DEFAULT_REMIND } from './device.ts';
import { isRoute } from './native.ts';
{
  const on = { ...DEFAULT_REMIND, on: true, quiet: false };
  const now = new Date(2026, 8, 30, 6, 0); // Wed 30 Sep 2026, 06:00
  const base = db({
    tasks: [
      { id: 't1', title: 'Zebra thermodynamics essay', priority: 1, status: 'todo', due: T },
      { id: 't2', title: 'Quokka lab record', priority: 2, status: 'todo', due: '2026-10-02' },
      { id: 't3', title: 'Finished thing', priority: 2, status: 'done', due: T },
      { id: 't4', title: 'Far away', priority: 2, status: 'todo', due: '2026-10-20' },
    ],
    blocks: [{ ...cls, title: 'Narwhal seminar', until: '2026-10-05' }, { id: 'sl', title: 'Sleep', date: T, start: 1380, end: 1440, kind: 'sleep' }],
    habits: [{ id: 'h1', name: 'Okapi stretching', icon: 'x', category: 'x', freq: 7, xp: 5 }],
  });
  const plan = planReminders(base, on, now);
  const has = (p: Reminder[], ch: string, key: string) => p.some(r => r.id === reminderId(ch, key));
  assert.deepEqual(planReminders(base, { ...on, on: false }, now), [], 'off means nothing scheduled');
  assert.equal(new Set(plan.map(r => r.id)).size, plan.length, 'ids are unique');
  assert.deepEqual(planReminders(base, on, now).map(r => r.id), plan.map(r => r.id), 'same data, same ids');
  assert.ok(plan.every(r => r.at > now && r.at.getTime() < now.getTime() + 8 * 86400000) && plan.length <= 64, 'bounded window, future only');
  assert.ok(plan.every(r => isRoute(r.route)), 'every tap target is a route the app defines');
  assert.ok(!isRoute('https://evil.example') && !isRoute('/sleep/../x') && !isRoute('javascript:1') && !isRoute({ to: '/sleep' }) && !isRoute(undefined));
  const text = JSON.stringify(plan);
  for (const secret of ['Zebra', 'Quokka', 'Narwhal', 'Okapi']) assert.ok(!text.includes(secret), `default wording hides "${secret}"`);
  assert.ok(plan.every(r => r.title === 'Life OS'));
  const loud = JSON.stringify(planReminders(base, { ...on, detail: true }, now));
  assert.ok(loud.includes('Zebra') && loud.includes('Narwhal'), 'details only when asked for');
  // tasks: one per day with something open; done and far-away tasks do not count
  assert.ok(has(plan, 'tasks', T) && has(plan, 'tasks', '2026-10-02') && !has(plan, 'tasks', '2026-10-01') && !has(plan, 'tasks', '2026-10-20'));
  const t8 = plan.find(r => r.id === reminderId('tasks', T))!;
  assert.equal(t8.at.getHours() * 60 + t8.at.getMinutes(), on.tasksAt);
  // edit, complete, delete: the old reminder drops out of the plan (so it gets cancelled), a new one appears
  const moved = planReminders({ ...base, tasks: base.tasks.map(t => (t.id === 't1' ? { ...t, due: '2026-10-01' } : t)) }, on, now);
  assert.ok(!has(moved, 'tasks', T) && has(moved, 'tasks', '2026-10-01'));
  assert.ok(!has(planReminders({ ...base, tasks: base.tasks.map(t => (t.id === 't1' ? { ...t, status: 'done' as const } : t)) }, on, now), 'tasks', T));
  assert.ok(!has(planReminders({ ...base, tasks: base.tasks.filter(t => t.id !== 't1') }, on, now), 'tasks', T));
  assert.ok(!planReminders(base, { ...on, tasks: false }, now).some(r => r.channel === 'tasks'), 'a disabled category schedules nothing');
  // schedule: recurrence respects weekday, `until` and skipped days; sleep blocks never ring
  const sched = plan.filter(r => r.channel === 'schedule');
  assert.deepEqual(sched.map(r => `${r.at.getMonth() + 1}/${r.at.getDate()} ${r.at.getHours()}:${r.at.getMinutes()}`), ['9/30 9:50', '10/5 9:50'], 'Wed and Mon, 10 min early, stops at `until`');
  assert.ok(!planReminders({ ...base, blocks: [{ ...cls, skip: [T] }] }, on, now).some(r => r.id === reminderId('schedule', `c@${T}`)), 'a skipped day is skipped');
  assert.ok(!planReminders({ ...base, blocks: [{ ...cls, done: [T] }] }, on, now).some(r => r.id === reminderId('schedule', `c@${T}`)), 'an attended block does not ring');
  // habits: only while something is open that day
  assert.ok(has(plan, 'habits', T));
  assert.ok(!has(planReminders({ ...base, habitLogs: [{ id: 'l', habitId: 'h1', date: T }] }, on, now), 'habits', T));
  // sleep: wind-down before bedtime (also when bedtime is after midnight), morning nudge until last night is logged
  const bed = plan.find(r => r.id === reminderId('sleep', 'bed|' + T))!;
  assert.equal(bed.at.getHours() * 60 + bed.at.getMinutes(), base.settings.bedtime - on.sleepLead);
  const late = planReminders({ ...base, settings: { ...base.settings, bedtime: 30 } }, on, now).find(r => r.id === reminderId('sleep', 'bed|' + T))!;
  assert.equal(`${late.at.getDate()} ${late.at.getHours()}:${late.at.getMinutes()}`, '1 0:0', '00:30 bedtime rings at midnight, on the next calendar day');
  assert.ok(has(plan, 'sleep', 'log|' + T));
  assert.ok(!has(planReminders({ ...base, sleep: [{ id: 's', date: T, bed: 1380, wake: 420 }] }, on, now), 'sleep', 'log|' + T));
  // quiet hours remove what falls inside them, except a timer the user started themselves
  const quiet = { ...on, quiet: true, quietFrom: 22 * 60, quietTo: 9 * 60 };
  const timer = { kind: 'focus' as const, phase: 'work' as const, endsAt: now.getTime() + 25 * 60000 };
  const hushed = planReminders(base, quiet, now, timer);
  assert.ok(hushed.every(r => r.channel === 'focus' || (r.at.getHours() >= 9 && r.at.getHours() < 22)), 'nothing inside quiet hours');
  assert.ok(!has(hushed, 'tasks', T) && !has(hushed, 'sleep', 'bed|' + T) && has(hushed, 'focus', 'timer'));
  assert.ok(!has(planReminders(base, on, now, { ...timer, left: 1000 }), 'focus', 'timer'), 'a paused timer does not ring');
  assert.ok(!has(planReminders(base, on, now, { kind: 'focus', phase: 'idle' }), 'focus', 'timer'));

  // syncing the plan to the phone: cancels what no longer applies, never duplicates
  const phone = new Map<number, unknown>();
  const calls = { schedule: 0, cancel: 0 };
  const api = {
    getPending: async () => ({ notifications: [...phone.keys()].map(id => ({ id, title: '', body: '' })) }),
    cancel: async (o: { notifications: { id: number }[] }) => { calls.cancel++; o.notifications.forEach(n => phone.delete(n.id)); },
    schedule: async (o: { notifications: { id: number; isExactNotification?: boolean }[] }) => {
      calls.schedule++;
      for (const n of o.notifications) { assert.equal(n.isExactNotification, false, 'never asks for exact alarms'); phone.set(n.id, n); }
      return { notifications: [] };
    },
  };
  await syncReminders(plan, false, api);
  assert.deepEqual([...phone.keys()].sort(), plan.map(r => r.id).sort());
  await syncReminders(plan, false, api);
  assert.equal(calls.schedule, 1, 'an unchanged plan is not rescheduled');
  await syncReminders(plan, true, api); // app resumed: reschedule everything
  assert.equal(phone.size, plan.length, 'rescheduling replaces, it does not duplicate');
  await syncReminders(moved, false, api);
  assert.ok(!phone.has(reminderId('tasks', T)) && phone.has(reminderId('tasks', '2026-10-01')) && calls.cancel === 1, 'the old day is cancelled when a task moves');
  await syncReminders([], false, api);
  assert.equal(phone.size, 0, 'turning reminders off cancels everything');

  // daylight saving: 08:00 stays 08:00 local on both sides of a change, and a time that does not exist still lands
  const tz = process.env.TZ;
  process.env.TZ = 'America/New_York';
  for (const [start, gapHours] of [['2026-03-07', 23], ['2026-10-31', 25]] as const) {
    const [y, m, day] = start.split('-').map(Number);
    const p = planReminders(db({ tasks: [0, 1, 2].map(i => ({ id: 'd' + i, title: 'x', priority: 2 as const, status: 'todo' as const, due: addDays(start, i) })) }), { ...on, habits: false, sleep: false, blocks: false }, new Date(y, m - 1, day, 1));
    assert.deepEqual(p.map(r => r.at.getHours()), [8, 8, 8], `08:00 local around ${start}`);
    assert.equal((p[1].at.getTime() - p[0].at.getTime()) / 3600000, gapHours, 'the changeover day is an hour short or long');
    assert.equal((p[2].at.getTime() - p[1].at.getTime()) / 3600000, 24);
  }
  const gap = planReminders(db({ tasks: [{ id: 'g', title: 'x', priority: 2, status: 'todo', due: '2026-03-08' }] }), { ...on, tasksAt: 150, habits: false, sleep: false }, new Date(2026, 2, 7, 12));
  assert.equal(gap[0].at.getHours(), 3, '02:30 does not exist on the spring-forward day: it rings at 03:30');
  process.env.TZ = 'Asia/Kolkata';
  assert.equal(planReminders(base, on, new Date(2026, 8, 30, 6)).find(r => r.id === reminderId('tasks', T))!.at.getHours(), 8, 'same wall-clock time in another zone, same id');
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  console.log(`selftest: reminders ok (${plan.length} planned for a week)`);
}
