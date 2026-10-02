import { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, Flame, Leaf, Moon, Rocket, Save, Utensils, Wallet, CalendarDays } from 'lucide-react';
import type { DB, Review } from '../lib/types.ts';
import { add, mutate, update, useDB } from '../lib/store.ts';
import { addDays, addMonths, fmtDur, monthEnd, monthName, monthStart, niceDate, shortDate, today, weekStart, isoWeek } from '../lib/dates.ts';
import {
  activeHabits, dietStats, goalProgress, habitRate, habitStreak, isDone, mindStats, monthFinance, projectProgress, runKm, sleepStats, spendIn,
  studyMin, training, workoutsIn,
} from '../lib/derive.ts';
import { OPEN_STATUSES } from '../lib/meta.ts';
import { Btn, Card, IconBtn, Seg, Stat, money, usePref, moodFace } from '../components/ui.tsx';
import { upcomingItems, UpcomingList } from '../components/rows.tsx';

const WEEK_Q: [string, string][] = [
  ['well', 'What went well?'], ['poorly', 'What went poorly?'], ['accomplished', 'What did I accomplish?'], ['avoided', 'What did I avoid?'],
  ['attention', 'What needs attention?'], ['stop', 'What should I stop doing?'],
];
const MONTH_Q: [string, string][] = [
  ['wins', 'Major wins'], ['problems', 'Problems'], ['lessons', 'Lessons'], ['accomplishments', 'Accomplishments'], ['unfinished', 'Unfinished work'], ['next', "Next month's priorities"],
];

export default function Reviews() {
  const [kind, setKind] = usePref<'week' | 'month' | 'history'>('rev.kind', 'week');
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Reflect</div><h1>Reviews</h1><div className="sub">Look back honestly, then set direction. Data first, then words.</div></div>
        <Seg value={kind} onChange={setKind} options={[{ k: 'week', label: 'Weekly' }, { k: 'month', label: 'Monthly' }, { k: 'history', label: 'History' }]} />
      </div>
      {kind === 'week' && <WeekReview />}
      {kind === 'month' && <MonthReview />}
      {kind === 'history' && <History />}
    </div>
  );
}

