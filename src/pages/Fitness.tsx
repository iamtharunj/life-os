import { useMemo, useState } from 'react';
import {
  Activity, ArrowRight, CalendarDays, ClipboardList, Dumbbell, Flame, Footprints, HeartPulse, History, Library, PersonStanding, Play, Plus,
  Sparkles, Timer, Trophy, X,
} from 'lucide-react';
import type { DB, Workout, WorkoutType } from '../lib/types.ts';
import { setSettings, useDB } from '../lib/store.ts';
import { addDays, diffDays, dow, fmtDur, monthStart, niceDate, range, shortDate, today, weekStart } from '../lib/dates.ts';
import { fmtPace, lastSets, personalRecords, runKm, training, workoutsIn } from '../lib/derive.ts';
import { AREAS, WORKOUT_TYPES } from '../lib/meta.ts';
import { MUSCLES, MUSCLE_IDS, exerciseHistory, knownExercises, muscleStats, musclesOf, suggestTemplate, templateMuscles, type MuscleId, type MuscleStat } from '../lib/muscles.ts';
import { Btn, Card, Empty, IconBtn, Meter, Pill, Seg, Stat, Tabs, usePref } from '../components/ui.tsx';
import { Bars, HBars, Heatmap, Lines, Spark, ramp } from '../components/charts.tsx';
import { BodyMap, MusclePic, heatFill } from '../components/BodyMap.tsx';
import { openCapture, openEditor } from '../components/editors.tsx';
import { WORKOUT_ICON } from '../components/icons.tsx';

const C = AREAS.fitness.color;
const CARDIO: WorkoutType[] = ['run', 'walk', 'cardio', 'basketball'];
type Tab = 'overview' | 'gym' | 'cardio' | 'history';

