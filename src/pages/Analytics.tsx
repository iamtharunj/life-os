import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import type { DB, DateStr } from '../lib/types.ts';
import { useDB } from '../lib/store.ts';
import { addDays, addMonths, dow, fmtDur, monthEnd, monthName, monthStart, range, shortDate, today, weekStart } from '../lib/dates.ts';
import {
  activeHabits, goalPace, goalProgress, habitRate, meditationsIn, projectProgress, runKm, sleepMin, sleepStats, spendIn, studyMin,
  training, workoutsIn, expensesIn, projectLast,
} from '../lib/derive.ts';
import { AREAS, OPEN_STATUSES, SLEEP_COLOR } from '../lib/meta.ts';
import { Card, Seg, money, usePref } from '../components/ui.tsx';
import { Bars, HBars, Lines } from '../components/charts.tsx';

interface Bucket { label: string; from: DateStr; to: DateStr }
function buckets(span: number, T: DateStr): Bucket[] {
  if (span <= 30) return range(addDays(T, -(span - 1)), T).map(x => ({ label: span <= 7 ? dow(x) : shortDate(x), from: x, to: x }));
  if (span <= 90) { const ws = weekStart(T); return Array.from({ length: 13 }, (_, i) => { const w = addDays(ws, -7 * (12 - i)); return { label: shortDate(w), from: w, to: addDays(w, 6) }; }); }
  return Array.from({ length: 12 }, (_, i) => { const m = addMonths(monthStart(T), i - 11); return { label: monthName(m), from: m, to: monthEnd(m) }; });
}

function Q({ q, a, children }: { q: string; a: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <h3>{q}</h3>
      <div className="small dim" style={{ margin: '2px 0 12px' }}>{a}</div>
      {children}
    </Card>
  );
}