function useReview(d: DB, kindK: Review['kind'], period: string) {
  const existing = d.reviews.find(r => r.kind === kindK && r.period === period);
  const [a, setA] = useState<Record<string, string>>(existing?.answers ?? {});
  useEffect(() => setA(existing?.answers ?? {}), [period]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (extra?: () => void) => {
    if (existing) update('reviews', existing.id, { answers: a, updatedAt: new Date().toISOString() });
    else add('reviews', { kind: kindK, period, answers: a });
    extra?.();
  };
  return { existing, a, setA, save };
}

function WeekReview() {
  const d = useDB();
  const T = today();
  // On Sunday (or later in the week) review the current week; early in the week default to last week.
  const defaultWs = new Date().getDay() === 0 || new Date().getDay() >= 5 ? weekStart(T) : addDays(weekStart(T), -7);
  const [ws, setWs] = useState(defaultWs);
  const we = addDays(ws, 6);
  const to = we < T ? we : T;
  const next = addDays(ws, 7);
  const { existing, a, setA, save } = useReview(d, 'week', ws);
  const [done, setDone] = useState(false);

  const s = d.settings;
  const sl = sleepStats(d, ws, to);
  const wo = workoutsIn(d, ws, to);
  const diet = dietStats(d, ws, to);
  const f = { spent: spendIn(d, ws, to), m: monthFinance(d, to, T) };
  const cats = new Map<string, number>();
  for (const t of d.txns) if (t.type === 'expense' && t.date >= ws && t.date <= to) cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const assignDone = d.tasks.filter(t => (t.kind === 'assignment' || t.kind === 'lab') && t.doneAt && t.doneAt.slice(0, 10) >= ws && t.doneAt.slice(0, 10) <= to).length;
  const projTasks = d.tasks.filter(t => t.projectId && t.doneAt && t.doneAt.slice(0, 10) >= ws && t.doneAt.slice(0, 10) <= to).length;
  const hs = activeHabits(d);
  const mind = mindStats(d, ws, to);
  const top = d.weekTop3[next] ?? [a.top1 ?? '', a.top2 ?? '', a.top3 ?? ''];

  const commit = () => save(() => {
    mutate(x => ({ weekTop3: { ...x.weekTop3, [next]: [a.top1 ?? top[0] ?? '', a.top2 ?? top[1] ?? '', a.top3 ?? top[2] ?? ''] } }));
    setDone(true);
  });

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <IconBtn icon={ChevronLeft} label="Previous week" onClick={() => setWs(addDays(ws, -7))} />
        <h2>Week {isoWeek(ws)} · {shortDate(ws)} – {shortDate(we)}</h2>
        <IconBtn icon={ChevronRight} label="Next week" disabled={ws >= weekStart(T)} onClick={() => setWs(addDays(ws, 7))} />
        {existing && <span className="pill good"><Check />Reviewed</span>}
      </div>
      <div className="g g4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}>
        <Card title="Academics" icon={BookOpen}>
          <Stat k="Study hours" v={fmtDur(studyMin(d, ws, to))} unit={`/ ${s.weekly.studyHours}h`} />
          <div className="small dim mt8">{assignDone} assignments/labs completed</div>
          <div className="mt8"><UpcomingList items={upcomingItems(d, 10, next).filter(u => u.sub.includes('Exam') || /^[A-Z]{4}/.test(u.sub)).slice(0, 3)} limit={3} /></div>
        </Card>
        <Card title="Fitness" icon={Dumbbell}>
          <Stat k="Workouts" v={training(wo).length} unit={`/ ${s.weekly.workouts}`} />
          <div className="small dim mt8">
            Gym {wo.filter(w => w.type === 'gym').length} · Running {wo.filter(w => w.type === 'run').length} ({runKm(wo).toFixed(1)} km) · Basketball {wo.filter(w => w.type === 'basketball').length}
            <br />Active time {fmtDur(training(wo).reduce((x, w) => x + w.min, 0))}
          </div>
        </Card>
        <Card title="Sleep" icon={Moon}>
          <Stat k="Average" v={fmtDur(sl.avg)} d={`${sl.good}/${sl.nights} nights ≥ ${s.sleepTarget}h`} tone={sl.good >= 5 ? 'good' : 'warn'} />
          <div className="small dim mt8">Consistency ±{Math.round(sl.spread)} min bedtime spread</div>
        </Card>
        <Card title="Diet" icon={Utensils}>
          <Stat k="Avg protein" v={`${Math.round(diet.avgProtein)} g`} d={`${diet.meals} meals logged · ${diet.consistency}% consistency`} />
          <div className="small dim mt8">Water avg {diet.avgWater.toFixed(1)} glasses</div>
        </Card>
        <Card title="Finance" icon={Wallet}>
          <Stat k="Spent this week" v={money(f.spent, s.currency)} d={`${money(f.m.remaining, s.currency)} of monthly budget left`} tone={f.m.remaining < 0 ? 'bad' : undefined} />
          <div className="small dim mt8">{[...cats.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c, v]) => `${c} ${money(v, s.currency)}`).join(' · ')}</div>
        </Card>
        <Card title="Projects" icon={Rocket}>
          <Stat k="Progress" v={`${projTasks} tasks`} d={`${d.projects.reduce((x, p) => x + p.updates.filter(u => u.date >= ws && u.date <= to).length, 0)} progress updates`} />
          <div className="small dim mt8">{d.projects.filter(p => OPEN_STATUSES.includes(p.status)).map(p => `${p.name.split(' ')[0]} ${projectProgress(d, p)}%`).join(' · ')}</div>
        </Card>
        <Card title="Habits" icon={Flame}>
          <Stat k="Completion" v={`${hs.length ? Math.round(hs.reduce((x, h) => x + habitRate(d, h, ws, to), 0) / hs.length) : 0}%`} />
          <div className="small dim mt8">{hs.map(h => ({ h, s: habitStreak(d, h, to) })).filter(x => x.s.cur > 1).slice(0, 3).map(x => `${x.h.name} 🔥${x.s.cur}`).join(' · ') || 'No streaks yet'}</div>
        </Card>
        <Card title="Mind" icon={Leaf}>
          <Stat k="Meditation" v={`${mind.minutes} min`} d={`${mind.journalDays} journal days${mind.avgMood ? ` · mood ${moodFace(mind.avgMood)} ${mind.avgMood.toFixed(1)}` : ''}`} />
        </Card>
      </div>

      <Card title="Reflection" icon={ClipboardCheck} className="mt16">
        <div className="form-grid">
          {WEEK_Q.map(([k, q], i) => (
            <label key={k} className="field"><span>{i + 1}. {q}</span><textarea className="textarea" rows={2} value={a[k] ?? ''} onChange={e => setA({ ...a, [k]: e.target.value })} /></label>
          ))}
          <div className="field full"><span>7. Top 3 priorities for next week ({shortDate(next)} – {shortDate(addDays(next, 6))})</span>
            <div className="g g3">{[1, 2, 3].map(i => <input key={i} className="input" placeholder={`#${i}`} value={a[`top${i}`] ?? top[i - 1] ?? ''} onChange={e => setA({ ...a, [`top${i}`]: e.target.value })} />)}</div>
          </div>
        </div>
        <div className="row end mt16">
          {done && <span className="small good">Saved — next week's Top 3 is set on the Week page.</span>}
          <Btn variant="primary" icon={Save} onClick={commit}>{existing ? 'Update review' : `Complete review · +${s.xp.weekReview} XP`}</Btn>
        </div>
      </Card>
    </>
  );
}

