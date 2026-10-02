// Muscle groups: which exercise trains what, a pixel body map, and stats derived from logged sets.
import type { DB, DateStr, WorkoutTemplate } from './types.ts';
import { addDays, diffDays, today, weekStart } from './dates.ts';

export type MuscleId = 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'back' | 'lowerback' | 'abs' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

export const MUSCLES: Record<MuscleId, { label: string; region: 'Upper' | 'Lower' | 'Core'; view: 'front' | 'back' }> = {
  chest: { label: 'Chest', region: 'Upper', view: 'front' },
  shoulders: { label: 'Shoulders', region: 'Upper', view: 'front' },
  triceps: { label: 'Triceps', region: 'Upper', view: 'back' },
  biceps: { label: 'Biceps', region: 'Upper', view: 'front' },
  back: { label: 'Back', region: 'Upper', view: 'back' },
  lowerback: { label: 'Lower back', region: 'Core', view: 'back' },
  abs: { label: 'Abs', region: 'Core', view: 'front' },
  quads: { label: 'Quads', region: 'Lower', view: 'front' },
  hamstrings: { label: 'Hamstrings', region: 'Lower', view: 'back' },
  glutes: { label: 'Glutes', region: 'Lower', view: 'back' },
  calves: { label: 'Calves', region: 'Lower', view: 'back' },
};
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];

// ---------------------------------------------------------------- pixel body (27 x 46 per view)
// Only the left half is drawn; rows are mirrored around the centre column, so the figure is always symmetric.
// '.' empty · 'o' body (also the dark lines that separate muscle groups) · 'f' forearm (not tracked)
// Each entry is "<13 left-half pixels><centre pixel>".
const mirror = (half: string[]) => half.map(r => r.slice(0, 13) + r[13] + [...r.slice(0, 13)].reverse().join(''));

export const BODY_FRONT = mirror([
  '............oo', // head
  '...........ooo',
  '...........ooo',
  '...........ooo',
  '............oo',
  '............oo', // neck
  '.........ooooo', // collar
  '.....sssccccco', // delts + pecs, sternum line down the centre
  '....ssssccccco',
  '....ssssccccco',
  '....ssssccccco',
  '...bbbb.ccccco',
  '...bbbb.oooooo', // line under the chest
  '...bbbb.ooaaao', // abs: three blocks, obliques left dark
  '...bbbb.ooaaao',
  '...bbbb.oooooo',
  '...bbbb.ooaaao',
  '...oooo.ooaaao', // elbow
  '..ffff..oooooo',
  '..ffff...oaaao', // waist tapers
  '..ffff...oaaao',
  '..ffff...ooooo',
  '..ffff..oooooo', // hips
  '..fff...oooooo',
  '..ooo...qqqqqo', // hands · quads
  '..ooo...qqqqq.',
  '........qqqqq.',
  '........qqqqq.',
  '........qqqqq.',
  '........qqqqq.',
  '........qqqqq.',
  '.........qqqq.',
  '.........qqqq.',
  '.........qqqq.',
  '.........oooo.', // knee
  '.........oooo.',
  '.........vvvv.', // lower leg
  '.........vvvv.',
  '.........vvvv.',
  '.........vvvv.',
  '.........vvvv.',
  '..........vvv.',
  '..........vvv.',
  '..........ooo.', // ankle
  '........ooooo.', // foot
  '........ooooo.',
]);

export const BODY_BACK = mirror([
  '............oo',
  '...........ooo',
  '...........ooo',
  '...........ooo',
  '............oo',
  '............oo',
  '.........ttttt', // traps
  '.....ssstttttt',
  '....sssslllllt',
  '....sssslllllo', // lats, spine line down the centre
  '....sssslllllo',
  '...rrrr.lllllo', // triceps
  '...rrrr.lllllo',
  '...rrrr.lllllo',
  '...rrrr..llllo',
  '...rrrr..llllo',
  '...rrrr..ooooo',
  '...oooo..wwwwo', // lower back
  '..ffff...wwwwo',
  '..ffff...wwwwo',
  '..ffff...wwwwo',
  '..ffff...ooooo',
  '..ffff..gggggo', // glutes
  '..fff...gggggo',
  '..ooo...gggggo',
  '..ooo...ggggg.',
  '........ggggg.',
  '........ooooo.', // glute fold
  '........hhhhh.', // hamstrings
  '........hhhhh.',
  '........hhhhh.',
  '.........hhhh.',
  '.........hhhh.',
  '.........hhhh.',
  '.........oooo.',
  '.........oooo.',
  '.........vvvv.', // calves
  '.........vvvv.',
  '.........vvvv.',
  '.........vvvv.',
  '.........vvvv.',
  '..........vvv.',
  '..........vvv.',
  '..........ooo.',
  '........ooooo.',
  '........ooooo.',
]);
export const BODY_KEY: Record<string, MuscleId> = {
  s: 'shoulders', c: 'chest', b: 'biceps', a: 'abs', q: 'quads', v: 'calves',
  t: 'back', l: 'back', r: 'triceps', w: 'lowerback', g: 'glutes', h: 'hamstrings',
};

