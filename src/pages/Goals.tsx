import { ChevronRight, Compass, Flag, Plus, Star, Target } from 'lucide-react';
import type { DB, Goal } from '../lib/types.ts';
import { useDB } from '../lib/store.ts';
import { diffDays, niceDate, today, weekStart } from '../lib/dates.ts';
import { goalPace, goalProgress, goalValue, habitRate, isDone, projectProgress } from '../lib/derive.ts';
import { GOAL_LEVELS, GOAL_METRICS } from '../lib/meta.ts';
import { Btn, Card, Empty, Meter, Pill, nav } from '../components/ui.tsx';
import { openEditor } from '../components/editors.tsx';
import { addDays } from '../lib/dates.ts';

const ORDER: Goal['level'][] = ['vision', 'year', 'quarter', 'month', 'week'];

export default function Goals() {
  const d = useDB();
  const T = today();
  const roots = d.goals.filter(g => !g.parentId || !d.goals.some(p => p.id === g.parentId)).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const active = d.goals.filter(g => g.status === 'active');
  const behind = active.filter(g => { const p = goalPace(g, T); return p !== undefined && goalProgress(d, g) < p - 15; });
  const top3 = (d.days[T]?.top3 ?? []).map(id => d.tasks.find(t => t.id === id)).filter(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Direction</div><h1>Goals</h1><div className="sub">Vision → Year → Quarter → Month → Week → Today. Progress comes from what you actually do.</div></div>
        <Btn variant="primary" icon={Plus} onClick={() => openEditor('goal')}>Goal</Btn>
      </div>
      {behind.length > 0 && (
        <div className="col" style={{ marginBottom: 'var(--gap)' }}>
          {behind.map(g => <div key={g.id} className="warn-item warn"><Flag /><span><b>{g.title}</b> is at {goalProgress(d, g)}% but {goalPace(g, T)}% of its time has passed.{g.nextAction ? ` Next: ${g.nextAction}` : ''}</span></div>)}
        </div>
      )}
      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="g">
          {roots.length === 0 && <Empty icon={Compass} title="No goals yet" hint="Start with a vision, then break it down." action={<Btn icon={Plus} onClick={() => openEditor('goal', { defaults: { level: 'vision' } })}>Vision</Btn>} />}
          {roots.map(g => <GoalNode key={g.id} g={g} d={d} depth={0} />)}
        </div>
        <div className="g">
          <Card title="This week" icon={Star}>
            {(d.weekTop3[weekStart(T)] ?? []).filter(Boolean).length === 0 ? <div className="small muted">Set this week's top 3 in the <a className="accent" href="#/week">Week planner</a>.</div> :
              <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{(d.weekTop3[weekStart(T)] ?? []).filter(Boolean).map((t, i) => <li key={i} style={{ padding: '3px 0' }}>{t}</li>)}</ol>}
          </Card>
          <Card title="Today" icon={Target}>
            {top3.length === 0 ? <div className="small muted">Pick today's Top 3 on the <a className="accent" href="#/today">Today</a> page.</div> :
              top3.map(t => <div key={t!.id} className={`li ${isDone(t!) ? 'done' : ''}`}><span className="title grow">{t!.title}</span>{t!.goalId && <span className="pill accent ellipsis" style={{ maxWidth: 150, display: 'inline-block', lineHeight: '20px' }} title={d.goals.find(g => g.id === t!.goalId)?.title}>↑ {d.goals.find(g => g.id === t!.goalId)?.title}</span>}</div>)}
          </Card>
          <Card title="How progress works">
            <ul className="small dim" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li><b>Metric goals</b> (km run, study hours, good-sleep nights, money saved) count real logs between the start and deadline.</li>
              <li><b>Auto goals</b> average their child goals, linked projects, linked habits (30-day rate) and linked tasks.</li>
              <li>Link tasks, projects and habits to a goal from their edit forms.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GoalNode({ g, d, depth }: { g: Goal; d: DB; depth: number }) {
  const T = today();
  const prog = goalProgress(d, g);
  const pace = goalPace(g, T);
  const val = goalValue(d, g);
  const kids = d.goals.filter(c => c.parentId === g.id).sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const projects = d.projects.filter(p => p.goalId === g.id);
  const habits = d.habits.filter(h => h.goalId === g.id && !h.archived);
  const tasks = d.tasks.filter(t => t.goalId === g.id);
  const tone = g.status === 'done' ? 'good' : pace !== undefined && prog < pace - 15 ? 'warn' : undefined;
  const nextLevel = ORDER[ORDER.indexOf(g.level) + 1];
  return (
    <div className={depth ? 'goal-child' : ''}>
      <Card className={depth ? 'flat' : ''} style={{ opacity: g.status === 'paused' || g.status === 'dropped' ? 0.6 : 1 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row wrap"><Pill tone={g.level === 'vision' ? 'accent' : 'outline'}>{GOAL_LEVELS[g.level]}</Pill>{g.status !== 'active' && <Pill tone={g.status === 'done' ? 'good' : undefined}>{g.status}</Pill>}{g.deadline && <span className="tiny muted">by {niceDate(g.deadline)}{g.deadline >= T ? ` · ${diffDays(g.deadline, T)}d` : ''}</span>}</div>
            <button className="bold mt4" style={{ fontSize: depth ? 14.5 : 16, textAlign: 'left' }} onClick={() => openEditor('goal', { id: g.id })}>{g.title}</button>
            {g.why && <div className="small dim mt4">Why: {g.why}</div>}
          </div>
          <div style={{ textAlign: 'right', minWidth: 56 }}>
            <div className={`bold num ${tone ?? ''}`} style={{ fontSize: 20 }}>{prog}%</div>
            {val !== undefined && g.target && <div className="tiny muted num">{Math.round(val * 10) / 10} / {g.target} {GOAL_METRICS[g.metric].unit}</div>}
            {pace !== undefined && g.status === 'active' && <div className="tiny muted">pace {pace}%</div>}
          </div>
        </div>
        <div className="mt8" style={{ position: 'relative' }}>
          <Meter value={prog} color={tone === 'warn' ? 'var(--warn)' : undefined} />
          {pace !== undefined && g.status === 'active' && <span title={`Expected by now: ${pace}%`} style={{ position: 'absolute', left: `${pace}%`, top: -3, width: 2, height: 12, background: 'var(--text-2)', borderRadius: 1 }} />}
        </div>
        {g.nextAction && <div className="small mt8"><ChevronRight size={12} className="accent" /> {g.nextAction}</div>}
        {(projects.length > 0 || habits.length > 0 || tasks.length > 0) && (
          <div className="row wrap mt8">
            {projects.map(p => <button key={p.id} className="chip" onClick={() => nav(`/projects/${p.id}`)}>🚀 {p.name} · {projectProgress(d, p)}%</button>)}
            {habits.map(h => <span key={h.id} className="chip">🔥 {h.name} · {habitRate(d, h, addDays(T, -29), T)}%</span>)}
            {tasks.length > 0 && <span className="chip">✓ {tasks.filter(isDone).length}/{tasks.length} tasks</span>}
          </div>
        )}
        <div className="row mt8">
          {nextLevel && <Btn size="sm" variant="ghost" icon={Plus} onClick={() => openEditor('goal', { defaults: { parentId: g.id, level: nextLevel, area: g.area } })}>{GOAL_LEVELS[nextLevel]} goal</Btn>}
        </div>
      </Card>
      {kids.length > 0 && <div className="col mt8" style={{ gap: 8 }}>{kids.map(k => <GoalNode key={k.id} g={k} d={d} depth={depth + 1} />)}</div>}
    </div>
  );
}