const label = (w: Workout) => (w.type === 'cardio' && w.activity ? w.activity : WORKOUT_TYPES[w.type].label);
const ago = (n?: number) => (n === undefined ? 'not trained yet' : n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n}d ago`);
const paceAxis = (n: number) => `${Math.floor(n)}:${String(Math.round((n % 1) * 60)).padStart(2, '0')}`;
const emptySets = () => [{ reps: 8, kg: 0 }, { reps: 8, kg: 0 }, { reps: 8, kg: 0 }];
const withLastSets = (d: DB, names: string[]) => names.map(name => ({ name, sets: (lastSets(d, name) ?? emptySets()).map(s => ({ ...s })) }));

export default function Fitness() {
  const d = useDB();
  const T = today();
  const [tab, setTab] = usePref<Tab>('fit.tab', 'overview');
  const stats = useMemo(() => muscleStats(d, T), [d, T]);
  const ws = weekStart(T);
  const week = workoutsIn(d, ws, T);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · fitness</div><h1>Fitness</h1><div className="sub">Log what you actually did. No rigid plan required.</div></div>
        <div className="row wrap">
          {(Object.keys(WORKOUT_TYPES) as WorkoutType[]).map(t => { const I = WORKOUT_ICON[t]; return <button key={t} className="chip" onClick={() => openCapture('workout', { type: t })}><I />{WORKOUT_TYPES[t].label}</button>; })}
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'overview', label: <><Activity size={14} />Overview</> },
        { k: 'gym', label: <><Dumbbell size={14} />Gym & muscles</>, count: week.filter(w => w.type === 'gym').length },
        { k: 'cardio', label: <><HeartPulse size={14} />Cardio</>, count: week.filter(w => CARDIO.includes(w.type)).length },
        { k: 'history', label: <><History size={14} />History</> },
      ]} />
      {tab === 'overview' && <Overview d={d} stats={stats} go={setTab} />}
      {tab === 'gym' && <Gym d={d} stats={stats} />}
      {tab === 'cardio' && <Cardio d={d} />}
      {tab === 'history' && <HistoryTab d={d} />}
    </div>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ d, stats, go }: { d: DB; stats: Record<MuscleId, MuscleStat>; go: (t: Tab) => void }) {
  const T = today();
  const ws = weekStart(T);
  const s = d.settings;
  const week = workoutsIn(d, ws, T);
  const month = workoutsIn(d, monthStart(T), T);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(ws, -7 * (11 - i)));
  const runsM = month.filter(w => w.type === 'run');
  const target = s.weekly.muscleSets;
  const neglected = MUSCLE_IDS.filter(m => stats[m].sets7 === 0);
  const lastRun = [...d.workouts].filter(w => w.type === 'run').sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <>
      <div className="g g4">
        <Card><Stat k="This week" v={`${training(week).length}`} unit={`/ ${s.weekly.workouts} sessions`} /><div className="mt8"><Meter value={(training(week).length / s.weekly.workouts) * 100} color={C} /></div></Card>
        <Card><Stat k="Training time" v={fmtDur(training(week).reduce((a, w) => a + w.min, 0))} d={`${fmtDur(training(month).reduce((a, w) => a + w.min, 0))} this month`} /></Card>
        <Card><Stat k="Running" v={`${runKm(week).toFixed(1)}`} unit={`/ ${s.weekly.runKm} km`} d={`${runKm(month).toFixed(1)} km this month${runsM.length ? ` · avg ${fmtPace(runsM.reduce((a, w) => a + w.min, 0) / Math.max(0.1, runKm(runsM)))}` : ''}`} /></Card>
        <Card><Stat k="This month" v={training(month).length} unit="sessions" d={Object.entries(WORKOUT_TYPES).map(([k, w]) => { const n = month.filter(x => x.type === k).length; return n ? `${n} ${w.label.toLowerCase()}` : ''; }).filter(Boolean).slice(0, 3).join(' · ')} /></Card>
      </div>

      <Card title="This week" icon={CalendarDays} className="mt16">
        <div className="g" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {range(ws, addDays(ws, 6)).map(x => {
            const ws2 = d.workouts.filter(w => w.date === x);
            return (
              <button key={x} className="sub-card" style={{ textAlign: 'center', minHeight: 84, opacity: x > T ? 0.45 : 1, borderColor: x === T ? 'var(--accent-line)' : undefined }} onClick={() => openCapture('workout', { date: x })}>
                <div className="tiny muted">{dow(x)}</div>
                <div className="col gap-4 mt4" style={{ alignItems: 'center' }}>
                  {ws2.map(w => { const I = WORKOUT_ICON[w.type]; return <span key={w.id} className="row gap-4 tiny" title={`${label(w)} ${fmtDur(w.min)}`}><I size={13} style={{ color: w.type === 'rest' ? 'var(--sleep)' : C }} /><span className="hide-m">{fmtDur(w.min)}</span></span>; })}
                  {!ws2.length && x <= T && <span className="tiny muted">—</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Muscles, last 7 days" icon={PersonStanding} actions={<Btn size="sm" variant="ghost" onClick={() => go('gym')}>Gym<ArrowRight size={13} /></Btn>}>
          <div className="row gap-16 wrap" style={{ justifyContent: 'center' }}>
            <BodyMap height={210} fill={m => heatFill(C, stats[m].sets7 / target)} tip={m => `${MUSCLES[m].label}: ${+stats[m].sets7.toFixed(1)} sets · ${ago(stats[m].daysSince)}`} onPick={() => go('gym')} />
            <div className="col" style={{ minWidth: 150, flex: 1 }}>
              {[...MUSCLE_IDS].sort((a, b) => stats[b].sets7 - stats[a].sets7).slice(0, 4).map(m => (
                <div key={m} className="row small"><span className="grow dim">{MUSCLES[m].label}</span><span className="num">{+stats[m].sets7.toFixed(1)}</span><span className="tiny muted">sets</span></div>
              ))}
              {neglected.length > 0 && <div className="tiny warn mt4">No sets this week: {neglected.map(m => MUSCLES[m].label).join(', ')}</div>}
            </div>
          </div>
        </Card>
        <Card title="Cardio" icon={HeartPulse} actions={<Btn size="sm" variant="ghost" onClick={() => go('cardio')}>Cardio<ArrowRight size={13} /></Btn>}>
          <div className="g g2">
            <div><Stat k="Running this week" v={runKm(week).toFixed(1)} unit={`/ ${s.weekly.runKm} km`} /><div className="mt8"><Meter value={(runKm(week) / s.weekly.runKm) * 100} color={C} /></div></div>
            <Stat k="Cardio time this week" v={fmtDur(week.filter(w => CARDIO.includes(w.type)).reduce((a, w) => a + w.min, 0))} d={`${week.filter(w => CARDIO.includes(w.type)).length} sessions`} />
          </div>
          <div className="hr" />
          {lastRun ? <div className="small dim">Last run: <b>{lastRun.km} km</b> at {fmtPace(lastRun.min / (lastRun.km || 1))} · {niceDate(lastRun.date)}</div> : <div className="small muted">No runs logged yet.</div>}
        </Card>
        <Card title="Sessions per week" icon={Dumbbell} style={{ gridColumn: '1 / -1' }}>
          <Bars data={weeks.map(w => ({ label: shortDate(w), value: training(workoutsIn(d, w, addDays(w, 6))).length, tip: <><b>{training(workoutsIn(d, w, addDays(w, 6))).length} sessions</b> <span className="muted">week of {shortDate(w)}</span></> }))} color={C} height={150} target={{ value: s.weekly.workouts, label: 'target' }} />
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ gym & muscle groups
function Gym({ d, stats }: { d: DB; stats: Record<MuscleId, MuscleStat> }) {
  const T = today();
  const [pin, setPin] = useState<MuscleId>();
  const [hover, setHover] = useState<MuscleId>();
  const [region, setRegion] = usePref<'All' | 'Upper' | 'Lower' | 'Core'>('fit.region', 'All');
  const target = d.settings.weekly.muscleSets;
  const ov = d.settings.muscleOf ?? {};
  const focus = hover ?? pin;
  const suggestion = suggestTemplate(d, stats);
  const prs = personalRecords(d);
  const sorted = [...MUSCLE_IDS].sort((a, b) => stats[b].sets7 - stats[a].sets7);
  const neglected = MUSCLE_IDS.filter(m => stats[m].sets7 === 0);
  const startTemplate = (id: string) => { const t = d.templates.find(x => x.id === id)!; openEditor('workout', { defaults: { type: 'gym', template: t.name, min: 60, date: T, exercises: withLastSets(d, t.exercises) } }); };
  const pick = (m: MuscleId) => setPin(p => (p === m ? undefined : m));

  return (
    <>
      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1.25fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card title="Muscle map · sets in the last 7 days" icon={PersonStanding}>
          <div className="row gap-16 wrap" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <BodyMap height={300} active={pin} onPick={pick} onHover={setHover}
              fill={m => heatFill(C, stats[m].sets7 / target)}
              tip={m => `${MUSCLES[m].label}: ${+stats[m].sets7.toFixed(1)} sets · ${ago(stats[m].daysSince)}`} />
            <div className="col" style={{ minWidth: 190, flex: 1 }}>
              {focus ? <MuscleInfo m={focus} s={stats[focus]} target={target} /> : (
                <>
                  <div className="label">Hover or tap a muscle</div>
                  <div className="small dim">Most trained</div>
                  {sorted.slice(0, 3).map(m => <div key={m} className="row small"><span className="grow">{MUSCLES[m].label}</span><span className="num">{+stats[m].sets7.toFixed(1)}</span><span className="tiny muted">sets</span></div>)}
                  {neglected.length > 0 && <><div className="small dim mt8">No sets this week</div><div className="chips">{neglected.map(m => <button key={m} className="chip" onClick={() => pick(m)}>{MUSCLES[m].label}</button>)}</div></>}
                </>
              )}
            </div>
          </div>
          <div className="row tiny muted mt12" style={{ justifyContent: 'center' }}>
            <span>0</span>
            {[0.15, 0.4, 0.7, 1].map(t => <i key={t} className="swatch" style={{ background: heatFill(C, t), width: 22, height: 8, borderRadius: 2 }} />)}
            <span>{target}+ sets / week · main muscle counts 1, assisting muscles ½</span>
          </div>
        </Card>

        <div className="g">
          <Card title="Suggested next" icon={Sparkles}>
            {suggestion ? (
              <div className="row">
                <div className="grow">
                  <div className="bold" style={{ fontSize: 16 }}>{suggestion.t.name}</div>
                  <div className="small dim">{suggestion.ms.map(m => MUSCLES[m].label).join(', ')} · rested {suggestion.minRest >= 14 ? 'a long time' : `${suggestion.minRest}+ days`}</div>
                </div>
                <Btn variant="primary" icon={Play} onClick={() => startTemplate(suggestion.t.id)}>Start</Btn>
              </div>
            ) : <div className="small muted">{d.templates.length ? 'Everything was trained in the last day. A rest or cardio day fits.' : 'Add a template to get suggestions based on which muscles have rested longest.'}</div>}
          </Card>
          <Card title="Templates" icon={ClipboardList} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openEditor('template')}>Template</Btn>}>
            {d.templates.length === 0 && <div className="small muted">Save your usual splits (Push / Pull / Legs) to log a gym session in seconds.</div>}
            <div className="list">
              {d.templates.map(t => (
                <div key={t.id} className="li">
                  <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => openEditor('template', { id: t.id })}>
                    <div className="title">{t.name} <span className="tiny muted">· {t.exercises.length} exercises</span></div>
                    <div className="meta">{templateMuscles(t, ov).map(m => <Pill key={m} tone="outline">{MUSCLES[m].label}</Pill>)}</div>
                  </button>
                  <Btn size="sm" onClick={() => startTemplate(t.id)}>Start</Btn>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {pin && <MuscleDetail d={d} m={pin} s={stats[pin]} close={() => setPin(undefined)} />}

      <div className="row between mt16" style={{ marginBottom: 10 }}>
        <div className="label"><Flame />Muscle groups</div>
        <Seg value={region} onChange={setRegion} options={(['All', 'Upper', 'Lower', 'Core'] as const).map(k => ({ k, label: k }))} />
      </div>
      <div className="g" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(165px, 100%), 1fr))' }}>
        {MUSCLE_IDS.filter(m => region === 'All' || MUSCLES[m].region === region).map(m => {
          const s = stats[m];
          const due = s.daysSince === undefined || s.daysSince >= 8;
          return (
            <button key={m} className={`card hover muscle-card ${pin === m ? 'on' : ''}`} onClick={() => pick(m)} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(undefined)}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <MusclePic muscle={m} color={C} />
                <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
                  <div className="bold">{MUSCLES[m].label}</div>
                  <Pill tone="outline">{MUSCLES[m].region}</Pill>
                  <div className={`tiny mt8 ${due ? 'warn' : 'muted'}`}>{ago(s.daysSince)}{s.daysSince !== undefined && s.daysSince <= 1 ? ' · recovering' : due && s.daysSince !== undefined ? ' · due' : ''}</div>
                  <div className="tiny muted">{s.exercises.length} exercise{s.exercises.length === 1 ? '' : 's'}</div>
                </div>
              </div>
              <div className="row mt8"><Meter value={(s.sets7 / target) * 100} color={C} /><span className="num tiny nowrap">{+s.sets7.toFixed(1)}/{target} sets</span></div>
              <div className="row between mt8"><span className="tiny muted">8 weeks</span><Spark values={s.weekly} color={C} width={76} height={22} /></div>
            </button>
          );
        })}
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <ExerciseLibrary d={d} />
        <Card title="Lift records" icon={Trophy}>
          {prs.lifts.length === 0 ? <div className="small muted">Log sets in a gym workout to track PRs.</div> : (
            <div className="list">
              {prs.lifts.slice(0, 12).map(p => {
                const m = musclesOf(p.name, ov).primary;
                return (
                  <div key={p.name} className="li">
                    <div className="grow" style={{ minWidth: 0 }}><div className="small ellipsis">{p.name}</div><div className="tiny muted">{m ? MUSCLES[m].label : 'Unassigned'} · {shortDate(p.date)}</div></div>
                    <span className="num small bold">{p.kg ? `${p.kg} kg × ${p.reps}` : `${p.reps} reps`}</span>
                    <span className="num tiny muted" style={{ width: 78, textAlign: 'right' }}>{p.kg ? `e1RM ${Math.round(p.e1rm)}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function MuscleInfo({ m, s, target }: { m: MuscleId; s: MuscleStat; target: number }) {
  return (
    <>
      <div className="row"><span className="bold" style={{ fontSize: 18 }}>{MUSCLES[m].label}</span><Pill tone="outline">{MUSCLES[m].region}</Pill></div>
      <div className="row"><Meter value={(s.sets7 / target) * 100} color={C} thick /><span className="num small">{+s.sets7.toFixed(1)}/{target}</span></div>
      <div className="small dim">Last trained: <b>{ago(s.daysSince)}</b></div>
      <div className="small dim">Volume (7d): <b className="num">{Math.round(s.volume7).toLocaleString('en-IN')} kg</b></div>
      <div className="tiny muted">{s.exercises.length ? s.exercises.slice(0, 4).join(' · ') : 'No exercises mapped yet'}</div>
    </>
  );
}