function MonthReview() {
  const d = useDB();
  const T = today();
  const [m, setM] = useState(new Date().getDate() <= 5 ? addMonths(monthStart(T), -1) : monthStart(T));
  const prev = addMonths(m, -1);
  const to = monthEnd(m) < T ? monthEnd(m) : T;
  const { existing, a, setA, save } = useReview(d, 'month', m.slice(0, 7));
  const [saved, setSaved] = useState(false);
  const s = d.settings;
  const row = (label: string, cur: string, before: string, better?: boolean) => (
    <div className="li"><span className="grow small">{label}</span><span className="num small muted" style={{ width: 110, textAlign: 'right' }}>{before}</span><span className={`num small bold ${better === undefined ? '' : better ? 'good' : 'warn'}`} style={{ width: 110, textAlign: 'right' }}>{cur}</span></div>
  );
  const sl = [sleepStats(d, m, to), sleepStats(d, prev, monthEnd(prev))];
  const wo = [training(workoutsIn(d, m, to)).length, training(workoutsIn(d, prev, monthEnd(prev))).length];
  const st = [studyMin(d, m, to), studyMin(d, prev, monthEnd(prev))];
  const sp = [monthFinance(d, m, T).spent, monthFinance(d, prev, T).spent];
  const hs = activeHabits(d);
  const hp = [m, prev].map(x => (hs.length ? Math.round(hs.reduce((acc, h) => acc + habitRate(d, h, x, x === m ? to : monthEnd(prev)), 0) / hs.length) : 0));
  const tasks = [m, prev].map(x => d.tasks.filter(t => isDone(t) && t.doneAt && t.doneAt.slice(0, 7) === x.slice(0, 7)).length);
  const mind = [mindStats(d, m, to).minutes, mindStats(d, prev, monthEnd(prev)).minutes];

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <IconBtn icon={ChevronLeft} label="Previous month" onClick={() => setM(addMonths(m, -1))} />
        <h2>{monthName(m, true)} {m.slice(0, 4)}</h2>
        <IconBtn icon={ChevronRight} label="Next month" disabled={m >= monthStart(T)} onClick={() => setM(addMonths(m, 1))} />
        {existing && <span className="pill good"><Check />Reviewed</span>}
      </div>
      <div className="g g2" style={{ alignItems: 'start' }}>
        <Card title="Trends vs last month" icon={CalendarDays}>
          <div className="li" style={{ borderTop: 0 }}><span className="grow tiny muted">Metric</span><span className="tiny muted" style={{ width: 110, textAlign: 'right' }}>{monthName(prev)}</span><span className="tiny muted" style={{ width: 110, textAlign: 'right' }}>{monthName(m)}</span></div>
          {row('Avg sleep', fmtDur(sl[0].avg), fmtDur(sl[1].avg), sl[0].avg >= sl[1].avg)}
          {row(`Nights ≥ ${s.sleepTarget}h`, `${sl[0].good}`, `${sl[1].good}`, sl[0].good >= sl[1].good)}
          {row('Workouts', `${wo[0]}`, `${wo[1]}`, wo[0] >= wo[1])}
          {row('Study', fmtDur(st[0]), fmtDur(st[1]), st[0] >= st[1])}
          {row('Tasks completed', `${tasks[0]}`, `${tasks[1]}`, tasks[0] >= tasks[1])}
          {row('Habit completion', `${hp[0]}%`, `${hp[1]}%`, hp[0] >= hp[1])}
          {row('Meditation', `${mind[0]} min`, `${mind[1]} min`, mind[0] >= mind[1])}
          {row('Spending', money(sp[0], s.currency), money(sp[1], s.currency), sp[0] <= sp[1])}
          <div className="hr" />
          <div className="label" style={{ marginBottom: 6 }}>Goals</div>
          {d.goals.filter(g => g.status === 'active' && g.level !== 'vision').slice(0, 6).map(g => <div key={g.id} className="li"><span className="grow small ellipsis">{g.title}</span><span className="num small">{goalProgress(d, g)}%</span></div>)}
        </Card>
        <Card title="Reflection" icon={ClipboardCheck}>
          <div className="col">
            {MONTH_Q.map(([k, q]) => <label key={k} className="field"><span>{q}</span><textarea className="textarea" rows={2} value={a[k] ?? ''} onChange={e => setA({ ...a, [k]: e.target.value })} /></label>)}
          </div>
          <div className="row end mt12">
            {saved && <span className="small good">Saved.</span>}
            <Btn variant="primary" icon={Save} onClick={() => save(() => setSaved(true))}>{existing ? 'Update' : `Complete · +${s.xp.monthReview} XP`}</Btn>
          </div>
        </Card>
      </div>
    </>
  );
}

function History() {
  const d = useDB();
  const rs = [...d.reviews].sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
  if (!rs.length) return <Card><div className="small muted">No reviews yet. Your first weekly review takes 10 minutes and pays off all week.</div></Card>;
  return (
    <div className="g">
      {rs.map(r => (
        <Card key={r.id} title={`${r.kind === 'day' ? 'Day' : r.kind === 'week' ? 'Week of' : 'Month'} · ${r.kind === 'month' ? r.period : niceDate(r.period)}`}>
          {r.rating && <div className="small">{moodFace(r.rating)}</div>}
          <div className="g g2" style={{ gap: 8 }}>
            {Object.entries(r.answers).filter(([, v]) => v?.trim()).map(([k, v]) => <div key={k} className="small"><span className="muted">{k}: </span>{v}</div>)}
          </div>
        </Card>
      ))}
    </div>
  );
}