export default function Analytics() {
  const d = useDB();
  const T = today();
  const [span, setSpan] = usePref<number>('an.span', 30);
  const B = buckets(span, T);
  const from = addDays(T, -(span - 1));
  const s = d.settings;
  const unit = span <= 30 ? 'per day' : span <= 90 ? 'per week' : 'per month';
  const perDay = (b: Bucket) => range(b.from, b.to < T ? b.to : T).length || 1;

  const sl = sleepStats(d, from, T);
  const sleepVals = B.map(b => sleepStats(d, b.from, b.to).avg / 60);
  const studyVals = B.map(b => studyMin(d, b.from, b.to) / 60);
  const trainVals = B.map(b => training(workoutsIn(d, b.from, b.to)).length);
  const runVals = B.map(b => runKm(workoutsIn(d, b.from, b.to)));
  const hs = activeHabits(d);
  const habitVals = B.map(b => (b.from > T || !hs.length ? 0 : Math.round(hs.reduce((a, h) => a + habitRate(d, h, b.from, b.to), 0) / hs.length)));
  const spendVals = B.map(b => spendIn(d, b.from, b.to));
  const mindVals = B.map(b => meditationsIn(d, b.from, b.to).reduce((a, m) => a + m.min, 0));
  const cats = new Map<string, number>();
  for (const t of expensesIn(d, from, T)) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const openP = d.projects.filter(p => OPEN_STATUSES.includes(p.status));
  const goals = d.goals.filter(g => g.status === 'active' && g.level !== 'vision');
  const totalSpend = spendVals.reduce((a, b) => a + b, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Reflect</div><h1>Analytics</h1><div className="sub">Each chart answers one question. Buckets: {unit}.</div></div>
        <Seg value={span} onChange={setSpan} options={[{ k: 7, label: '7 days' }, { k: 30, label: '30 days' }, { k: 90, label: '90 days' }, { k: 365, label: '1 year' }]} />
      </div>
      <div className="g g2" style={{ alignItems: 'start' }}>
        <Q q="Am I sleeping enough?" a={<>Average <b>{fmtDur(sl.avg)}</b> · {sl.good} of {sl.nights} logged nights hit {s.sleepTarget}h · bedtime spread ±{Math.round(sl.spread)}m</>}>
          <Bars data={B.map((b, i) => ({ label: b.label, value: sleepVals[i], color: span <= 30 ? (sleepVals[i] === 0 ? undefined : sleepVals[i] * 60 >= s.sleepTarget * 60 ? 'var(--good)' : 'var(--bad)') : SLEEP_COLOR, tip: <><b>{fmtDur(sleepVals[i] * 60)}</b> <span className="muted">{b.label} avg</span></> }))}
            target={{ value: s.sleepTarget, label: `${s.sleepTarget}h` }} fmt={n => `${Math.round(n)}h`} color={SLEEP_COLOR} />
          {span <= 30 && <div className="legend mt8"><span><i className="swatch" style={{ background: 'var(--good)' }} />met target</span><span><i className="swatch" style={{ background: 'var(--bad)' }} />short</span></div>}
        </Q>
        <Q q="Am I studying consistently?" a={<><b>{fmtDur(studyVals.reduce((a, b) => a + b, 0) * 60)}</b> total · {fmtDur((studyVals.reduce((a, b) => a + b, 0) * 60) / Math.max(1, span / 7))} per week on average (target {s.weekly.studyHours}h)</>}>
          <Bars data={B.map((b, i) => ({ label: b.label, value: studyVals[i] }))} color={AREAS.academics.color} fmt={n => `${+n.toFixed(1)}h`}
            target={span > 30 && span <= 90 ? { value: s.weekly.studyHours, label: 'weekly target' } : undefined} />
        </Q>
        <Q q="How often do I train?" a={<><b>{trainVals.reduce((a, b) => a + b, 0)}</b> sessions · {(trainVals.reduce((a, b) => a + b, 0) / Math.max(1, span / 7)).toFixed(1)} per week (target {s.weekly.workouts})</>}>
          <Bars data={B.map((b, i) => ({ label: b.label, value: trainVals[i] }))} color={AREAS.fitness.color} target={span > 30 && span <= 90 ? { value: s.weekly.workouts, label: 'target' } : undefined} />
        </Q>
        <Q q="How far am I running?" a={<><b>{runVals.reduce((a, b) => a + b, 0).toFixed(1)} km</b> in this range</>}>
          <Lines labels={B.map(b => b.label)} series={[{ name: 'Cumulative km', color: AREAS.fitness.color, values: runVals.map((_, i) => runVals.slice(0, i + 1).reduce((a, b) => a + b, 0)) }]} fmt={n => `${Math.round(n)}`} />
        </Q>
        <Q q="Are my habits sticking?" a={<>Average completion <b>{Math.round(habitVals.reduce((a, b) => a + b, 0) / Math.max(1, habitVals.length))}%</b> across {hs.length} habits</>}>
          <Lines labels={B.map(b => b.label)} series={[{ name: 'Completion', color: '#e8a04a', values: habitVals }]} max={100} fmt={n => `${Math.round(n)}%`} />
        </Q>
        <Q q="Where is my money going?" a={<><b>{money(totalSpend, s.currency)}</b> spent · {money(totalSpend / (span || 1), s.currency)}/day</>}>
          <Bars data={B.map((b, i) => ({ label: b.label, value: spendVals[i], tip: <><b>{money(spendVals[i], s.currency)}</b> <span className="muted">{b.label} · {money(spendVals[i] / perDay(b), s.currency)}/day</span></> }))} color={AREAS.finance.color} fmt={n => money(n, '')}
            target={span > 90 ? { value: s.monthlyBudget, label: 'budget' } : undefined} />
          <div className="hr" />
          <HBars data={[...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }))} fmt={n => money(n, s.currency)} color={AREAS.finance.color} />
        </Q>
        <Q q="Are my projects moving?" a={<>{openP.filter(p => { const l = projectLast(d, p); return l && l >= from; }).length} of {openP.length} active projects had progress in this range</>}>
          <HBars data={openP.map(p => ({ label: p.name, value: projectProgress(d, p), color: AREAS[p.type === 'hackathon' ? 'hackathons' : 'projects'].color }))} fmt={n => `${n}%`} max={100} />
        </Q>
        <Q q="Are my goals on track?" a={<>Bar = progress · tick = where you'd be on pace</>}>
          <div className="col gap-4">
            {goals.map(g => {
              const p = goalProgress(d, g), pace = goalPace(g, T);
              return (
                <div key={g.id} className="hbar">
                  <span className="ellipsis dim" title={g.title}>{g.title}</span>
                  <div className="track" style={{ position: 'relative' }}><i style={{ width: `${p}%`, background: pace !== undefined && p < pace - 15 ? 'var(--warn)' : 'var(--accent)' }} />{pace !== undefined && <span style={{ position: 'absolute', left: `${pace}%`, top: -3, width: 2, height: 14, background: 'var(--text-2)' }} />}</div>
                  <span className="num small">{p}%</span>
                </div>
              );
            })}
            {goals.length === 0 && <div className="small muted">No active goals.</div>}
          </div>
        </Q>
        <Q q="Is my mind getting attention?" a={<><b>{mindVals.reduce((a, b) => a + b, 0)} min</b> meditated · {d.journal.filter(j => j.date >= from).length} journal entries</>}>
          <Bars data={B.map((b, i) => ({ label: b.label, value: mindVals[i] }))} color={AREAS.personal.color} fmt={n => `${Math.round(n)}m`} />
        </Q>
        <Card>
          <div className="row"><BarChart3 size={16} className="muted" /><h3>Sleep vs next-day output</h3></div>
          <p className="small dim mt4">Days after ≥ {s.sleepTarget}h sleep vs days after short sleep (tasks completed + study minutes).</p>
          <SleepEffect d={d} from={from} T={T} />
        </Card>
      </div>
    </div>
  );
}

function SleepEffect({ d, from, T }: { d: DB; from: DateStr; T: DateStr }) {
  const target = d.settings.sleepTarget * 60;
  const good: DateStr[] = [], short: DateStr[] = [];
  for (const l of d.sleep) if (l.date >= from && l.date <= T) (sleepMin(l) >= target ? good : short).push(l.date);
  const score = (days: DateStr[]) => {
    if (!days.length) return { tasks: 0, study: 0 };
    const tasks = days.reduce((a, x) => a + d.tasks.filter(t => t.doneAt?.startsWith(x)).length, 0) / days.length;
    const study = days.reduce((a, x) => a + studyMin(d, x, x), 0) / days.length;
    return { tasks, study };
  };
  const g = score(good), s = score(short);
  return (
    <div className="g g2 mt12">
      <div className="sub-card"><div className="tiny muted">After good sleep ({good.length} days)</div><div className="bold">{g.tasks.toFixed(1)} tasks · {fmtDur(g.study)} study</div></div>
      <div className="sub-card"><div className="tiny muted">After short sleep ({short.length} days)</div><div className="bold">{s.tasks.toFixed(1)} tasks · {fmtDur(s.study)} study</div></div>
    </div>
  );
}
