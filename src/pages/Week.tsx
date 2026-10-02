import { ChevronLeft, ChevronRight, Dumbbell, Flame, GraduationCap, Moon, Plus, Rocket, Star, Wallet, TriangleAlert } from 'lucide-react';
import { mutate, useDB } from '../lib/store.ts';
import { addDays, fmtDur, isoWeek, niceDate, shortDate, today, weekDays, weekStart } from '../lib/dates.ts';
import { habitsWeekPct, isDone, sleepLeft, sleepStats, spendIn, studyMin, training, workoutsIn, runKm, fmtPace } from '../lib/derive.ts';
import { AREAS, SLEEP_COLOR } from '../lib/meta.ts';
import { TimeGrid, dayMarkers } from '../components/TimeGrid.tsx';
import { Btn, Card, CheckBox, IconBtn, Meter, money, nav, useMobile, useQuery } from '../components/ui.tsx';
import { blocksOn } from '../lib/derive.ts';
import { dow, dayNum, fmtTime } from '../lib/dates.ts';
import { kindColor } from '../lib/meta.ts';
import { toggleBlockDone } from '../lib/actions.ts';
import type { DateStr } from '../lib/types.ts';
import { openEditor } from '../components/editors.tsx';

export default function Week() {
  const d = useDB();
  const T = today();
  const q = useQuery();
  const mobile = useMobile();
  const ws = weekStart(q.get('w') ?? T);
  const we = addDays(ws, 6);
  const days = weekDays(ws);
  const s = d.settings;
  const go = (n: number) => nav(`/week?w=${addDays(ws, n * 7)}`);

  const top3 = d.weekTop3[ws] ?? [];
  const setTop = (i: number, v: string) => {
    const next = [...top3];
    next[i] = v;
    mutate(x => ({ weekTop3: { ...x.weekTop3, [ws]: next } }));
  };

  const dueAcad = d.tasks.filter(t => !t.parentId && (t.kind === 'assignment' || t.kind === 'lab') && t.due && t.due >= ws && t.due <= we);
  const exams = d.exams.filter(e => e.date >= ws && e.date <= we);
  const study = studyMin(d, ws, we);
  const wo = training(workoutsIn(d, ws, we));
  const sl = sleepStats(d, ws, we);
  const projDone = d.tasks.filter(t => t.projectId && t.doneAt && t.doneAt.slice(0, 10) >= ws && t.doneAt.slice(0, 10) <= we).length;
  const projUpd = d.projects.reduce((a, p) => a + p.updates.filter(u => u.date >= ws && u.date <= we).length, 0);
  const spent = spendIn(d, ws, we);
  const weekBudget = s.monthlyBudget / 4.35;
  const shortNights = days.filter(x => x >= T).map(x => ({ x, l: sleepLeft(d, x) })).filter(n => n.l.short);
  const runs = wo.filter(w => w.type === 'run');

  const stats = [
    { icon: GraduationCap, color: AREAS.academics.color, k: 'Academics', v: `${fmtDur(study)}`, sub: `/${s.weekly.studyHours}h study · ${dueAcad.filter(t => !isDone(t)).length} due · ${exams.length} exam${exams.length === 1 ? '' : 's'}`, pct: (study / 60 / s.weekly.studyHours) * 100, to: '/academics' },
    { icon: Dumbbell, color: AREAS.fitness.color, k: 'Fitness', v: `${wo.length}/${s.weekly.workouts}`, sub: `${fmtDur(wo.reduce((a, w) => a + w.min, 0))}${runs.length ? ` · ${runKm(runs).toFixed(1)}km @ ${fmtPace(runs.reduce((a, w) => a + w.min, 0) / Math.max(0.1, runKm(runs)))}` : ''}`, pct: (wo.length / s.weekly.workouts) * 100, to: '/fitness' },
    { icon: Moon, color: SLEEP_COLOR, k: 'Sleep', v: sl.nights ? fmtDur(sl.avg) : '—', sub: `${sl.good}/${sl.nights} nights ≥ ${s.sleepTarget}h`, pct: sl.nights ? (sl.good / sl.nights) * 100 : 0, to: '/sleep' },
    { icon: Rocket, color: AREAS.projects.color, k: 'Projects', v: `${projDone + projUpd}`, sub: `${projDone} tasks done · ${projUpd} updates`, pct: Math.min(100, (projDone + projUpd) * 12), to: '/projects' },
    { icon: Flame, color: '#e8a04a', k: 'Habits', v: `${habitsWeekPct(d, ws)}%`, sub: 'weekly completion', pct: habitsWeekPct(d, ws), to: '/habits' },
    { icon: Wallet, color: AREAS.finance.color, k: 'Money', v: money(spent, s.currency), sub: `of ~${money(weekBudget, s.currency)} weekly budget`, pct: (spent / weekBudget) * 100, to: '/finance' },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Plan · week {isoWeek(ws)}</div>
          <h1>{shortDate(ws)} – {shortDate(we)}</h1>
        </div>
        <div className="row">
          <IconBtn icon={ChevronLeft} label="Previous week" onClick={() => go(-1)} />
          <Btn size="sm" onClick={() => nav('/week')}>This week</Btn>
          <IconBtn icon={ChevronRight} label="Next week" onClick={() => go(1)} />
          <Btn variant="primary" icon={Plus} onClick={() => openEditor('block', { defaults: { date: ws <= T && T <= we ? T : ws } })}>Block</Btn>
        </div>
      </div>

      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 300px) minmax(0, 1fr)', marginBottom: 'var(--gap)' }}>
        <Card title="This week's top 3" icon={Star}>
          <div className="col">
            {[0, 1, 2].map(i => (
              <div key={i} className="row">
                <span className="num bold accent" style={{ width: 14 }}>{i + 1}</span>
                <input className="input" value={top3[i] ?? ''} placeholder={['Most important outcome', 'Second', 'Third'][i]} onChange={e => setTop(i, e.target.value)} />
              </div>
            ))}
          </div>
        </Card>
        <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {stats.map(st => (
            <button key={st.k} className="card hover" style={{ textAlign: 'left', padding: '11px 13px' }} onClick={() => nav(st.to)}>
              <div className="row"><st.icon size={14} style={{ color: st.color }} /><span className="label">{st.k}</span></div>
              <div className="row between mt4" style={{ alignItems: 'baseline' }}><span className="bold" style={{ fontSize: 20 }}>{st.v}</span></div>
              <div className="tiny muted ellipsis">{st.sub}</div>
              <div className="mt8"><Meter value={st.pct} color={st.color} /></div>
            </button>
          ))}
        </div>
      </div>

      {shortNights.length > 0 && (
        <div className="col" style={{ marginBottom: 'var(--gap)' }}>
          {shortNights.map(({ x, l }) => (
            <div key={x} className="warn-item bad"><TriangleAlert />
              <span><b>{niceDate(x)}:</b> your plan leaves only <b>{fmtDur(l.min)}</b> for sleep{l.culprit ? ` because of “${l.culprit}”` : ''}. Target is {s.sleepTarget}h — move the block, not your sleep.</span>
            </div>
          ))}
        </div>
      )}

      {mobile ? <WeekAgenda days={days} /> : <TimeGrid days={days} />}
      <p className="tiny muted mt8 hide-m">Drag on empty space to create · drag blocks to move (even across days) · drag the bottom edge to resize · hatched bands are protected sleep. Moving one occurrence of a repeating block only moves that day.</p>
    </div>
  );
}

