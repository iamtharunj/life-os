import { ArrowLeft, BookOpen, CalendarClock, FileText, GraduationCap, Plus, Target, Timer, Trash2, UserCheck } from 'lucide-react';
import type { Course, DB } from '../lib/types.ts';
import { remove, update, useDB } from '../lib/store.ts';
import { addDays, diffDays, dow, fmtDur, fmtTime, niceDate, range, shortDate, today, weekStart, WEEKDAY_LETTERS } from '../lib/dates.ts';
import { blocksOn, goalProgress, isDone, studyMin, taskSort, topTasks } from '../lib/derive.ts';
import { toggleBlockDone } from '../lib/actions.ts';
import { startTimer } from '../lib/focus.ts';
import { Btn, Card, CheckBox, Empty, IconBtn, Meter, Pill, Stat, Tabs, nav, useQuery, usePref } from '../components/ui.tsx';
import { Bars, HBars } from '../components/charts.tsx';
import { TaskRow } from '../components/rows.tsx';
import { openCapture, openEditor } from '../components/editors.tsx';

type Tab = 'overview' | 'courses' | 'assignments' | 'exams' | 'study';

export function attendance(d: DB, courseId?: string) {
  let att = 0, miss = 0;
  for (const b of d.blocks) if (b.kind === 'class' && (!courseId || b.courseId === courseId)) { att += b.done?.length ?? 0; miss += b.missed?.length ?? 0; }
  return { att, miss, pct: att + miss ? Math.round((att / (att + miss)) * 100) : undefined };
}

