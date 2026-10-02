import { useMemo, useState } from 'react';
import { CheckSquare, Plus, Search } from 'lucide-react';
import type { Task } from '../lib/types.ts';
import { dayLog, useDB } from '../lib/store.ts';
import { addDays, niceDate, today, weekStart } from '../lib/dates.ts';
import { isDone, taskSort, tasksForDay, topTasks } from '../lib/derive.ts';
import { quickTask } from '../lib/actions.ts';
import { Btn, Card, Empty, QuickAdd, Tabs, usePref } from '../components/ui.tsx';
import { TaskRow } from '../components/rows.tsx';
import { openCapture } from '../components/editors.tsx';

type View = 'today' | 'upcoming' | 'week' | 'overdue' | 'nodate' | 'project' | 'course' | 'done';

export default function Tasks() {
  const d = useDB();
  const T = today();
  const [view, setView] = usePref<View>('tasks.view', 'today');
  const [q, setQ] = useState('');
  const top3 = dayLog(d, T).top3;
  const ws = weekStart(T), we = addDays(ws, 6);
  const all = topTasks(d).filter(t => !q || t.title.toLowerCase().includes(q.toLowerCase()) || t.notes?.toLowerCase().includes(q.toLowerCase()));
  const open = all.filter(t => !isDone(t));

  const lists: Record<View, Task[]> = useMemo(() => ({
    today: tasksForDay(d, T).filter(t => all.includes(t) && !isDone(t)),
    upcoming: open.filter(t => t.due && t.due > T),
    week: all.filter(t => t.due && t.due >= ws && t.due <= we),
    overdue: open.filter(t => t.due && t.due < T),
    nodate: open.filter(t => !t.due),
    project: open.filter(t => t.projectId),
    course: open.filter(t => t.courseId),
    done: all.filter(isDone).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 80),
  }), [d, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = (): [string, Task[]][] => {
    const list = view === 'done' ? lists.done : [...lists[view]].sort(taskSort);
    const by = (key: (t: Task) => string) => {
      const m = new Map<string, Task[]>();
      for (const t of list) { const k = key(t); m.set(k, [...(m.get(k) ?? []), t]); }
      return [...m.entries()];
    };
    if (view === 'upcoming' || view === 'week') return by(t => (t.due === T ? 'Today' : t.due! < T ? 'Earlier' : niceDate(t.due!)));
    if (view === 'project') return by(t => d.projects.find(p => p.id === t.projectId)?.name ?? '—');
    if (view === 'course') return by(t => { const c = d.courses.find(c => c.id === t.courseId); return c ? `${c.code} · ${c.name}` : '—'; });
    if (view === 'done') return by(t => (t.doneAt ? niceDate(t.doneAt.slice(0, 10)) : 'Done'));
    return [['', list]];
  };
  const defaults: Partial<Task> = view === 'today' ? { due: T } : view === 'week' ? { due: T } : {};

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Execute</div><h1>Tasks</h1><div className="sub">{open.length} open · {lists.overdue.length} overdue · {all.filter(t => t.doneAt?.startsWith(T)).length} done today</div></div>
        <div className="row">
          <label className="search-trigger" style={{ minWidth: 200 }}><Search size={14} /><input className="input bare" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter tasks" style={{ height: 30 }} /></label>
          <Btn variant="primary" icon={Plus} onClick={() => openCapture('task', defaults)}>Task</Btn>
        </div>
      </div>
      <Tabs value={view} onChange={setView} tabs={[
        { k: 'today', label: 'Today', count: lists.today.length },
        { k: 'upcoming', label: 'Upcoming', count: lists.upcoming.length },
        { k: 'week', label: 'This week', count: lists.week.filter(t => !isDone(t)).length },
        { k: 'overdue', label: 'Overdue', count: lists.overdue.length },
        { k: 'nodate', label: 'No date', count: lists.nodate.length },
        { k: 'project', label: 'By project' },
        { k: 'course', label: 'By course' },
        { k: 'done', label: 'Completed' },
      ]} />
      <Card className="flat">
        {view !== 'done' && <div style={{ marginBottom: 10 }}><QuickAdd autoFocus={false} placeholder={`Add task${defaults.due ? ' for today' : ''} — "Lab record fri !1 #HT"`} onAdd={t => quickTask(t, defaults)} /></div>}
        {groups().every(([, ts]) => !ts.length) && <Empty icon={CheckSquare} title={view === 'overdue' ? 'Nothing overdue' : 'Nothing here'} hint={view === 'overdue' ? 'Clean slate. Nice.' : 'Capture with C from anywhere.'} />}
        {groups().map(([name, ts]) => ts.length > 0 && (
          <div key={name} style={{ marginBottom: 10 }}>
            {name && <div className="label" style={{ margin: '12px 6px 4px' }}>{name} <span className="num">{ts.length}</span></div>}
            <div className="list">{ts.map(t => <TaskRow key={t.id} t={t} d={d} top3={top3} hideProject={view === 'project'} hideCourse={view === 'course'} />)}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}