/** Phone layout: one card per day, blocks and deadlines as a tappable list. */
export function WeekAgenda({ days }: { days: DateStr[] }) {
  const d = useDB();
  const T = today();
  return (
    <div className="col gap-12">
      {days.map(x => {
        const insts = blocksOn(d, x).filter(i => i.block.kind !== 'sleep');
        const marks = dayMarkers(d, x);
        const left = sleepLeft(d, x);
        return (
          <Card key={x} style={x === T ? { borderColor: 'var(--accent-line)' } : undefined}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div className="row"><span className="bold" style={{ fontSize: 18, color: x === T ? 'var(--accent)' : undefined }}>{dayNum(x)}</span><span className="label">{dow(x)}</span></div>
              <div className="row">
                {left.short && <span className="pill bad"><Moon />{fmtDur(left.min)} sleep</span>}
                <button className="icon-btn sm" aria-label="Add block" onClick={() => openEditor('block', { defaults: { date: x } })}><Plus /></button>
              </div>
            </div>
            {marks.map(m => <div key={m.key} className="tg-chip mt4" style={{ borderColor: m.color }} onClick={m.open}>{m.label}</div>)}
            {insts.length === 0 && marks.length === 0 && <div className="small muted">Free day</div>}
            {insts.map(i => (
              <div key={i.key} className="sched-item" style={{ ['--c' as string]: d.courses.find(c => c.id === i.block.courseId)?.color ?? kindColor(i.block.kind) }}>
                <span className="t">{fmtTime(i.start)}</span><span className="bar" />
                <button className="body" style={{ textAlign: 'left' }} onClick={() => openEditor('block', { id: i.block.id, instDate: x })}>
                  <div className={`ttl bold ellipsis ${i.done ? 'strike' : ''}`}>{i.block.title}</div>
                  <div className="tiny muted">{fmtTime(i.start)}–{fmtTime(i.end)}{i.block.location ? ` · ${i.block.location}` : ''}</div>
                </button>
                <CheckBox on={i.done} onChange={() => toggleBlockDone(i)} label="Done" round />
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}
