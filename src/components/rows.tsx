import { AlertCircle, Clock, Play, Rocket, Star, Timer } from 'lucide-react';
import type { DB, DateStr, Task } from '../lib/types.ts';
import { diffDays, fmtDur, relDay, shortDate, today, addDays } from '../lib/dates.ts';
import { isDone, subtasksOf, projectAttention, projectProgress, projectDeadline, attentionScore, upcomingPayments } from '../lib/derive.ts';
import { AREAS, PRIORITY, PROJECT_TYPES, OPEN_STATUSES } from '../lib/meta.ts';
import { pinTop3, toggleTask } from '../lib/actions.ts';
import { startTimer } from '../lib/focus.ts';
import { openEditor } from './editors.tsx';
import { CheckBox, IconBtn, Meter, Pill, nav, money } from './ui.tsx';
import { PROJECT_ICON } from './icons.tsx';

export function dueTone(due: DateStr | undefined, done = false): 'bad' | 'warn' | undefined {
  if (!due || done) return undefined;
  const n = diffDays(due, today());
  return n < 0 ? 'bad' : n <= 1 ? 'warn' : undefined;
}

export function TaskRow({ t, d, top3, date = today(), hideProject, hideCourse }: { t: Task; d: DB; top3?: string[]; date?: DateStr; hideProject?: boolean; hideCourse?: boolean }) {
  const done = isDone(t);
  const p = t.projectId ? d.projects.find(x => x.id === t.projectId) : undefined;
  const c = t.courseId ? d.courses.find(x => x.id === t.courseId) : undefined;
  const subs = subtasksOf(d, t.id);
  const pinned = top3?.includes(t.id);
  const tone = dueTone(t.due, done);
  return (
    <div className={`li click top ${done ? 'done' : ''}`} onClick={() => openEditor(t.kind === 'assignment' || t.kind === 'lab' ? 'assignment' : 'task', { id: t.id })}>
      <CheckBox on={done} onChange={() => toggleTask(t)} label={`${done ? 'Reopen' : 'Complete'} ${t.title}`} round={t.priority !== 1} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="title ellipsis">{t.title}</div>
        <div className="meta">
          {t.priority === 1 && !done && <Pill tone="bad">{PRIORITY[1].short}</Pill>}
          {t.status === 'doing' && !done && <Pill tone="accent">In progress</Pill>}
          {t.status === 'blocked' && <Pill tone="warn">Blocked</Pill>}
          {t.kind && t.kind !== 'task' && <Pill>{t.kind === 'lab' ? 'Lab' : 'Assignment'}</Pill>}
          {c && !hideCourse && <Pill color={c.color}>{c.code}</Pill>}
          {p && !hideProject && <Pill color={AREAS[PROJECT_TYPES[p.type].area].color}>{p.name}</Pill>}
          {t.due && <span className={`tiny ${tone ?? 'muted'}`}>{tone === 'bad' ? <AlertCircle size={11} style={{ verticalAlign: -2 }} /> : null} {relDay(t.due, date)}</span>}
          {subs.length > 0 && <span className="tiny muted">{subs.filter(isDone).length}/{subs.length} sub</span>}
          {t.estMin ? <span className="tiny muted"><Clock size={10} style={{ verticalAlign: -1 }} /> {fmtDur(t.estMin)}</span> : null}
        </div>
      </div>
      {!done && (
        <div className="row gap-4 hover-show" onClick={e => e.stopPropagation()}>
          {top3 && <IconBtn icon={Star} sm label={pinned ? 'Unpin from Top 3' : 'Pin to Top 3'} onClick={() => pinTop3(date, t.id)} style={pinned ? { color: 'var(--warn)' } : undefined} />}
          <IconBtn icon={Timer} sm label="Focus on this" onClick={() => { startTimer({ kind: 'focus', link: { taskId: t.id, projectId: t.projectId, courseId: t.courseId, label: t.title } }); nav('/focus'); }} />
        </div>
      )}
    </div>
  );
}