// ---------------------------------------------------------------- exercise → muscles
// First matching rule wins, so order matters (e.g. "leg press" before the generic chest "press").
const RULES: [RegExp, MuscleId, MuscleId[]][] = [
  [/romanian|\brdl\b|stiff.?leg|leg curl|hamstring|good morning|nordic/, 'hamstrings', ['glutes', 'lowerback']],
  [/deadlift/, 'lowerback', ['hamstrings', 'glutes', 'back']],
  [/hip thrust|glute|bridge/, 'glutes', ['hamstrings']],
  [/squat|leg press|lunge|leg extension|step.?up/, 'quads', ['glutes']],
  [/calf|calves/, 'calves', []],
  [/crunch|plank|sit.?up|leg raise|knee raise|ab wheel|russian twist|\babs?\b|\bcore\b|mountain climber/, 'abs', []],
  [/hyperextension|back extension|superman/, 'lowerback', ['glutes']],
  [/overhead press|shoulder press|military|\bohp\b|arnold/, 'shoulders', ['triceps']],
  [/lateral raise|front raise|rear delt|reverse fly|face pull|upright row/, 'shoulders', []],
  [/tricep|pushdown|skull|close.?grip|\bdips?\b/, 'triceps', ['chest']],
  [/pull.?up|chin.?up|pulldown|\blat\b|\brow|pullover|shrug/, 'back', ['biceps']],
  [/curl/, 'biceps', []],
  [/bench|chest|push.?up|fly|flye|incline|decline|\bpec|press/, 'chest', ['triceps', 'shoulders']],
];

export function musclesOf(name: string, overrides: Record<string, string> = {}): { primary?: MuscleId; secondary: MuscleId[] } {
  const key = name.trim().toLowerCase();
  const forced = overrides[key] as MuscleId | undefined;
  if (forced && MUSCLES[forced]) return { primary: forced, secondary: [] };
  const rule = RULES.find(([re]) => re.test(key));
  return rule ? { primary: rule[1], secondary: rule[2] } : { secondary: [] };
}

// ---------------------------------------------------------------- stats
export interface MuscleStat {
  sets7: number; // weighted sets in the last 7 days (primary 1, secondary 0.5)
  volume7: number; // kg x reps as primary mover, last 7 days
  last?: DateStr;
  daysSince?: number;
  exercises: string[]; // known exercises where this is the primary muscle
  weekly: number[]; // weighted sets per week, last 8 weeks (last = this week)
}

export function knownExercises(d: DB): string[] {
  return [...new Set([...d.templates.flatMap(t => t.exercises), ...d.workouts.flatMap(w => w.exercises?.map(e => e.name) ?? [])].map(s => s.trim()).filter(Boolean))].sort();
}

export function muscleStats(d: DB, ref: DateStr = today()): Record<MuscleId, MuscleStat> {
  const ov = d.settings.muscleOf ?? {};
  const out = Object.fromEntries(MUSCLE_IDS.map(m => [m, { sets7: 0, volume7: 0, exercises: [], weekly: Array(8).fill(0) } as MuscleStat])) as Record<MuscleId, MuscleStat>;
  for (const name of knownExercises(d)) { const p = musclesOf(name, ov).primary; if (p) out[p].exercises.push(name); }
  const from7 = addDays(ref, -6);
  const w0 = addDays(weekStart(ref), -49);
  for (const w of d.workouts) {
    if (!w.exercises?.length || w.date > ref) continue;
    const week = w.date >= w0 ? Math.floor(diffDays(w.date, w0) / 7) : -1;
    for (const ex of w.exercises) {
      const m = musclesOf(ex.name, ov);
      const sets = ex.sets.length;
      const hit = (id: MuscleId, weight: number) => {
        const s = out[id];
        if (!s.last || w.date > s.last) s.last = w.date;
        if (w.date >= from7) s.sets7 += sets * weight;
        if (week >= 0 && week < 8) s.weekly[week] += sets * weight;
      };
      if (m.primary) {
        hit(m.primary, 1);
        if (w.date >= from7) out[m.primary].volume7 += ex.sets.reduce((a, s) => a + s.reps * s.kg, 0);
      }
      for (const sec of m.secondary) hit(sec, 0.5);
    }
  }
  for (const m of MUSCLE_IDS) if (out[m].last) out[m].daysSince = diffDays(ref, out[m].last!);
  return out;
}

/** Which muscles a template trains (primary movers only). */
export function templateMuscles(t: WorkoutTemplate, overrides: Record<string, string> = {}): MuscleId[] {
  return [...new Set(t.exercises.map(e => musclesOf(e, overrides).primary).filter((m): m is MuscleId => !!m))];
}

/** The template whose muscles have rested longest. Nothing if every option was trained in the last day. */
export function suggestTemplate(d: DB, stats: Record<MuscleId, MuscleStat>) {
  const scored = d.templates.map(t => {
    const ms = templateMuscles(t, d.settings.muscleOf);
    const rest = ms.map(m => stats[m].daysSince ?? 14);
    return { t, ms, minRest: ms.length ? Math.min(...rest) : 0, avg: ms.length ? rest.reduce((a, b) => a + b, 0) / ms.length : 0 };
  }).filter(x => x.ms.length && x.minRest >= 2);
  return scored.sort((a, b) => b.avg - a.avg)[0];
}

export function exerciseHistory(d: DB, name: string) {
  return d.workouts
    .filter(w => w.exercises?.some(e => e.name === name))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => {
      const sets = w.exercises!.find(e => e.name === name)!.sets;
      const top = sets.reduce((a, s) => (s.kg > a.kg || (s.kg === a.kg && s.reps > a.reps) ? s : a), sets[0] ?? { kg: 0, reps: 0 });
      return { date: w.date, sets, top, e1rm: Math.max(0, ...sets.map(s => s.kg * (1 + s.reps / 30))) };
    });
}
