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