export interface Upcoming { key: string; date: DateStr; title: string; sub: string; color: string; open: () => void; extra?: React.ReactNode }
export function upcomingItems(d: DB, days = 10, from = today()): Upcoming[] {
  const to = addDays(from, days);
  const out: Upcoming[] = [];
  for (const t of d.tasks) if (!t.parentId && !isDone(t) && t.due && t.due >= from && t.due <= to && (t.kind === 'assignment' || t.kind === 'lab' || t.priority === 1)) {
    const c = d.courses.find(c => c.id === t.courseId);
    const p = d.projects.find(p => p.id === t.projectId);
    out.push({ key: t.id, date: t.due, title: t.title, sub: c?.code ?? p?.name ?? 'Task', color: c?.color ?? AREAS.projects.color, open: () => openEditor(t.kind === 'task' || !t.kind ? 'task' : 'assignment', { id: t.id }) });
  }
  for (const e of d.exams) if (e.date >= from && e.date <= addDays(from, Math.max(days, 21))) {
    const c = d.courses.find(c => c.id === e.courseId);
    out.push({ key: e.id, date: e.date, title: `${c?.code ?? ''} ${e.type}`, sub: `Exam · prep ${e.prep}%`, color: c?.color ?? AREAS.academics.color, open: () => openEditor('exam', { id: e.id }), extra: <span style={{ width: 44 }}><Meter value={e.prep} color={e.prep < 50 ? 'var(--warn)' : undefined} /></span> });
  }
  for (const p of d.projects) {
    if (!OPEN_STATUSES.includes(p.status) && p.status !== 'idea') continue;
    const dl = projectDeadline(p);
    if (dl && dl >= from && dl <= to) out.push({ key: p.id, date: dl, title: p.name, sub: p.type === 'hackathon' ? 'Submission' : 'Project deadline', color: AREAS[PROJECT_TYPES[p.type].area].color, open: () => nav(`/projects/${p.id}`) });
    if (p.hack?.regDeadline && p.hack.regDeadline >= from && p.hack.regDeadline <= to) out.push({ key: p.id + 'reg', date: p.hack.regDeadline, title: p.name, sub: 'Registration closes', color: AREAS.hackathons.color, open: () => nav(`/projects/${p.id}`) });
  }
  for (const s of upcomingPayments(d, days, from)) out.push({ key: s.id, date: s.next, title: s.name, sub: `Payment · ${money(s.amount, d.settings.currency)}`, color: AREAS.finance.color, open: () => nav('/finance') });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function UpcomingList({ items, limit = 7 }: { items: Upcoming[]; limit?: number }) {
  const T = today();
  return (
    <div className="list">
      {items.slice(0, limit).map(u => {
        const n = diffDays(u.date, T);
        return (
          <div key={u.key} className="li click" onClick={u.open}>
            <div style={{ width: 42, textAlign: 'center', flex: 'none' }}>
              <div className={`bold num ${n <= 1 ? 'bad' : n <= 3 ? 'warn' : ''}`} style={{ fontSize: 15, lineHeight: 1 }}>{n === 0 ? 'Today' : n === 1 ? '1d' : `${n}d`}</div>
              <div className="tiny muted">{shortDate(u.date)}</div>
            </div>
            <span className="swatch" style={{ background: u.color, width: 3, height: 26, borderRadius: 2 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title ellipsis">{u.title}</div>
              <div className="tiny muted ellipsis">{u.sub}</div>
            </div>
            {u.extra}
          </div>
        );
      })}
      {items.length > limit && <div className="tiny muted" style={{ padding: '6px 6px 0' }}>+{items.length - limit} more in the next weeks</div>}
    </div>
  );
}

export function ProjectAttention({ d, limit = 3 }: { d: DB; limit?: number }) {
  const ps = d.projects.filter(p => OPEN_STATUSES.includes(p.status)).sort((a, b) => attentionScore(d, b) - attentionScore(d, a)).slice(0, limit);
  if (!ps.length) return <div className="empty"><Rocket /><div className="t">No active projects</div></div>;
  return (
    <div className="list">
      {ps.map(p => {
        const reasons = projectAttention(d, p);
        const Icon = PROJECT_ICON[p.type];
        const color = AREAS[PROJECT_TYPES[p.type].area].color;
        return (
          <div key={p.id} className="li click" onClick={() => nav(`/projects/${p.id}`)} style={{ alignItems: 'flex-start' }}>
            <div className="area-ic" style={{ ['--c' as string]: color, width: 30, height: 30 }}><Icon /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row between"><span className="title ellipsis">{p.name}</span><span className="num tiny muted">{projectProgress(d, p)}%</span></div>
              {p.nextAction && <div className="tiny dim ellipsis"><Play size={9} style={{ verticalAlign: 0 }} /> {p.nextAction}</div>}
              {reasons.length > 0 && <div className="meta">{reasons.slice(0, 2).map(r => <Pill key={r.text} tone={r.level}>{r.text}</Pill>)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