export default function Academics() {
  const d = useDB();
  const q = useQuery();
  const [tab, setTab] = usePref<Tab>('acad.tab', 'overview');
  const courseId = q.get('course');
  const course = d.courses.find(c => c.id === courseId);
  if (course) return <CourseDetail c={course} />;

  const T = today();
  const pending = topTasks(d).filter(t => (t.kind === 'assignment' || t.kind === 'lab') && !isDone(t)).sort(taskSort);
  const exams = d.exams.filter(e => e.date >= T).sort((a, b) => a.date.localeCompare(b.date));
  const ws = weekStart(T);
  const att = attendance(d);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · academics</div><h1>Academics</h1><div className="sub">{d.courses.length} courses · {d.courses.reduce((a, c) => a + (c.credits ?? 0), 0)} credits</div></div>
        <div className="row wrap">
          <Btn icon={BookOpen} onClick={() => openCapture('study')}>Log study</Btn>
          <Btn icon={FileText} onClick={() => openEditor('exam')}>Exam</Btn>
          <Btn variant="primary" icon={Plus} onClick={() => openCapture('assignment')}>Assignment</Btn>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'overview', label: 'Overview' }, { k: 'courses', label: 'Courses', count: d.courses.length },
        { k: 'assignments', label: 'Assignments & labs', count: pending.length }, { k: 'exams', label: 'Exams', count: exams.length }, { k: 'study', label: 'Study log' },
      ]} />

      {tab === 'overview' && (
        <div className="g">
          <div className="g g4">
            <Card><Stat k="Study this week" v={fmtDur(studyMin(d, ws, T))} unit={`/ ${d.settings.weekly.studyHours}h`} /><div className="mt8"><Meter value={(studyMin(d, ws, T) / 60 / d.settings.weekly.studyHours) * 100} /></div></Card>
            <Card><Stat k="Pending work" v={pending.length} unit="items" d={pending.filter(t => t.due && t.due < T).length ? `${pending.filter(t => t.due && t.due < T).length} overdue` : 'nothing overdue'} tone={pending.some(t => t.due && t.due < T) ? 'bad' : 'good'} /></Card>
            <Card><Stat k="Next exam" v={exams[0] ? `${diffDays(exams[0].date, T)}d` : '—'} d={exams[0] ? `${d.courses.find(c => c.id === exams[0].courseId)?.code ?? ''} ${exams[0].type} · prep ${exams[0].prep}%` : 'none scheduled'} tone={exams[0] && exams[0].prep < 50 && diffDays(exams[0].date, T) < 7 ? 'warn' : undefined} /></Card>
            <Card><Stat k="Attendance" v={att.pct !== undefined ? `${att.pct}%` : '—'} d={`${att.att} attended · ${att.miss} missed`} tone={att.pct !== undefined && att.pct < 75 ? 'bad' : att.pct !== undefined && att.pct < 80 ? 'warn' : 'good'} /></Card>
          </div>
          <div className="g" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', alignItems: 'start' }}>
            <Card title="Today's classes" icon={CalendarClock}>
              {(() => {
                const cls = blocksOn(d, T).filter(i => i.block.kind === 'class' || i.block.kind === 'study');
                if (!cls.length) return <Empty title="No classes today" />;
                return <div className="list">{cls.map(i => {
                  const c = d.courses.find(x => x.id === i.block.courseId);
                  return (
                    <div key={i.key} className="li">
                      <span className="num small muted" style={{ width: 46 }}>{fmtTime(i.start)}</span>
                      <span className="swatch" style={{ background: c?.color ?? 'var(--line-2)', height: 22, width: 3 }} />
                      <div className="grow"><div className="title">{i.block.title}</div><div className="tiny muted">{i.block.location ?? ''} {i.block.kind === 'study' ? '· study block' : ''}</div></div>
                      <IconBtn icon={Timer} sm label="Start focus" onClick={() => { startTimer({ kind: 'focus', link: { courseId: i.block.courseId, label: c?.name ?? i.block.title } }); nav('/focus'); }} />
                      <CheckBox on={i.done} onChange={() => toggleBlockDone(i)} label={i.block.kind === 'class' ? 'Attended' : 'Done'} round />
                    </div>);
                })}</div>;
              })()}
            </Card>
            <Card title="Assignments & labs" icon={FileText} actions={<Btn size="sm" variant="ghost" onClick={() => setTab('assignments')}>All</Btn>}>
              {pending.length === 0 ? <Empty title="All caught up" /> : <div className="list">{pending.slice(0, 6).map(t => <TaskRow key={t.id} t={t} d={d} />)}</div>}
            </Card>
            <Card title="Upcoming exams" icon={GraduationCap}>
              {exams.length === 0 ? <Empty title="No exams scheduled" action={<Btn size="sm" icon={Plus} onClick={() => openEditor('exam')}>Exam</Btn>} /> : <ExamList d={d} exams={exams.slice(0, 5)} />}
            </Card>
            <Card title="Study hours this week" icon={BookOpen}>
              <Bars data={range(ws, addDays(ws, 6)).map(x => ({ label: dow(x).slice(0, 2), value: studyMin(d, x, x) / 60, tip: <><b>{fmtDur(studyMin(d, x, x))}</b> <span className="muted">{niceDate(x)}</span></> }))} height={130} fmt={n => `${+n.toFixed(1)}h`} target={{ value: d.settings.weekly.studyHours / 7, label: 'daily pace' }} />
              <div className="hr" />
              <div className="label" style={{ marginBottom: 6 }}>By course, last 14 days</div>
              <HBars data={d.courses.map(c => ({ label: c.code, value: studyMin(d, addDays(T, -13), T, c.id) / 60, color: c.color })).sort((a, b) => b.value - a.value)} fmt={n => `${n.toFixed(1)}h`} />
            </Card>
          </div>
          <Card title="Course workload" icon={GraduationCap}><CourseGrid d={d} /></Card>
          {d.goals.some(g => g.area === 'academics') && (
            <Card title="Academic goals" icon={Target}>
              {d.goals.filter(g => g.area === 'academics').map(g => <div key={g.id} className="li click" onClick={() => openEditor('goal', { id: g.id })}><span className="grow">{g.title}</span><span style={{ width: 120 }}><Meter value={goalProgress(d, g)} /></span><span className="num small">{goalProgress(d, g)}%</span></div>)}
            </Card>
          )}
        </div>
      )}

      {tab === 'courses' && (
        <div className="g">
          <CourseGrid d={d} />
          <Btn icon={Plus} onClick={() => openEditor('course')} style={{ justifySelf: 'start' }}>Add course</Btn>
        </div>
      )}

      {tab === 'assignments' && (
        <Card className="flat">
          {pending.length === 0 && <Empty icon={FileText} title="No pending assignments" />}
          <div className="list">{pending.map(t => <TaskRow key={t.id} t={t} d={d} />)}</div>
          <div className="label" style={{ margin: '18px 6px 6px' }}>Completed</div>
          <div className="list">{topTasks(d).filter(t => (t.kind === 'assignment' || t.kind === 'lab') && isDone(t)).slice(0, 20).map(t => <TaskRow key={t.id} t={t} d={d} />)}</div>
        </Card>
      )}

      {tab === 'exams' && (
        <Card className="flat" actions={<Btn size="sm" icon={Plus} onClick={() => openEditor('exam')}>Exam</Btn>} title="Exams">
          {d.exams.length === 0 && <Empty icon={GraduationCap} title="No exams yet" />}
          <ExamList d={d} exams={[...d.exams].sort((a, b) => a.date.localeCompare(b.date))} />
        </Card>
      )}

      {tab === 'study' && <StudyLog d={d} />}
    </div>
  );
}

