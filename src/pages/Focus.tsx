import { useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Square, Timer, Moon, History, Trash2 } from 'lucide-react';
import { remove, useDB } from '../lib/store.ts';
import { addDays, fmtDur, monthStart, range, shortDate, today, weekStart, fmtTime, dow } from '../lib/dates.ts';
import { focusMin, isLate, isDone } from '../lib/derive.ts';
import { timer, startTimer, pauseTimer, resumeTimer, stopTimer, remainingMs, running, fmtClock, type FocusLink } from '../lib/focus.ts';
import { PixelScene } from '../components/pixel.tsx';
import { Btn, Card, IconBtn, Ring, Seg, Stat, useNow } from '../components/ui.tsx';
import { Bars } from '../components/charts.tsx';

type LinkKind = 'general' | 'course' | 'project' | 'task';

export default function Focus() {
  const d = useDB();
  const s = timer.use();
  const now = useNow(250);
  const T = today();
  const [preset, setPreset] = useState<string>(s.workMin === 50 ? '50' : s.workMin === 25 ? '25' : 'custom');
  const [work, setWork] = useState(s.workMin);
  const [brk, setBrk] = useState(s.breakMin);
  const [kind, setKind] = useState<LinkKind>(s.link.courseId ? 'course' : s.link.projectId ? 'project' : s.link.taskId ? 'task' : 'general');
  const [target, setTarget] = useState<string>(s.link.courseId ?? s.link.projectId ?? s.link.taskId ?? '');
  const active = s.kind === 'focus' && s.phase !== 'idle';
  const rem = active ? remainingMs(s, now.getTime()) : work * 60000;
  const total = (s.phase === 'break' ? s.breakMin : active ? s.workMin : work) * 60000;
  const late = isLate(d, now.toISOString());

  const link = (): FocusLink => {
    if (kind === 'course') { const c = d.courses.find(x => x.id === target); return c ? { courseId: c.id, label: c.name } : {}; }
    if (kind === 'project') { const p = d.projects.find(x => x.id === target); return p ? { projectId: p.id, label: p.name } : {}; }
    if (kind === 'task') { const t = d.tasks.find(x => x.id === target); return t ? { taskId: t.id, projectId: t.projectId, courseId: t.courseId, label: t.title } : {}; }
    return { label: 'General focus' };
  };
  const choosePreset = (p: string) => { setPreset(p); if (p === '25') { setWork(25); setBrk(5); } if (p === '50') { setWork(50); setBrk(10); } };

  const ws = weekStart(T);
  const days = range(addDays(T, -13), T);
  const recent = [...d.focus].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8);

  return (
    <div className="page">
      <div className="page-head"><div><div className="eyebrow">Execute</div><h1>Focus</h1><div className="sub">One thing. Timer running. Phone away.</div></div></div>
      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="focus-stage">
          <PixelScene seed={23} height={120} hour={s.phase === 'break' ? 12 : 22} animate={d.settings.motion} />
          <div className="focus-inner">
            <div className="greet">{s.kind === 'focus' && s.phase === 'break' ? 'BREAK' : active ? 'FOCUS' : 'READY'}{s.cycles ? ` · ROUND ${s.cycles + (s.phase === 'work' ? 1 : 0)}` : ''}</div>
            <Ring value={active ? ((total - rem) / total) * 100 : 0} size={260} stroke={6} track="rgba(255,255,255,.08)">
              <div>
                <div className="focus-time">{fmtClock(rem)}</div>
                <div className="small dim mt8 ellipsis" style={{ maxWidth: 210, margin: '8px auto 0' }}>{active ? s.link.label ?? 'General focus' : link().label ?? 'Pick what to focus on'}</div>
              </div>
            </Ring>
            <div className="row">
              {!active && <Btn variant="primary" size="lg" icon={Play} onClick={() => startTimer({ kind: 'focus', workMin: work, breakMin: brk, link: link(), cycles: 0 })}>Start focus</Btn>}
              {active && running(s) && <Btn size="lg" icon={Pause} onClick={pauseTimer}>Pause</Btn>}
              {active && !running(s) && <Btn variant="primary" size="lg" icon={Play} onClick={resumeTimer}>Resume</Btn>}
              {active && s.phase === 'work' && <Btn size="lg" icon={Square} onClick={stopTimer} title="Stop (5+ minutes still counts)">Stop</Btn>}
              {active && s.phase === 'break' && <Btn size="lg" icon={SkipForward} onClick={() => startTimer({ kind: 'focus', workMin: s.workMin, breakMin: s.breakMin, link: s.link })}>Skip break</Btn>}
              {active && s.phase === 'break' && <IconBtn icon={RotateCcw} label="End session" onClick={stopTimer} />}
            </div>
            {late && <div className="warn-item warn" style={{ maxWidth: 420 }}><Moon />It's inside your protected sleep window. Sessions now earn no XP — tomorrow-you needs the sleep more.</div>}
          </div>
        </div>

        <div className="g">
          <Card title="Session" icon={Timer}>
            <div className="col gap-12">
              <Seg value={preset} onChange={choosePreset} options={[{ k: '25', label: '25 / 5' }, { k: '50', label: '50 / 10' }, { k: 'custom', label: 'Custom' }]} />
              {preset === 'custom' && (
                <div className="row">
                  <label className="field grow"><span>Focus (min)</span><input className="input num" type="number" min={1} max={180} value={work} onChange={e => setWork(Math.max(1, Number(e.target.value)))} /></label>
                  <label className="field grow"><span>Break (min)</span><input className="input num" type="number" min={0} max={60} value={brk} onChange={e => setBrk(Math.max(0, Number(e.target.value)))} /></label>
                </div>
              )}
              <div className="field"><span>Focus on</span>
                <Seg value={kind} onChange={k => { setKind(k); setTarget(''); }} options={[{ k: 'general', label: 'General' }, { k: 'course', label: 'Course' }, { k: 'project', label: 'Project' }, { k: 'task', label: 'Task' }]} />
              </div>
              {kind !== 'general' && (
                <select className="select" value={target} onChange={e => setTarget(e.target.value)} aria-label="Focus target">
                  <option value="">Choose…</option>
                  {kind === 'course' && d.courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  {kind === 'project' && d.projects.filter(p => !['completed', 'archived'].includes(p.status)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {kind === 'task' && d.tasks.filter(t => !isDone(t) && !t.parentId).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
              {active && <p className="tiny muted">Changes apply to the next session.</p>}
            </div>
          </Card>
          <Card title="Focus time" icon={History}>
            <div className="g g3">
              <Stat k="Today" v={fmtDur(focusMin(d, T, T))} />
              <Stat k="This week" v={fmtDur(focusMin(d, ws, T))} />
              <Stat k="This month" v={fmtDur(focusMin(d, monthStart(T), T))} />
            </div>
            <div className="mt12"><Bars data={days.map(x => ({ label: dow(x).slice(0, 2), value: focusMin(d, x, x), tip: <><b>{fmtDur(focusMin(d, x, x))}</b> <span className="muted">{shortDate(x)}</span></> }))} height={120} fmt={n => `${Math.round(n)}`} /></div>
            <div className="tiny muted">Minutes per day, last 14 days</div>
          </Card>
          <Card title="Recent sessions">
            <div className="list">
              {recent.map(f => (
                <div key={f.id} className="li">
                  <span className="num small muted" style={{ width: 86 }}>{shortDate(f.date)} {fmtTime(new Date(f.start).getHours() * 60 + new Date(f.start).getMinutes())}</span>
                  <span className="grow small ellipsis">{f.label ?? 'Focus'}{f.late && <span className="warn"> · late</span>}</span>
                  <span className="num small">{fmtDur(f.min)}</span>
                  <IconBtn icon={Trash2} sm label="Delete session" className="hover-show" onClick={() => remove('focus', f.id, 'Session deleted')} />
                </div>
              ))}
              {recent.length === 0 && <div className="small muted">No sessions yet.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
