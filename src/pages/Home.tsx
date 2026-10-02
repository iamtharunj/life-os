import { useMemo } from 'react';
import { Check, Dumbbell, Flame, Gift, GraduationCap, Leaf, Moon, Plus, Rocket, Scroll, Shield, Sparkles, Swords, Target, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDB } from '../lib/store.ts';
import { addDays, daysInMonth, dayNum, fmtDur, range, today, weekStart, weekday } from '../lib/dates.ts';
import {
  activeHabits, buddyLines, goalPace, goalProgress, habitRate, levelTitle, mindStats, missions, monthFinance, projectProgress, sleepStats, studyMin, training,
  workoutsIn, xpLedger, xpTotals, runKm,
} from '../lib/derive.ts';
import { AREAS, OPEN_STATUSES, SLEEP_COLOR } from '../lib/meta.ts';
import { claimMission, claimReward } from '../lib/actions.ts';
import { Buddy, PixelScene } from '../components/pixel.tsx';
import { Btn, Card, Meter, Pill, money, nav, tilt } from '../components/ui.tsx';
import { Spark } from '../components/charts.tsx';
import { openEditor } from '../components/editors.tsx';
import { IconOf } from '../components/icons.tsx';

interface AreaSummary { key: string; label: string; icon: LucideIcon; color: string; value: string; sub: string; trend: number[]; status: 'good' | 'warn' | 'bad'; note: string; to: string }