function ExamList({ d, exams }: { d: DB; exams: DB['exams'] }) {
  const T = today();
  return (
    <div className="list">
      {exams.map(e => {
        const c = d.courses.find(x => x.id === e.courseId);
        const n = diffDays(e.date, T);
        const risky = n >= 0 && n <= 7 && e.prep < 60;
        return (
          <div key={e.id} className="li" style={{ opacity: n < 0 ? 0.55 : 1 }}>
            <div style={{ width: 44, textAlign: 'center' }}><div className={`bold num ${risky ? 'warn' : ''}`}>{n < 0 ? 'done' : `${n}d`}</div><div className="tiny muted">{shortDate(e.date)}</div></div>
            <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => openEditor('exam', { id: e.id })}>
              <div className="title ellipsis"><span className="swatch" style={{ background: c?.color, marginRight: 6 }} />{e.type} · {c?.name ?? 'General'}</div>
              <div className="tiny muted ellipsis">{c?.code}{e.syllabus ? ` · ${e.syllabus}` : ''}</div>
            </button>
            <div style={{ width: 150 }} className="row">
              <input type="range" min={0} max={100} step={5} value={e.prep} onChange={ev => update('exams', e.id, { prep: Number(ev.target.value) })} aria-label="Preparation" />
              <span className="num small" style={{ width: 34 }}>{e.prep}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CourseGrid({ d }: { d: DB }) {
  const T = today();
  if (!d.courses.length) return <Empty icon={GraduationCap} title="No courses yet" action={<Btn icon={Plus} onClick={() => openEditor('course')}>Add course</Btn>} />;
  return (
    <div className="g g3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
      {d.courses.map(c => {
        const pend = topTasks(d).filter(t => t.courseId === c.id && !isDone(t)).length;
        const ex = d.exams.filter(e => e.courseId === c.id && e.date >= T).sort((a, b) => a.date.localeCompare(b.date))[0];
        const att = attendance(d, c.id);
        return (
          <button key={c.id} className="card hover" style={{ textAlign: 'left', borderTop: `3px solid ${c.color}` }} onClick={() => nav(`/academics?course=${c.id}`)}>
            <div className="tiny muted num">{c.code} · {c.credits ?? '–'} cr · {c.type}</div>
            <div className="bold ellipsis" style={{ fontSize: 15, marginTop: 2 }}>{c.name}</div>
            <div className="tiny muted ellipsis">{c.faculty}</div>
            <div className="g g3 mt12" style={{ gap: 6 }}>
              <div><div className="tiny muted">Pending</div><div className={`num bold ${pend ? '' : 'muted'}`}>{pend}</div></div>
              <div><div className="tiny muted">Study 7d</div><div className="num bold">{fmtDur(studyMin(d, addDays(T, -6), T, c.id))}</div></div>
              <div><div className="tiny muted">Attend.</div><div className={`num bold ${att.pct !== undefined && att.pct < 75 ? 'bad' : ''}`}>{att.pct !== undefined ? `${att.pct}%` : '—'}</div></div>
            </div>
            {ex && <div className="mt8"><Pill tone={diffDays(ex.date, T) <= 7 ? 'warn' : 'outline'}>{ex.type} in {diffDays(ex.date, T)}d · prep {ex.prep}%</Pill></div>}
          </button>
        );
      })}
    </div>
  );
}

function CourseDetail({ c }: { c: Course }) {
  const d = useDB();
  const T = today();
  const slots = d.blocks.filter(b => b.courseId === c.id && b.repeat?.length);
  const tasks = topTasks(d).filter(t => t.courseId === c.id).sort(taskSort);
  const exams = d.exams.filter(e => e.courseId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = d.study.filter(s => s.courseId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const notes = d.notes.filter(n => n.courseId === c.id);
  const att = attendance(d, c.id);
  return (
    <div className="page">
      <Btn variant="ghost" icon={ArrowLeft} onClick={() => nav('/academics')}>Academics</Btn>
      <div className="page-head mt8" style={{ borderLeft: `4px solid ${c.color}`, paddingLeft: 14 }}>
        <div><div className="eyebrow">{c.code} · {c.credits ?? '–'} credits · {c.type}</div><h1>{c.name}</h1><div className="sub">{c.faculty}</div></div>
        <div className="row wrap">
          <Btn onClick={() => openEditor('course', { id: c.id })}>Edit</Btn>
          <Btn icon={Timer} onClick={() => { startTimer({ kind: 'focus', link: { courseId: c.id, label: c.name } }); nav('/focus'); }}>Focus</Btn>
          <Btn variant="primary" icon={Plus} onClick={() => openCapture('assignment', { courseId: c.id })}>Assignment</Btn>
        </div>
      </div>
      <div className="g g4">
        <Card><Stat k="Study, 7 days" v={fmtDur(studyMin(d, addDays(T, -6), T, c.id))} d={`${fmtDur(studyMin(d, '0000-01-01', T, c.id))} total`} /></Card>
        <Card><Stat k="Attendance" v={att.pct !== undefined ? `${att.pct}%` : '—'} d={`${att.att} attended · ${att.miss} missed`} tone={att.pct !== undefined && att.pct < 75 ? 'bad' : 'good'} /></Card>
        <Card><Stat k="Pending" v={tasks.filter(t => !isDone(t)).length} d={`${tasks.filter(isDone).length} completed`} /></Card>
        <Card><Stat k="Next exam" v={exams.find(e => e.date >= T) ? `${diffDays(exams.find(e => e.date >= T)!.date, T)}d` : '—'} d={exams.find(e => e.date >= T)?.type} /></Card>
      </div>
      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Weekly timetable" icon={UserCheck} actions={<Btn size="sm" icon={Plus} onClick={() => openEditor('block', { defaults: { title: c.name, kind: 'class', courseId: c.id, repeat: [1], start: 9 * 60, end: 9 * 60 + 50, date: weekStart(T) } })}>Class slot</Btn>}>
          {slots.length === 0 && <div className="small muted">Add the weekly class slots — they appear in your planner and track attendance.</div>}
          {slots.map(b => (
            <div key={b.id} className="li click" onClick={() => openEditor('block', { id: b.id })}>
              <span className="row gap-4">{[1, 2, 3, 4, 5, 6, 0].map(n => <span key={n} className="num tiny" style={{ width: 14, textAlign: 'center', color: b.repeat!.includes(n) ? 'var(--text)' : 'var(--line-2)' }}>{WEEKDAY_LETTERS[n]}</span>)}</span>
              <span className="grow num small">{fmtTime(b.start)}–{fmtTime(b.end)}</span>
              <span className="small muted">{b.location}</span>
              <Pill>{b.kind}</Pill>
            </div>
          ))}
        </Card>
        <Card title="Assignments & labs" icon={FileText}>
          {tasks.length === 0 ? <Empty title="Nothing yet" /> : <div className="list">{tasks.map(t => <TaskRow key={t.id} t={t} d={d} hideCourse />)}</div>}
        </Card>
        <Card title="Exams" icon={GraduationCap} actions={<Btn size="sm" icon={Plus} onClick={() => openEditor('exam', { defaults: { courseId: c.id } })}>Exam</Btn>}>
          {exams.length ? <ExamList d={d} exams={exams} /> : <div className="small muted">No exams.</div>}
        </Card>
        <Card title="Study sessions" icon={BookOpen} actions={<Btn size="sm" icon={Plus} onClick={() => openCapture('study', { courseId: c.id })}>Session</Btn>}>
          <div className="list">{sessions.slice(0, 8).map(s => (
            <div key={s.id} className="li click" onClick={() => openEditor('study', { id: s.id })}><span className="num small muted" style={{ width: 54 }}>{shortDate(s.date)}</span><span className="grow small">{s.topic || s.type}</span><span className="num small">{fmtDur(s.min)}</span></div>
          ))}</div>
          {sessions.length === 0 && <div className="small muted">No sessions logged.</div>}
        </Card>
        {(notes.length > 0 || c.notes) && (
          <Card title="Notes" className="full">
            {c.notes && <p className="small dim">{c.notes}</p>}
            {notes.map(n => <div key={n.id} className="li click" onClick={() => openEditor('note', { id: n.id })}><span className="small grow">{n.title ? <b>{n.title}: </b> : null}{n.body}</span></div>)}
          </Card>
        )}
      </div>
    </div>
  );
}

function StudyLog({ d }: { d: DB }) {
  const rows = [
    ...d.study.map(s => ({ id: s.id, date: s.date, min: s.min, what: s.topic || s.type, courseId: s.courseId, kind: 'study' as const })),
    ...d.focus.filter(f => f.courseId).map(f => ({ id: f.id, date: f.date, min: f.min, what: `Focus · ${f.label ?? ''}`, courseId: f.courseId, kind: 'focus' as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  return (
    <Card className="flat" title="Study log" actions={<Btn size="sm" icon={Plus} onClick={() => openCapture('study')}>Session</Btn>}>
      {rows.length === 0 && <Empty icon={BookOpen} title="No study logged yet" />}
      <div className="list">
        {rows.map(r => {
          const c = d.courses.find(x => x.id === r.courseId);
          return (
            <div key={r.id} className="li click" onClick={() => r.kind === 'study' && openEditor('study', { id: r.id })}>
              <span className="num small muted" style={{ width: 70 }}>{niceDate(r.date)}</span>
              {c && <Pill color={c.color}>{c.code}</Pill>}
              <span className="grow small ellipsis">{r.what}</span>
              <span className="num small">{fmtDur(r.min)}</span>
              <IconBtn icon={Trash2} sm label="Delete" className="hover-show" onClick={e => { e.stopPropagation(); remove(r.kind === 'study' ? 'study' : 'focus', r.id, 'Session deleted'); }} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
