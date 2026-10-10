import { useState } from 'react';
import {
  ArrowLeft, CalendarClock, Check, ExternalLink, Flag, History, Kanban, LayoutGrid, Link2, ListChecks, Pencil, Play, Plus, Rocket, Timer, Trophy, Users, Zap, ChartGantt,
} from 'lucide-react';
import type { DB, Project, ProjectStatus } from '../lib/types.ts';
import { update, useDB } from '../lib/store.ts';
import { addDays, diffDays, fmtDur, niceDate, shortDate, today } from '../lib/dates.ts';
import { attentionScore, isDone, projectAttention, projectDeadline, projectLast, projectProgress, taskSort } from '../lib/derive.ts';
import { AREAS, HACK_STAGES, OPEN_STATUSES, PRIORITY, PROJECT_STATUS, PROJECT_TYPES } from '../lib/meta.ts';
import { addMilestone, addProjectUpdate, quickTask, toggleMilestone } from '../lib/actions.ts';
import { startTimer } from '../lib/focus.ts';
import { Btn, Card, CheckBox, Empty, Meter, Pill, QuickAdd, Ring, Tabs, nav, tilt, useRoute, usePref } from '../components/ui.tsx';
import { safeHref } from '../lib/platform.ts';
import { TaskRow } from '../components/rows.tsx';
import { openEditor } from '../components/editors.tsx';
import { PROJECT_ICON } from '../components/icons.tsx';

type Tab = 'active' | 'kanban' | 'timeline' | 'hackathons' | 'done';
const colorOf = (p: Project) => AREAS[PROJECT_TYPES[p.type].area].color;
const statusTone = (s: ProjectStatus) => (s === 'active' ? 'accent' : s === 'blocked' ? 'bad' : s === 'completed' || s === 'submitted' ? 'good' : 'outline') as 'accent' | 'bad' | 'good' | 'outline';