function MuscleDetail({ d, m, s, close }: { d: DB; m: MuscleId; s: MuscleStat; close: () => void }) {
  const ov = d.settings.muscleOf ?? {};
  return (
    <Card className="mt16" title={`${MUSCLES[m].label} · exercises`} icon={Dumbbell} style={{ borderColor: 'var(--accent-line)' }}
      actions={<>
        {s.exercises.length > 0 && <Btn size="sm" variant="primary" icon={Play} onClick={() => openEditor('workout', { defaults: { type: 'gym', min: 45, date: today(), template: MUSCLES[m].label, exercises: withLastSets(d, s.exercises) } })}>Log {MUSCLES[m].label.toLowerCase()} workout</Btn>}
        <IconBtn icon={X} sm label="Close" onClick={close} />
      </>}>
      {s.exercises.length === 0 && <div className="small muted">Nothing is mapped to {MUSCLES[m].label.toLowerCase()} yet. Log an exercise for it (e.g. {EXAMPLES[m]}), or assign an existing exercise in the library below.</div>}
      <div className="list">
        {s.exercises.map(name => {
          const h = exerciseHistory(d, name);
          const last = h[h.length - 1];
          const best = h.reduce((a, x) => Math.max(a, x.e1rm), 0);
          const sec = musclesOf(name, ov).secondary;
          return (
            <div key={name} className="li">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title ellipsis">{name}</div>
                <div className="tiny muted ellipsis">{last ? `Last ${shortDate(last.date)}: ${last.sets.map(x => `${x.reps}×${x.kg}`).join(', ')}` : 'Not logged yet'}{sec.length ? ` · also ${sec.map(x => MUSCLES[x].label.toLowerCase()).join(', ')}` : ''}</div>
              </div>
              {h.length > 1 && <span title="Estimated 1-rep max over time"><Spark values={h.slice(-10).map(x => x.e1rm)} color={C} width={84} height={24} /></span>}
              <div style={{ textAlign: 'right', width: 86 }}><div className="num small bold">{last ? `${last.top.kg} kg × ${last.top.reps}` : '—'}</div><div className="tiny muted num">{best ? `e1RM ${Math.round(best)}` : ''}</div></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
const EXAMPLES: Record<MuscleId, string> = {
  chest: 'Bench press', shoulders: 'Lateral raise', triceps: 'Tricep pushdown', biceps: 'Bicep curl', back: 'Lat pulldown', lowerback: 'Back extension',
  abs: 'Hanging leg raise', quads: 'Squat', hamstrings: 'Leg curl', glutes: 'Hip thrust', calves: 'Calf raise',
};

function ExerciseLibrary({ d }: { d: DB }) {
  const ov = d.settings.muscleOf ?? {};
  const names = knownExercises(d);
  const assign = (name: string, v: string) => {
    const next = { ...ov };
    if (v) next[name.toLowerCase()] = v; else delete next[name.toLowerCase()];
    setSettings({ muscleOf: next });
  };
  return (
    <Card title="Exercise library" icon={Library} actions={<span className="tiny muted">{names.length} exercises</span>}>
      {names.length === 0 && <Empty icon={Dumbbell} title="No exercises yet" hint="They appear here once you log a gym workout or save a template." />}
      <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {names.map(name => {
          const auto = musclesOf(name).primary;
          const h = exerciseHistory(d, name);
          return (
            <div key={name} className="li">
              <div className="grow" style={{ minWidth: 0 }}><div className="small ellipsis">{name}</div><div className="tiny muted">{h.length ? `${h.length} session${h.length === 1 ? '' : 's'} · last ${shortDate(h[h.length - 1].date)}` : 'in a template'}</div></div>
              <select className="select" style={{ width: 176, height: 30 }} value={ov[name.toLowerCase()] ?? ''} onChange={e => assign(name, e.target.value)} aria-label={`Muscle group for ${name}`}>
                <option value="">Auto · {auto ? MUSCLES[auto].label : 'unassigned'}</option>
                {MUSCLE_IDS.map(m => <option key={m} value={m}>{MUSCLES[m].label}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      <p className="tiny muted mt8">Muscles are guessed from the exercise name. Change one here if the guess is wrong.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ cardio
function Cardio({ d }: { d: DB }) {
  const T = today();
  const ws = weekStart(T);
  const s = d.settings;
  const all = d.workouts.filter(w => CARDIO.includes(w.type)).sort((a, b) => b.date.localeCompare(a.date));
  const inRange = (from: string, to: string) => all.filter(w => w.date >= from && w.date <= to);
  const week = inRange(ws, T);
  const month = inRange(monthStart(T), T);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(ws, -7 * (11 - i)));
  const runs = all.filter(w => w.type === 'run' && w.km);
  const avgPace = (xs: Workout[]) => (xs.length ? xs.reduce((a, w) => a + w.min, 0) / Math.max(0.1, runKm(xs)) : 0);
  const p30 = avgPace(runs.filter(w => w.date >= addDays(T, -29)));
  const pPrev = avgPace(runs.filter(w => w.date >= addDays(T, -59) && w.date < addDays(T, -29)));
  const delta = p30 && pPrev ? Math.round((pPrev - p30) * 60) : 0;
  const chartRuns = runs.slice(0, 15).reverse();
  const prs = personalRecords(d);
  const bestWeek = weeks.map(w => ({ w, km: runKm(inRange(w, addDays(w, 6))) })).sort((a, b) => b.km - a.km)[0];
  const longest = [...all].sort((a, b) => b.min - a.min)[0];
  const byKind = new Map<string, number>();
  for (const w of inRange(addDays(T, -29), T)) byKind.set(label(w), (byKind.get(label(w)) ?? 0) + w.min);

  return (
    <>
      <div className="g g4">
        <Card><Stat k="Running this week" v={runKm(week).toFixed(1)} unit={`/ ${s.weekly.runKm} km`} /><div className="mt8"><Meter value={(runKm(week) / s.weekly.runKm) * 100} color={C} /></div></Card>
        <Card><Stat k="Cardio time this week" v={fmtDur(week.reduce((a, w) => a + w.min, 0))} d={`${week.length} session${week.length === 1 ? '' : 's'}`} /></Card>
        <Card><Stat k="Average pace, 30 days" v={p30 ? fmtPace(p30) : '—'} d={delta ? `${Math.abs(delta)}s/km ${delta > 0 ? 'faster' : 'slower'} than the 30 days before` : 'runs with distance logged'} tone={delta > 0 ? 'good' : delta < 0 ? 'warn' : undefined} /></Card>
        <Card><Stat k="This month" v={runKm(month).toFixed(1)} unit="km" d={`${month.length} cardio sessions · ${fmtDur(month.reduce((a, w) => a + w.min, 0))}`} /></Card>
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Running distance per week" icon={Footprints}>
          <Bars data={weeks.map(w => ({ label: shortDate(w), value: runKm(inRange(w, addDays(w, 6))) }))} color={C} height={160} target={{ value: s.weekly.runKm, label: `${s.weekly.runKm} km` }} />
          <div className="tiny muted">km per week, last 12 weeks</div>
        </Card>
        <Card title="Pace per run" icon={Timer}>
          {chartRuns.length > 1 ? (
            <Lines height={160} labels={chartRuns.map(w => shortDate(w.date))} fmt={paceAxis} area={false}
              floor={Math.floor(Math.min(...chartRuns.map(w => w.min / w.km!)) - 0.5)}
              series={[{ name: 'Pace', color: C, values: chartRuns.map(w => +(w.min / w.km!).toFixed(2)) }]} />
          ) : <Empty icon={Footprints} title="Log two runs with distance to see your pace trend" />}
          <div className="tiny muted">min per km, last {chartRuns.length} runs — lower is faster</div>
        </Card>
        <Card title="Cardio minutes per week" icon={HeartPulse}>
          <Bars data={weeks.map(w => ({ label: shortDate(w), value: inRange(w, addDays(w, 6)).reduce((a, x) => a + x.min, 0) }))} color={C} height={150} fmt={n => `${Math.round(n)}`} />
          <div className="tiny muted">running, walking, basketball and other cardio</div>
        </Card>
        <Card title="By activity, last 30 days" icon={Activity}>
          {byKind.size === 0 ? <div className="small muted">No cardio in the last 30 days.</div> : <HBars data={[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} fmt={fmtDur} color={C} />}
          <div className="hr" />
          <div className="label" style={{ marginBottom: 8 }}><Trophy />Records</div>
          <div className="g g2" style={{ gap: 8 }}>
            <div className="sub-card"><div className="tiny muted">Longest run</div><div className="bold">{prs.longest ? `${prs.longest.km} km` : '—'}</div><div className="tiny muted">{prs.longest ? shortDate(prs.longest.date) : ''}</div></div>
            <div className="sub-card"><div className="tiny muted">Fastest pace (3 km+)</div><div className="bold">{prs.fastest ? fmtPace(prs.fastest.min / prs.fastest.km!) : '—'}</div><div className="tiny muted">{prs.fastest ? `${prs.fastest.km} km · ${shortDate(prs.fastest.date)}` : ''}</div></div>
            <div className="sub-card"><div className="tiny muted">Biggest week</div><div className="bold">{bestWeek?.km ? `${bestWeek.km.toFixed(1)} km` : '—'}</div><div className="tiny muted">{bestWeek?.km ? `week of ${shortDate(bestWeek.w)}` : ''}</div></div>
            <div className="sub-card"><div className="tiny muted">Longest session</div><div className="bold">{longest ? fmtDur(longest.min) : '—'}</div><div className="tiny muted">{longest ? `${label(longest)} · ${shortDate(longest.date)}` : ''}</div></div>
          </div>
        </Card>
        <Card title="Cardio log" icon={History} style={{ gridColumn: '1 / -1' }}>
          <div className="chips" style={{ marginBottom: 8 }}>
            {CARDIO.map(t => { const I = WORKOUT_ICON[t]; return <button key={t} className="chip" onClick={() => openCapture('workout', { type: t })}><I />Log {WORKOUT_TYPES[t].label.toLowerCase()}</button>; })}
          </div>
          {all.length === 0 && <Empty icon={HeartPulse} title="No cardio logged yet" />}
          <div className="list">{all.slice(0, 15).map(w => <WorkoutRow key={w.id} w={w} />)}</div>
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ history
function HistoryTab({ d }: { d: DB }) {
  const T = today();
  const [type, setType] = useState<WorkoutType | undefined>();
  const heat = range(weekStart(addDays(T, -7 * 25)), addDays(weekStart(T), 6));
  const list = [...d.workouts].filter(w => !type || w.type === type).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="g">
      <Card title="Activity calendar" icon={Activity}>
        <Heatmap days={heat} today={T} cell={x => {
          const ws2 = d.workouts.filter(w => w.date === x && w.type !== 'rest');
          const m = ws2.reduce((a, w) => a + w.min, 0);
          return { fill: ramp(C, m / 90), tip: `${niceDate(x)}: ${ws2.length ? ws2.map(w => `${label(w)} ${fmtDur(w.min)}`).join(', ') : 'rest'}` };
        }} />
        <div className="row between tiny muted mt8"><span>{shortDate(heat[0])}</span><span>darker = longer session</span></div>
      </Card>
      <Card title="Workouts" icon={History} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openCapture('workout')}>Workout</Btn>}>
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={`chip ${!type ? 'on' : ''}`} onClick={() => setType(undefined)}>All</button>
          {(Object.keys(WORKOUT_TYPES) as WorkoutType[]).map(t => <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{WORKOUT_TYPES[t].label}</button>)}
        </div>
        {list.length === 0 && <Empty icon={Dumbbell} title="No workouts yet" />}
        <div className="list">{list.slice(0, 40).map(w => <WorkoutRow key={w.id} w={w} muscles={d.settings.muscleOf} />)}</div>
        {list.length > 40 && <div className="tiny muted mt8">Showing the latest 40 of {list.length}.</div>}
      </Card>
    </div>
  );
}

function WorkoutRow({ w, muscles }: { w: Workout; muscles?: Record<string, string> }) {
  const I = WORKOUT_ICON[w.type];
  const hit = w.exercises?.length ? [...new Set(w.exercises.map(e => musclesOf(e.name, muscles).primary).filter((m): m is MuscleId => !!m))] : [];
  const T = today();
  return (
    <div className="li click" onClick={() => openEditor('workout', { id: w.id })}>
      <div className="area-ic" style={{ ['--c' as string]: w.type === 'rest' ? 'var(--sleep)' : C, width: 30, height: 30 }}><I /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title">{label(w)}{w.template ? ` · ${w.template}` : ''}</div>
        <div className="tiny muted ellipsis">{hit.length ? hit.map(m => MUSCLES[m].label).join(' · ') : w.exercises?.length ? w.exercises.map(e => e.name).join(', ') : w.notes ?? ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num small">{fmtDur(w.min)}{w.km ? ` · ${w.km} km` : ''}</div>
        <div className="tiny muted">{diffDays(T, w.date) === 0 ? 'today' : niceDate(w.date)}{w.km ? ` · ${fmtPace(w.min / w.km)}` : ''}</div>
      </div>
      {w.effort && <Pill className="hide-m">RPE {w.effort}</Pill>}
    </div>
  );
}
