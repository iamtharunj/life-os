import { useState } from 'react';
import { Archive, CheckSquare, Inbox as InboxIcon, Lightbulb, NotebookPen, Pin, Plus, Rocket, Search, Trash2 } from 'lucide-react';
import type { Note } from '../lib/types.ts';
import { add, remove, update, useDB } from '../lib/store.ts';
import { niceDate, today } from '../lib/dates.ts';
import { Btn, Card, Empty, IconBtn, Pill, QuickAdd, Tabs, usePref } from '../components/ui.tsx';
import { openEditor } from '../components/editors.tsx';

export default function InboxPage() {
  const d = useDB();
  const [tab, setTab] = usePref<'inbox' | 'notes' | 'ideas'>('inbox.tab', 'inbox');
  const [q, setQ] = useState('');
  const inbox = d.notes.filter(n => n.inbox);
  const notes = d.notes.filter(n => !n.inbox && !n.idea && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())));
  const ideas = d.notes.filter(n => n.idea && !n.inbox);

  const toTask = (n: Note) => { add('tasks', { title: n.body.slice(0, 120), notes: n.body.length > 120 ? n.body : undefined, priority: 2, status: 'todo', projectId: n.projectId, courseId: n.courseId }); remove('notes', n.id, 'Converted to task'); };
  const toProject = (n: Note) => { openEditor('project', { defaults: { name: n.body.slice(0, 60), description: n.body, status: 'idea' } }); remove('notes', n.id, 'Moved to project draft'); };
  const file = (n: Note) => update('notes', n.id, { inbox: false });

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Capture</div><h1>Inbox & notes</h1><div className="sub">Capture fast, sort later. Aim for an empty inbox once a day.</div></div>
        <Btn variant="primary" icon={Plus} onClick={() => openEditor('note')}>Note</Btn>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'inbox', label: 'Inbox', count: inbox.length }, { k: 'notes', label: 'Notes', count: d.notes.filter(n => !n.inbox && !n.idea).length }, { k: 'ideas', label: 'Ideas', count: ideas.length }]} />
      {tab === 'inbox' && (
        <Card className="flat">
          <QuickAdd placeholder="Dump anything here…" onAdd={t => add('notes', { body: t, date: today(), inbox: true })} icon={InboxIcon} />
          {inbox.length === 0 && <Empty icon={InboxIcon} title="Inbox zero" hint="Everything is sorted. Nice." />}
          <div className="list mt8">
            {inbox.map(n => (
              <div key={n.id} className="li" style={{ alignItems: 'flex-start' }}>
                {n.idea ? <Lightbulb size={16} className="warn" style={{ marginTop: 2 }} /> : <NotebookPen size={16} className="muted" style={{ marginTop: 2 }} />}
                <button className="grow" style={{ textAlign: 'left' }} onClick={() => openEditor(n.idea ? 'idea' : 'note', { id: n.id })}>
                  <div>{n.body}</div><div className="tiny muted">{niceDate(n.date)}</div>
                </button>
                <div className="row gap-4 wrap end">
                  <Btn size="sm" icon={CheckSquare} onClick={() => toTask(n)}>Task</Btn>
                  <Btn size="sm" icon={Rocket} onClick={() => toProject(n)}>Project</Btn>
                  <Btn size="sm" icon={Archive} onClick={() => file(n)}>{n.idea ? 'Keep idea' : 'File note'}</Btn>
                  <IconBtn icon={Trash2} sm label="Delete" onClick={() => remove('notes', n.id, 'Deleted')} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === 'notes' && (
        <>
          <label className="search-trigger" style={{ maxWidth: 360, marginBottom: 12 }}><Search size={14} /><input className="input bare" value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes" style={{ height: 30 }} /></label>
          {notes.length === 0 && <Empty icon={NotebookPen} title="No notes" />}
          <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
            {notes.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date)).map(n => (
              <button key={n.id} className="card hover" style={{ textAlign: 'left' }} onClick={() => openEditor('note', { id: n.id })}>
                <div className="row between"><span className="bold">{n.title || niceDate(n.date)}</span>{n.pinned && <Pin size={13} className="warn" />}</div>
                <p className="small dim mt4" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
                <div className="row mt8">
                  {n.courseId && <Pill color={d.courses.find(c => c.id === n.courseId)?.color}>{d.courses.find(c => c.id === n.courseId)?.code}</Pill>}
                  {n.projectId && <Pill>{d.projects.find(p => p.id === n.projectId)?.name}</Pill>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {tab === 'ideas' && (
        <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
          {ideas.length === 0 && <Empty icon={Lightbulb} title="No ideas filed yet" />}
          {ideas.map(n => (
            <Card key={n.id}>
              <p className="small">{n.body}</p>
              <div className="row mt12"><span className="tiny muted grow">{niceDate(n.date)}</span><Btn size="sm" icon={Rocket} onClick={() => toProject(n)}>Make project</Btn><IconBtn icon={Trash2} sm label="Delete" onClick={() => remove('notes', n.id, 'Idea deleted')} /></div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