export default function Projects() {
  const parts = useRoute();
  const d = useDB();
  const [tab, setTab] = usePref<Tab>('proj.tab', 'active');
  const p = parts[1] ? d.projects.find(x => x.id === parts[1]) : undefined;
  if (parts[1]) return p ? <ProjectDetail p={p} /> : <div className="page"><Empty title="Project not found" action={<Btn onClick={() => nav('/projects')}>Back</Btn>} /></div>;

  const open = d.projects.filter(x => OPEN_STATUSES.includes(x.status)).sort((a, b) => attentionScore(d, b) - attentionScore(d, a));
  const ideas = d.projects.filter(x => x.status === 'idea');
  const hacks = d.projects.filter(x => x.type === 'hackathon' && x.status !== 'archived');
  const done = d.projects.filter(x => ['completed', 'submitted', 'archived'].includes(x.status));

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · projects</div><h1>Projects & hackathons</h1><div className="sub">{open.length} active · {open.filter(x => projectAttention(d, x).length > 0).length} need attention</div></div>
        <div className="row"><Btn icon={Zap} onClick={() => openEditor('project', { defaults: { type: 'hackathon', hack: { stage: 'Registered' } } })}>Hackathon</Btn><Btn variant="primary" icon={Plus} onClick={() => openEditor('project')}>Project</Btn></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'active', label: <><LayoutGrid size={14} />Active</>, count: open.length },
        { k: 'kanban', label: <><Kanban size={14} />Kanban</> },
        { k: 'timeline', label: <><ChartGantt size={14} />Timeline</> },
        { k: 'hackathons', label: <><Zap size={14} />Hackathons</>, count: hacks.length },
        { k: 'done', label: <><Trophy size={14} />Completed</>, count: done.length },
      ]} />
      {tab === 'active' && (
        <>
          {open.length === 0 && <Empty icon={Rocket} title="No active projects" action={<Btn icon={Plus} onClick={() => openEditor('project')}>Start one</Btn>} />}
          <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>{open.map(x => <ProjectCard key={x.id} p={x} d={d} />)}</div>
          {ideas.length > 0 && <><div className="label" style={{ margin: '22px 0 10px' }}>Ideas</div><div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>{ideas.map(x => <ProjectCard key={x.id} p={x} d={d} />)}</div></>}
        </>
      )}
      {tab === 'kanban' && <KanbanBoard d={d} />}
      {tab === 'timeline' && <Timeline d={d} />}
      {tab === 'hackathons' && (
        <div className="g g2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))' }}>
          {hacks.length === 0 && <Empty icon={Zap} title="No hackathons tracked" />}
          {hacks.map(x => <HackCard key={x.id} p={x} />)}
        </div>
      )}
      {tab === 'done' && (
        <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          {done.length === 0 && <Empty title="Nothing completed yet" />}
          {done.map(x => <ProjectCard key={x.id} p={x} d={d} />)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, d }: { p: Project; d: DB }) {
  const Icon = PROJECT_ICON[p.type];
  const reasons = projectAttention(d, p);
  const prog = projectProgress(d, p);
  const dl = projectDeadline(p);
  const T = today();
  return (
    <button className="card hover area-card tilt" style={{ textAlign: 'left', ['--c' as string]: colorOf(p) }} onClick={() => nav(`/projects/${p.id}`)} {...tilt}>
      <div className="area-top">
        <div className="area-ic"><Icon /></div>
        <div className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis" style={{ fontSize: 15 }}>{p.name}</div><div className="tiny muted">{PROJECT_TYPES[p.type].label} · {PRIORITY[p.priority].label} priority</div></div>
        <Pill tone={statusTone(p.status)}>{PROJECT_STATUS[p.status]}</Pill>
      </div>
      <div className="row"><Meter value={prog} color={colorOf(p)} /><span className="num small">{prog}%</span></div>
      {p.nextAction && <div className="small dim ellipsis"><Play size={10} /> {p.nextAction}</div>}
      <div className="row wrap">
        {dl && <Pill tone={diffDays(dl, T) <= 3 ? 'bad' : diffDays(dl, T) <= 7 ? 'warn' : 'outline'}><CalendarClock />{diffDays(dl, T) >= 0 ? `${diffDays(dl, T)}d left` : `${-diffDays(dl, T)}d over`}</Pill>}
        {reasons.filter(r => !r.text.startsWith('Due') && !r.text.startsWith('Deadline')).slice(0, 2).map(r => <Pill key={r.text} tone={r.level}>{r.text}</Pill>)}
        {p.team && <span className="tiny muted ellipsis"><Users size={10} /> {p.team}</span>}
      </div>
    </button>
  );
}

function KanbanBoard({ d }: { d: DB }) {
  const [over, setOver] = useState<string | null>(null);
  const cols: ProjectStatus[] = ['idea', 'planning', 'active', 'blocked', 'submitted', 'completed'];
  return (
    <div className="kanban">
      {cols.map(st => {
        const ps = d.projects.filter(p => p.status === st);
        return (
          <div key={st} className={`kcol ${over === st ? 'over' : ''}`}
            onDragOver={e => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) update('projects', id, { status: st }); }}>
            <div className="row between"><span className="label">{PROJECT_STATUS[st]}</span><span className="badge muted">{ps.length}</span></div>
            {ps.map(p => (
              <div key={p.id} className="card tight hover kcard" draggable onDragStart={e => e.dataTransfer.setData('text/plain', p.id)} onClick={() => nav(`/projects/${p.id}`)} style={{ borderLeft: `3px solid ${colorOf(p)}` }}>
                <div className="bold small">{p.name}</div>
                <div className="row mt4"><Meter value={projectProgress(d, p)} color={colorOf(p)} /><span className="num tiny">{projectProgress(d, p)}%</span></div>
                {projectDeadline(p) && <div className="tiny muted mt4">⚑ {niceDate(projectDeadline(p)!)}</div>}
              </div>
            ))}
            {ps.length === 0 && <div className="tiny muted" style={{ textAlign: 'center', padding: 12 }}>Drop here</div>}
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ d }: { d: DB }) {
  const T = today();
  const ps = d.projects.filter(p => p.status !== 'archived' && (p.start || p.createdAt) && projectDeadline(p)).sort((a, b) => projectDeadline(a)!.localeCompare(projectDeadline(b)!));
  if (!ps.length) return <Empty icon={ChartGantt} title="Add start and deadline dates to see a timeline" />;
  const from = [addDays(T, -30), ...ps.map(p => p.start ?? p.createdAt!.slice(0, 10))].sort()[0];
  const to = [addDays(T, 30), ...ps.map(p => projectDeadline(p)!)].sort().pop()!;
  const span = Math.max(1, diffDays(to, from));
  const x = (s: string) => `${(diffDays(s, from) / span) * 100}%`;
  const months: string[] = [];
  for (let m = from.slice(0, 7) + '-01'; m <= to; m = addDays(m, 32).slice(0, 7) + '-01') if (m >= from) months.push(m);
  return (
    <Card className="flat">
      <div className="tl-row" style={{ borderTop: 0 }}>
        <div />
        <div className="tl-track" style={{ height: 22 }}>{months.map(m => <span key={m} className="tiny muted" style={{ position: 'absolute', left: x(m) }}>{shortDate(m).split(' ')[0]}</span>)}</div>
      </div>
      <div className="timeline">
        {ps.map(p => {
          const s = p.start ?? p.createdAt!.slice(0, 10);
          const e = projectDeadline(p)!;
          return (
            <div key={p.id} className="tl-row">
              <button className="small ellipsis" style={{ textAlign: 'left', paddingRight: 10 }} onClick={() => nav(`/projects/${p.id}`)}>{p.name}</button>
              <div className="tl-track" style={{ ['--c' as string]: colorOf(p) }}>
                <div className="tl-today" style={{ left: x(T) }} />
                <div className="tl-bar" style={{ left: x(s), width: `calc(${x(e)} - ${x(s)})` }} title={`${niceDate(s)} → ${niceDate(e)}`}><i style={{ width: `${projectProgress(d, p)}%` }} /></div>
                {p.milestones.filter(m => m.due || m.done).map(m => <span key={m.id} className={`tl-ms ${m.done ? 'done' : ''}`} style={{ left: x(m.done ?? m.due!) }} title={`${m.title} · ${m.done ? 'done ' + niceDate(m.done) : 'due ' + niceDate(m.due!)}`} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="legend mt12"><span><i className="swatch" style={{ background: 'var(--accent)', width: 2, height: 12 }} />today</span><span>◆ milestone (filled = done)</span><span>bar fill = progress</span></div>
    </Card>
  );
}

function HackCard({ p }: { p: Project }) {
  const T = today();
  const h = p.hack ?? {};
  const stageIdx = Math.max(0, HACK_STAGES.indexOf(h.stage ?? 'Registered'));
  return (
    <Card title={p.name} icon={Zap} actions={<Btn size="sm" variant="ghost" onClick={() => nav(`/projects/${p.id}`)}>Open</Btn>}>
      <div className="tiny muted">{h.competition}</div>
      <div className="row mt12" style={{ gap: 4 }}>
        {HACK_STAGES.map((st, i) => (
          <button key={st} className="grow" onClick={() => update('projects', p.id, { hack: { ...h, stage: st } })} title={`Set stage: ${st}`}>
            <div style={{ height: 6, borderRadius: 3, background: i <= stageIdx ? AREAS.hackathons.color : 'var(--card-3)' }} />
            <div className="tiny mt4" style={{ color: i === stageIdx ? 'var(--text)' : 'var(--muted)', fontSize: 10 }}>{st}</div>
          </button>
        ))}
      </div>
      <div className="g g2 mt12" style={{ gap: 8 }}>
        <div className="sub-card"><div className="tiny muted">Registration</div><div className="small bold">{h.regDeadline ? `${niceDate(h.regDeadline)}${h.regDeadline >= T ? ` · ${diffDays(h.regDeadline, T)}d` : ''}` : '—'}</div></div>
        <div className="sub-card"><div className="tiny muted">Submission</div><div className={`small bold ${h.subDeadline && diffDays(h.subDeadline, T) <= 3 && h.subDeadline >= T ? 'bad' : ''}`}>{h.subDeadline ? `${niceDate(h.subDeadline)}${h.subDeadline >= T ? ` · ${diffDays(h.subDeadline, T)}d` : ''}` : '—'}</div></div>
      </div>
      {h.problem && <p className="small mt12"><span className="muted">Problem: </span>{h.problem}</p>}
      {h.idea && <p className="small mt4"><span className="muted">Idea: </span>{h.idea}</p>}
      {h.stack && <div className="chips mt8">{h.stack.split(',').map(s => s.trim()).filter(Boolean).map(s => <span key={s} className="pill outline">{s}</span>)}</div>}
      <div className="row mt12 small">
        {p.team && <span className="muted grow"><Users size={12} /> {p.team}</span>}
        {h.submissionLink && <a className="accent" href={safeHref(h.submissionLink)} target="_blank" rel="noreferrer">Submission <ExternalLink size={11} /></a>}
        {h.result && <Pill tone="good"><Trophy />{h.result}</Pill>}
      </div>
    </Card>
  );
}

function ProjectDetail({ p }: { p: Project }) {
  const d = useDB();
  const T = today();
  const [editNext, setEditNext] = useState(false);
  const tasks = d.tasks.filter(t => t.projectId === p.id && !t.parentId).sort(taskSort);
  const prog = projectProgress(d, p);
  const last = projectLast(d, p);
  const focus = d.focus.filter(f => f.projectId === p.id).reduce((a, f) => a + f.min, 0);
  const reasons = projectAttention(d, p);
  const Icon = PROJECT_ICON[p.type];
  const color = colorOf(p);
  const dl = projectDeadline(p);
  const notes = d.notes.filter(n => n.projectId === p.id);

  return (
    <div className="page">
      <Btn variant="ghost" icon={ArrowLeft} onClick={() => nav('/projects')}>Projects</Btn>
      <div className="page-head mt8">
        <div className="row gap-12">
          <div className="area-ic" style={{ ['--c' as string]: color, width: 46, height: 46 }}><Icon size={22} /></div>
          <div>
            <div className="eyebrow" style={{ color }}>{PROJECT_TYPES[p.type].label} · {PRIORITY[p.priority].label} priority</div>
            <h1>{p.name}</h1>
            {p.goal && <div className="sub">{p.goal}</div>}
          </div>
        </div>
        <div className="row wrap">
          <select className="select" style={{ width: 140 }} value={p.status} onChange={e => update('projects', p.id, { status: e.target.value as ProjectStatus })} aria-label="Status">
            {Object.entries(PROJECT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Btn icon={Timer} onClick={() => { startTimer({ kind: 'focus', link: { projectId: p.id, label: p.name } }); nav('/focus'); }}>Focus</Btn>
          <Btn icon={Pencil} onClick={() => openEditor('project', { id: p.id })}>Edit</Btn>
        </div>
      </div>

      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="g">
          <Card>
            <div className="row gap-16 wrap">
              <Ring value={prog} size={78} stroke={7} color={color}><span className="bold num">{prog}%</span></Ring>
              <div className="grow" style={{ minWidth: 220 }}>
                <div className="label">Next action</div>
                {editNext ? (
                  <form onSubmit={e => { e.preventDefault(); update('projects', p.id, { nextAction: (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value }); setEditNext(false); }}>
                    <input name="n" className="input mt4" autoFocus defaultValue={p.nextAction} onBlur={e => { update('projects', p.id, { nextAction: e.target.value }); setEditNext(false); }} />
                  </form>
                ) : (
                  <button className="mt4" style={{ fontSize: 16, fontWeight: 600, textAlign: 'left' }} onClick={() => setEditNext(true)}>{p.nextAction || <span className="muted">Set the very next step…</span>}</button>
                )}
                <div className="row wrap mt8">
                  {dl && <Pill tone={diffDays(dl, T) <= 3 ? 'bad' : 'outline'}><Flag />{niceDate(dl)} · {diffDays(dl, T) >= 0 ? `${diffDays(dl, T)}d left` : 'overdue'}</Pill>}
                  {last && <Pill tone="outline"><History />last progress {diffDays(T, last) === 0 ? 'today' : `${diffDays(T, last)}d ago`}</Pill>}
                  {focus > 0 && <Pill tone="outline"><Timer />{fmtDur(focus)} focused</Pill>}
                  {reasons.filter(r => r.text.startsWith('No progress') || r.text === 'Blocked').map(r => <Pill key={r.text} tone={r.level}>{r.text}</Pill>)}
                </div>
              </div>
            </div>
            <div className="hr" />
            <QuickAdd placeholder="Log progress: what moved forward today? (+XP)" icon={Rocket} onAdd={t => addProjectUpdate(p, t)} />
          </Card>

          <Card title="Tasks" icon={ListChecks} actions={<span className="tiny muted">{tasks.filter(isDone).length}/{tasks.length}</span>}>
            {tasks.length === 0 && <div className="small muted">Break it down into tasks — progress updates automatically.</div>}
            <div className="list">{tasks.map(t => <TaskRow key={t.id} t={t} d={d} hideProject top3={d.days[T]?.top3 ?? []} />)}</div>
            <div className="mt8"><QuickAdd placeholder="Add project task — 'train model fri !1'" onAdd={t => quickTask(t, { projectId: p.id, area: p.type === 'hackathon' ? 'hackathons' : 'projects', goalId: p.goalId })} /></div>
          </Card>

          <Card title="Progress log" icon={History}>
            {p.updates.length === 0 && <div className="small muted">Every small step counts. Log what moved.</div>}
            <div className="col gap-4">
              {[...p.updates].reverse().map(u => (
                <div key={u.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="swatch" style={{ background: color, marginTop: 6, borderRadius: '50%', width: 8, height: 8 }} />
                  <span className="tiny muted num" style={{ width: 54, marginTop: 2 }}>{shortDate(u.date)}</span>
                  <span className="small grow">{u.text}</span>
                  <button className="tiny muted hover-show" onClick={() => update('projects', p.id, { updates: p.updates.filter(x => x.id !== u.id) })}>remove</button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="g">
          <Card title="Milestones" icon={Flag}>
            <div className="list">
              {p.milestones.map(m => (
                <div key={m.id} className={`li ${m.done ? 'done' : ''}`}>
                  <CheckBox on={!!m.done} onChange={() => toggleMilestone(p, m.id)} label={m.title} />
                  <span className="grow title">{m.title}</span>
                  <span className={`tiny ${!m.done && m.due && m.due < T ? 'bad' : 'muted'}`}>{m.done ? <><Check size={10} /> {shortDate(m.done)}</> : m.due ? shortDate(m.due) : ''}</span>
                  <button className="tiny muted hover-show" onClick={() => update('projects', p.id, { milestones: p.milestones.filter(x => x.id !== m.id) })}>×</button>
                </div>
              ))}
            </div>
            <MilestoneAdd p={p} />
          </Card>
          {p.type === 'hackathon' && <HackCard p={p} />}
          <Card title="Details" icon={Users}>
            <div className="col small">
              {p.team && <div><span className="muted">Team: </span>{p.team}</div>}
              {p.start && <div><span className="muted">Started: </span>{niceDate(p.start)}</div>}
              {p.goalId && <div><span className="muted">Supports goal: </span><button className="accent" onClick={() => openEditor('goal', { id: p.goalId })}>{d.goals.find(g => g.id === p.goalId)?.title}</button></div>}
              {p.description && <p className="dim">{p.description}</p>}
              {p.resources && <p className="dim"><span className="muted">Resources: </span>{p.resources}</p>}
              {p.notes && <p className="dim">{p.notes}</p>}
              {!p.team && !p.description && !p.notes && <span className="muted">Add team, description and notes via Edit.</span>}
            </div>
          </Card>
          <Card title="Links" icon={Link2}>
            {p.links.length === 0 && <div className="small muted">Repo, docs, competition page… add via Edit.</div>}
            {p.links.map((l, i) => <a key={i} className="li" href={safeHref(l.url)} target="_blank" rel="noreferrer"><ExternalLink size={13} className="muted" /><span className="grow small accent ellipsis">{l.label || l.url}</span></a>)}
          </Card>
          {notes.length > 0 && (
            <Card title="Notes">
              {notes.map(n => <div key={n.id} className="li click" onClick={() => openEditor('note', { id: n.id })}><span className="small">{n.title ? <b>{n.title}: </b> : null}{n.body}</span></div>)}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MilestoneAdd({ p }: { p: Project }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  return (
    <form className="row mt8" onSubmit={e => { e.preventDefault(); if (!title.trim()) return; addMilestone(p, title.trim(), due || undefined); setTitle(''); setDue(''); }}>
      <input className="input" placeholder="New milestone" value={title} onChange={e => setTitle(e.target.value)} />
      <input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: 150 }} aria-label="Milestone due date" />
      <Btn type="submit" icon={Plus}>Add</Btn>
    </form>
  );
}