export default function HomePage() {
  const d = useDB();
  const T = today();
  const xp = xpTotals(d);
  const ws = weekStart(T);
  const areas = useMemo(() => lifeAreas(d, T), [d, T]);
  const ms = missions(d, ws);
  const ledger = xpLedger(d).filter(e => e.xp > 0).slice(0, 8);
  const yearPct = Math.round(((Number(new Date()) - Number(new Date(new Date().getFullYear(), 0, 1))) / (365 * 864e5)) * 100);
  const monthPct = Math.round((dayNum(T) / daysInMonth(T)) * 100);
  const weekPct = Math.round((((weekday(T) + 6) % 7 + 1) / 7) * 100);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life overview</div><h1>Where things stand</h1><div className="sub">Trends across your life — no single score, just honest signals.</div></div>
      </div>

      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="g">
          <Card title="Status window" icon={Shield} className="pad0" style={{ overflow: 'hidden' }}>
            <div style={{ position: 'relative', height: 120, margin: '-10px 0 0' }}>
              {d.settings.banner && <PixelScene seed={3} height={48} animate={d.settings.motion} />}
              <div style={{ position: 'absolute', left: 16, bottom: -18 }}><Buddy level={xp.level} size={72} accent={d.settings.accent} lines={buddyLines(d)} /></div>
            </div>
            <div style={{ padding: '26px 16px 16px' }}>
              <div className="row between">
                <div><div className="lvl" style={{ fontSize: 13 }}>LEVEL {xp.level}</div><div className="bold" style={{ fontSize: 17 }}>{levelTitle(xp.level)} {d.settings.name}</div></div>
                <div style={{ textAlign: 'right' }}><div className="num bold">{xp.total.toLocaleString()}</div><div className="tiny muted">total XP</div></div>
              </div>
              <div className="mt12"><Meter value={(xp.into / xp.need) * 100} pixel /></div>
              <div className="row between tiny muted mt4"><span>{xp.into} / {xp.need} to level {xp.level + 1}</span><span>+{xp.today} today</span></div>
              <div className="g mt12" style={{ gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="sub-card"><div className="tiny muted">This week</div><div className="num bold">+{xp.week}</div></div>
                <div className="sub-card"><div className="tiny muted">To spend</div><div className="num bold accent">{xp.available}</div></div>
                <div className="sub-card"><div className="tiny muted">Spent</div><div className="num bold">{xp.spent}</div></div>
              </div>
            </div>
          </Card>
          <Card title="Time" icon={Sparkles}>
            <div className="year-bars">
              {[['Year', yearPct], ['Month', monthPct], ['Week', weekPct]].map(([k, v]) => (
                <div key={k} className="year-bar"><div className="pbox"><i style={{ width: `${v}%` }} /></div><span className="num">{k}: {v}%</span></div>
              ))}
            </div>
          </Card>
        </div>

        <div className="g">
          <div className="g" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
            {areas.map(a => (
              <button key={a.key} className="card hover area-card tilt" style={{ textAlign: 'left', ['--c' as string]: a.color }} onClick={() => nav(a.to)} {...tilt}>
                <div className="area-top">
                  <div className="area-ic"><a.icon /></div>
                  <div className="grow"><div className="label" style={{ color: 'var(--text-2)' }}>{a.label}</div><div className="tiny muted">{a.sub}</div></div>
                  <Pill tone={a.status}>{a.status === 'good' ? 'on track' : a.status === 'warn' ? 'watch' : 'needs care'}</Pill>
                </div>
                <div className="row between" style={{ alignItems: 'flex-end' }}>
                  <div className="stat"><div className="v">{a.value}</div></div>
                  <Spark values={a.trend} color={a.color} width={100} height={30} />
                </div>
                <div className="small dim">{a.note}</div>
              </button>
            ))}
          </div>

          <div className="g g2">
            <Card title="Weekly missions" icon={Swords} actions={<span className="tiny muted">resets Monday</span>}>
              <div className="col">
                {ms.map(m => {
                  const done = m.value >= m.target;
                  return (
                    <div key={m.key} className="row">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row between"><span className="bold small">{m.title}</span><span className="tiny muted num">{m.value}/{m.target} {m.unit}</span></div>
                        <div className="tiny muted">{m.desc}</div>
                        <div className="mt4"><Meter value={(m.value / m.target) * 100} color={done ? 'var(--good)' : undefined} /></div>
                      </div>
                      {m.claimed ? <Pill tone="good"><Check />+{m.xp}</Pill>
                        : <Btn size="sm" variant={done ? 'primary' : undefined} disabled={!done} onClick={() => claimMission(m.key, m.xp)}>+{m.xp}</Btn>}
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Rewards" icon={Gift} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openEditor('reward')}>Reward</Btn>}>
              <div className="col">
                {d.rewards.map(r => {
                  const can = xp.available >= r.cost;
                  return (
                    <div key={r.id} className={`row reward ${can ? 'can' : ''}`}>
                      <div className="area-ic" style={{ ['--c' as string]: can ? d.settings.accent : '#5b6356', width: 32, height: 32 }}><IconOf name={r.icon} /></div>
                      <button className="grow" style={{ textAlign: 'left' }} onClick={() => openEditor('reward', { id: r.id })}>
                        <div className="small bold">{r.name}</div>
                        <div className="tiny muted">{r.cost} XP{r.claims.length ? ` · claimed ${r.claims.length}×` : ''}</div>
                      </button>
                      <Btn size="sm" variant={can ? 'primary' : undefined} disabled={!can} onClick={() => claimReward(r.id, xp.available)}>{can ? 'Claim' : `${r.cost - xp.available} to go`}</Btn>
                    </div>
                  );
                })}
                {d.rewards.length === 0 && <div className="small muted">Add rewards you actually want. XP is only fun if it buys something.</div>}
              </div>
            </Card>
          </div>

          <Card title="Recent XP" icon={Scroll} actions={<span className="tiny muted">Values editable in Settings</span>}>
            <div className="list">
              {ledger.map((e, i) => (
                <div key={i} className="li"><span className="lvl" style={{ width: 52 }}>+{e.xp}</span><span className="grow small ellipsis">{e.label}</span><span className="tiny muted">{e.date === T ? 'today' : e.date.slice(5)}</span></div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function lifeAreas(d: ReturnType<typeof useDB>, T: string): AreaSummary[] {
  const w0 = addDays(T, -6);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(T), -7 * (7 - i)));
  const s = d.settings;
  const sl = sleepStats(d, w0, T);
  const slTrend = range(addDays(T, -13), T).map(x => { const l = d.sleep.find(y => y.date === x); return l ? ((l.wake - l.bed + 1440) % 1440) / 60 : 0; });
  const wk = training(workoutsIn(d, w0, T));
  const study = studyMin(d, w0, T);
  const f = monthFinance(d, T, T);
  const hs = activeHabits(d);
  const habitPct = hs.length ? Math.round(hs.reduce((a, h) => a + habitRate(d, h, w0, T), 0) / hs.length) : 0;
  const openProj = d.projects.filter(p => OPEN_STATUSES.includes(p.status));
  const avgProj = openProj.length ? Math.round(openProj.reduce((a, p) => a + projectProgress(d, p), 0) / openProj.length) : 0;
  const mind = mindStats(d, w0, T);
  const tier = (v: number, good: number, ok: number): 'good' | 'warn' | 'bad' => (v >= good ? 'good' : v >= ok ? 'warn' : 'bad');
  return [
    { key: 'sleep', label: 'Sleep', icon: Moon, color: SLEEP_COLOR, value: fmtDur(sl.avg), sub: '7-day average', trend: slTrend, status: tier(sl.good, 5, 3), note: `${sl.good}/7 nights ≥ ${s.sleepTarget}h${sl.debt ? ` · ${fmtDur(sl.debt)} sleep debt` : ''}`, to: '/sleep' },
    { key: 'fitness', label: 'Fitness', icon: Dumbbell, color: AREAS.fitness.color, value: `${wk.length} sessions`, sub: 'last 7 days', trend: weeks.map(w => training(workoutsIn(d, w, addDays(w, 6))).length), status: tier(wk.length, s.weekly.workouts, Math.ceil(s.weekly.workouts / 2)), note: `${fmtDur(wk.reduce((a, w) => a + w.min, 0))} trained · ${runKm(wk).toFixed(1)} km run`, to: '/fitness' },
    { key: 'academics', label: 'Academics', icon: GraduationCap, color: AREAS.academics.color, value: fmtDur(study), sub: 'studied, last 7 days', trend: weeks.map(w => studyMin(d, w, addDays(w, 6)) / 60), status: tier(study / 60, s.weekly.studyHours, s.weekly.studyHours / 2), note: `${d.tasks.filter(t => (t.kind === 'assignment' || t.kind === 'lab') && t.status !== 'done').length} assignments pending · ${d.exams.filter(e => e.date >= T).length} exams ahead`, to: '/academics' },
    { key: 'projects', label: 'Projects', icon: Rocket, color: AREAS.projects.color, value: `${avgProj}%`, sub: `avg of ${openProj.length} active`, trend: weeks.map(w => d.projects.reduce((a, p) => a + p.updates.filter(u => u.date >= w && u.date <= addDays(w, 6)).length, 0)), status: tier(openProj.filter(p => p.updates.some(u => u.date >= w0)).length, Math.min(2, openProj.length), 1), note: `${openProj.filter(p => p.updates.some(u => u.date >= w0)).length} moved forward this week`, to: '/projects' },
    { key: 'finance', label: 'Finance', icon: Wallet, color: AREAS.finance.color, value: money(f.remaining, s.currency), sub: 'left this month', trend: range(f.from, T).map(x => d.txns.filter(t => t.type === 'expense' && t.date === x).reduce((a, t) => a + t.amount, 0)), status: f.usedPct <= f.pacePct + 5 ? 'good' : f.usedPct <= 100 ? 'warn' : 'bad', note: `${Math.round(f.usedPct)}% of budget used · ${Math.round(f.pacePct)}% of month gone`, to: '/finance' },
    { key: 'habits', label: 'Habits', icon: Flame, color: '#e8a04a', value: `${habitPct}%`, sub: 'weekly completion', trend: weeks.map(w => hs.length ? hs.reduce((a, h) => a + habitRate(d, h, w, addDays(w, 6)), 0) / hs.length : 0), status: tier(habitPct, 80, 55), note: `${hs.length} habits tracked`, to: '/habits' },
    (() => {
      const gs = d.goals.filter(g => g.status === 'active' && g.level !== 'vision');
      const onPace = gs.filter(g => { const p = goalPace(g, T); return p === undefined || goalProgress(d, g) >= p - 15; }).length;
      return { key: 'goals', label: 'Goals', icon: Target, color: '#3fb7c9', value: `${onPace}/${gs.length}`, sub: 'on pace', trend: weeks.map(w => d.tasks.filter(t => t.goalId && t.doneAt && t.doneAt.slice(0, 10) >= w && t.doneAt.slice(0, 10) <= addDays(w, 6)).length), status: tier(gs.length ? onPace / gs.length : 1, 0.8, 0.5), note: `${gs.length - onPace} behind their timeline`, to: '/goals' } as AreaSummary;
    })(),
    { key: 'mind', label: 'Mind', icon: Leaf, color: AREAS.personal.color, value: `${mind.minutes} min`, sub: 'meditated, last 7 days', trend: weeks.map(w => mindStats(d, w, addDays(w, 6)).minutes), status: tier(mind.minutes, s.weekly.mindfulMin, s.weekly.mindfulMin / 3), note: `${mind.journalDays} journal days${mind.avgMood ? ` · mood ${mind.avgMood.toFixed(1)}/5` : ''}`, to: '/mind' },
  ];
}
