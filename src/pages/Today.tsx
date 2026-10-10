import { useMemo, useState } from 'react';
import {
  Bed, CalendarClock, Check, CheckSquare, Droplet, Dumbbell, Flame, Leaf, Minus, Moon, NotebookPen, Play, Plus, Rocket, Star,
  Sunrise, TriangleAlert, Info, Utensils, Feather, ClipboardCheck, Hourglass, X,
} from 'lucide-react';
import { add, dayLog, update, useDB } from '../lib/store.ts';
import { addDays, fmtDur, fmtTime, longDate, nowMin, parseTime, today } from '../lib/dates.ts';
import {
  activeHabits, blocksOn, dayProgress, habitDone, habitStreak, isDone, journalOn, mealsOn, proteinOn, sleepLeft, sleepMin, sleepOn,
  sleepStats, tasksForDay, taskSort, warnings, xpTotals, buddyLines,
} from '../lib/derive.ts';
import { AREAS, MEAL_SLOTS, WORKOUT_TYPES, kindColor } from '../lib/meta.ts';
import { addTop3, addWater, pinTop3, quickTask, toggleBlockDone, toggleHabit, toggleTask } from '../lib/actions.ts';
import { startTimer } from '../lib/focus.ts';
import { PixelScene, Buddy } from '../components/pixel.tsx';
import { Btn, Card, CheckBox, Empty, IconBtn, Meter, Pill, QuickAdd, Ring, nav, useNow, MoodPick } from '../components/ui.tsx';
import { TaskRow, UpcomingList, upcomingItems, ProjectAttention } from '../components/rows.tsx';
import { autoHabitAction, openCapture, openEditor } from '../components/editors.tsx';
import { IconOf, WORKOUT_ICON, BLOCK_ICON } from '../components/icons.tsx';

const greeting = (h: number) => (h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night');

export default function Today() {
  const d = useDB();
  const now = useNow(15000);
  const T = today();
  const xp = xpTotals(d);
  const prog = dayProgress(d, T);
  const ws = useMemo(() => warnings(d, now), [d, now]);
  const h = now.getHours();

  return (
    <div className="page">
      <div className="banner" style={{ marginBottom: 'var(--gap)' }}>
        {d.settings.banner && <PixelScene seed={11} animate={d.settings.motion} />}
        <div className="banner-over">
          <div>
            <div className="greet">{greeting(h).toUpperCase()}, {d.settings.name.toUpperCase()}</div>
            <h1 style={{ marginTop: 6 }}>{longDate(T)}</h1>
          </div>
          <div className="row gap-16">
            <div className="clock num hide-m">{String(h).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</div>
            <Ring value={prog.pct} size={58} stroke={5}>
              <div><div className="bold num" style={{ fontSize: 14 }}>{prog.pct}%</div><div className="tiny muted" style={{ fontSize: 9 }}>today</div></div>
            </Ring>
            <button className="col gap-4 hide-m" style={{ alignItems: 'center' }} onClick={() => nav('/home')}>
              <Buddy level={xp.level} size={40} accent={d.settings.accent} lines={buddyLines(d, now)} side="left" />
              <span className="lvl">+{xp.today} XP</span>
            </button>
          </div>
        </div>
      </div>

      {ws.length > 0 && (
        <div className="g g3 warn-row" style={{ marginBottom: 'var(--gap)' }}>
          {ws.slice(0, 3).map(w => {
            const I = w.level === 'info' ? Info : TriangleAlert;
            return <a key={w.key} href={w.to ? '#' + w.to : undefined} className={`warn-item ${w.level}`}><I /><span>{w.text}</span></a>;
          })}
        </div>
      )}

      <div className="g" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', alignItems: 'start' }}>
        <div className="g">
          <SleepCard />
          <Top3Card />
          <TasksCard />
        </div>
        <div className="g">
          <ScheduleCard />
          <Card title="Upcoming" icon={CalendarClock} actions={<Btn size="sm" variant="ghost" onClick={() => nav('/week')}>Week</Btn>}>
            {(() => { const u = upcomingItems(d, 10); return u.length ? <UpcomingList items={u} limit={6} /> : <Empty title="Nothing due in the next 10 days" />; })()}
          </Card>
          <Card title="Projects needing attention" icon={Rocket} actions={<Btn size="sm" variant="ghost" onClick={() => nav('/projects')}>All</Btn>}>
            <ProjectAttention d={d} />
          </Card>
        </div>
        <div className="g">
          <HabitsCard />
          <FuelCard />
          <MoveMindCard />
          <NotesCard />
          <ReviewCard />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sleep
function SleepCard() {
  const d = useDB();
  const T = today();
  const log = sleepOn(d, T);
  const s = d.settings;
  const target = s.sleepTarget * 60;
  const week = sleepStats(d, addDays(T, -6), T);
  const tonight = sleepLeft(d, T);
  const [bed, setBed] = useState(fmtTime(s.bedtime));
  const [wake, setWake] = useState(fmtTime(s.wake));
  const quickMin = sleepMin({ bed: parseTime(bed), wake: parseTime(wake) });
  return (
    <Card title="Sleep" icon={Moon} actions={<Btn size="sm" variant="ghost" onClick={() => nav('/sleep')}>History</Btn>}>
      {log ? (
        <div className="row between">
          <div>
            <div className="row">
              <span className="hero-num" style={{ fontSize: 36 }}>{fmtDur(sleepMin(log))}</span>
              {sleepMin(log) >= target ? <Pill tone="good"><Check />on target</Pill> : <Pill tone="bad">{fmtDur(target - sleepMin(log))} short</Pill>}
            </div>
            <div className="small muted mt4 num">{fmtTime(log.bed)} → {fmtTime(log.wake)} · 7-day avg {fmtDur(week.avg)}</div>
          </div>
          <IconBtn icon={NotebookPen} label="Edit sleep log" onClick={() => openEditor('sleep', { id: log.id })} />
        </div>
      ) : (
        <form className="col" onSubmit={e => { e.preventDefault(); add('sleep', { date: T, bed: parseTime(bed), wake: parseTime(wake) }); }}>
          <div className="small dim">How did you sleep last night?</div>
          <div className="row wrap">
            <label className="row gap-4"><Bed size={15} className="muted" /><input className="input" type="time" value={bed} onChange={e => setBed(e.target.value)} style={{ width: 110 }} aria-label="Bedtime" /></label>
            <label className="row gap-4"><Sunrise size={15} className="muted" /><input className="input" type="time" value={wake} onChange={e => setWake(e.target.value)} style={{ width: 110 }} aria-label="Wake time" /></label>
            <span className={`num bold ${quickMin >= target ? 'good' : 'warn'}`}>{fmtDur(quickMin)}</span>
            <Btn variant="primary" type="submit">Log</Btn>
          </div>
        </form>
      )}
      <div className="hr" />
      <div className={`row small ${tonight.short ? 'bad' : 'muted'}`}>
        <Hourglass size={14} />
        <span className="grow">Tonight: {fmtTime(tonight.start)} → {fmtTime(tonight.end)} leaves <b className="num">{fmtDur(tonight.min)}</b> for sleep</span>
        {tonight.short && <Btn size="sm" onClick={() => nav('/week')}>Fix plan</Btn>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ top 3
function Top3Card() {
  const d = useDB();
  const T = today();
  const ids = dayLog(d, T).top3;
  const tasks = ids.map(id => d.tasks.find(t => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const suggestions = d.tasks.filter(t => !t.parentId && !isDone(t) && !ids.includes(t.id) && t.due && t.due <= addDays(T, 2)).sort(taskSort).slice(0, 3);
  return (
    <Card title="Top 3" icon={Star} actions={<span className="tiny muted">{tasks.filter(isDone).length}/{Math.max(3, tasks.length)} done</span>}>
      <div className="list">
        {tasks.map((t, i) => (
          <div key={t.id} className={`li ${isDone(t) ? 'done' : ''}`}>
            <span className="num bold" style={{ width: 16, color: isDone(t) ? 'var(--muted)' : 'var(--accent)' }}>{i + 1}</span>
            <CheckBox on={isDone(t)} onChange={() => toggleTask(t)} label={t.title} lg />
            <button className="grow title ellipsis" style={{ textAlign: 'left', fontSize: 15 }} onClick={() => openEditor('task', { id: t.id })}>{t.title}</button>
            <IconBtn icon={X} sm label="Unpin" className="hover-show" onClick={() => pinTop3(T, t.id)} />
          </div>
        ))}
      </div>
      {tasks.length < 3 && (
        <div className="col mt8">
          <QuickAdd placeholder={tasks.length ? 'Add another priority' : 'What are the 3 things that matter today?'} onAdd={t => addTop3(T, t)} icon={Star} />
          {suggestions.length > 0 && (
            <div className="chips">
              {suggestions.map(t => <button key={t.id} className="chip" onClick={() => pinTop3(T, t.id)}><Plus />{t.title.length > 32 ? t.title.slice(0, 32) + '…' : t.title}</button>)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ tasks
function TasksCard() {
  const d = useDB();
  const T = today();
  const top3 = dayLog(d, T).top3;
  const all = tasksForDay(d, T).filter(t => !top3.includes(t.id)).sort(taskSort);
  const open = all.filter(t => !isDone(t));
  const done = all.filter(isDone);
  const [showDone, setShowDone] = useState(false);
  return (
    <Card title="Tasks" icon={CheckSquare} actions={<><span className="tiny muted">{open.length} open</span><Btn size="sm" variant="ghost" onClick={() => nav('/tasks')}>All</Btn></>}>
      {open.length === 0 && done.length === 0 && <Empty title="No tasks due today" hint="Enjoy it, or pull something forward." />}
      <div className="list">{open.slice(0, 8).map(t => <TaskRow key={t.id} t={t} d={d} top3={top3} />)}</div>
      {open.length > 8 && <Btn size="sm" variant="ghost" onClick={() => nav('/tasks')}>+{open.length - 8} more</Btn>}
      {done.length > 0 && (
        <>
          <button className="tiny muted mt8" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} {done.length} done today</button>
          {showDone && <div className="list">{done.map(t => <TaskRow key={t.id} t={t} d={d} />)}</div>}
        </>
      )}
      <div className="mt8"><QuickAdd placeholder="Add task for today  (try: 'email prof !1 #research')" onAdd={t => quickTask(t, { due: T })} /></div>
    </Card>
  );
}

// ------------------------------------------------------------------ schedule
function ScheduleCard() {
  const d = useDB();
  useNow(30000);
  const T = today();
  const nm = nowMin();
  const insts = blocksOn(d, T).filter(i => i.block.kind !== 'sleep');
  const nextIdx = insts.findIndex(i => i.end > nm);
  return (
    <Card title="Schedule" icon={CalendarClock} actions={<><IconBtn icon={Plus} sm label="Add block" onClick={() => openEditor('block', { defaults: { date: T, start: Math.min(1380, Math.ceil(nm / 30) * 30), end: Math.min(1440, Math.ceil(nm / 30) * 30 + 60) } })} /><Btn size="sm" variant="ghost" onClick={() => nav('/calendar?view=day')}>Day view</Btn></>}>
      {insts.length === 0 && <Empty icon={CalendarClock} title="Nothing scheduled" hint="Block time for what matters." action={<Btn size="sm" icon={Plus} onClick={() => openEditor('block', { defaults: { date: T } })}>Time block</Btn>} />}
      {insts.map((i, idx) => {
        const isNow = i.start <= nm && nm < i.end;
        const past = i.end <= nm;
        const Icon = BLOCK_ICON[i.block.kind];
        const color = d.courses.find(c => c.id === i.block.courseId)?.color ?? kindColor(i.block.kind);
        const focusable = ['study', 'class', 'project', 'hackathon'].includes(i.block.kind) && !past;
        const mindful = i.block.kind === 'mindful' && !past;
        return (
          <div key={i.key} className={`sched-item ${isNow ? 'now' : ''} ${past && !isNow ? 'past' : ''} ${i.done ? 'done' : ''}`} style={{ ['--c' as string]: color }}>
            <span className="t">{fmtTime(i.start)}</span>
            <span className="bar" />
            <button className="body" style={{ textAlign: 'left' }} onClick={() => openEditor('block', { id: i.block.id, instDate: T })}>
              <div className="ttl bold ellipsis">{i.block.title}</div>
              <div className="tiny muted ellipsis">
                {fmtTime(i.start)}–{fmtTime(i.end)}{i.block.location ? ` · ${i.block.location}` : ''}
                {isNow && <span className="accent"> · now, {fmtDur(i.end - nm)} left</span>}
                {!isNow && idx === nextIdx && <span className="accent"> · next in {fmtDur(i.start - nm)}</span>}
              </div>
            </button>
            <div className="row gap-4">
              {focusable && <IconBtn icon={Play} sm label="Start focus for this block" onClick={() => { startTimer({ kind: 'focus', workMin: Math.max(15, Math.min(90, isNow ? i.end - nm : i.end - i.start)), breakMin: 5, link: { courseId: i.block.courseId, projectId: i.block.projectId, taskId: i.block.taskId, label: i.block.title } }); nav('/focus'); }} />}
              {mindful && <IconBtn icon={Leaf} sm label="Start meditation" onClick={() => nav('/mind')} />}
              <CheckBox on={i.done} onChange={() => toggleBlockDone(i)} label={i.block.kind === 'class' ? 'Attended' : 'Done'} round />
              <Icon size={14} className="muted hide-m" />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ------------------------------------------------------------------ habits
function HabitsCard() {
  const d = useDB();
  const T = today();
  const hs = activeHabits(d);
  const done = hs.filter(h => habitDone(d, h, T)).length;
  return (
    <Card title="Habits" icon={Flame} actions={<><span className="tiny muted num">{done}/{hs.length}</span><Btn size="sm" variant="ghost" onClick={() => nav('/habits')}>Grid</Btn></>}>
      {hs.length === 0 && <Empty title="No habits yet" hint="Track only what genuinely matters." action={<Btn size="sm" icon={Plus} onClick={() => openEditor('habit')}>Add habit</Btn>} />}
      <div className="col gap-4">
        {hs.map(h => {
          const on = habitDone(d, h, T);
          const st = habitStreak(d, h, T);
          return (
            <div key={h.id} className="row flame-host" style={{ padding: '3px 2px' }}>
              <CheckBox on={on} onChange={() => (h.auto ? autoHabitAction(h.auto) : toggleHabit(h, T))} label={h.name} round />
              <IconOf name={h.icon} size={14} />
              <span className={`grow ${on ? '' : 'dim'}`}>{h.name}</span>
              {h.auto && !on && <span className="tiny muted">auto</span>}
              {st.cur > 0 && <span className="tiny num" style={{ color: 'var(--serious)' }} title={`${st.cur}-${st.unit} streak`}><span className="flame">🔥</span>{st.cur}{st.unit === 'week' ? 'w' : ''}</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}


// ------------------------------------------------------------------ diet
function FuelCard() {
  const d = useDB();
  const T = today();
  const meals = mealsOn(d, T);
  const protein = proteinOn(d, T);
  const water = dayLog(d, T).water;
  const s = d.settings;
  return (
    <Card title="Fuel" icon={Utensils} actions={<Btn size="sm" variant="ghost" onClick={() => nav('/diet')}>Diet</Btn>}>
      <div className="g g2" style={{ gap: 6 }}>
        {MEAL_SLOTS.map(slot => {
          const m = meals.filter(x => x.slot === slot.k);
          return (
            <button key={slot.k} className="sub-card" style={{ textAlign: 'left', padding: '7px 9px', opacity: m.length ? 1 : 0.8 }}
              onClick={() => (m.length ? openEditor('meal', { id: m[0].id }) : openCapture('meal', { slot: slot.k }))}>
              <div className="row between tiny muted"><span>{slot.label}</span>{m.length ? <Check size={12} className="accent" /> : <Plus size={12} />}</div>
              <div className="small ellipsis">{m.length ? m.map(x => x.food).join(', ') : <span className="muted">Log</span>}</div>
            </button>
          );
        })}
      </div>
      <div className="row mt12 small">
        <span className="muted" style={{ width: 54 }}>Protein</span>
        <Meter value={(protein / s.proteinTarget) * 100} color={protein >= s.proteinTarget ? 'var(--good)' : undefined} />
        <span className="num" style={{ width: 70, textAlign: 'right' }}>{protein}/{s.proteinTarget}g</span>
      </div>
      <div className="row mt8 small">
        <span className="muted" style={{ width: 54 }}>Water</span>
        <div className="row gap-4 grow" aria-label={`${water} of ${s.waterTarget} glasses`}>
          {Array.from({ length: s.waterTarget }, (_, i) => <Droplet key={i} size={15} style={{ color: i < water ? '#4fb6ff' : 'var(--line-2)', fill: i < water ? '#4fb6ff' : 'none' }} />)}
        </div>
        <IconBtn icon={Minus} sm label="Remove a glass" onClick={() => addWater(T, -1)} />
        <IconBtn icon={Plus} sm label="Add a glass" onClick={() => addWater(T, 1)} />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ fitness + mind
function MoveMindCard() {
  const d = useDB();
  const T = today();
  const ws = d.workouts.filter(w => w.date === T);
  const meds = d.meditations.filter(m => m.date === T);
  const journaled = journalOn(d, T).length > 0;
  return (
    <Card title="Move & mind" icon={Dumbbell}>
      {ws.length ? (
        <div className="list">
          {ws.map(w => { const I = WORKOUT_ICON[w.type]; return (
            <div key={w.id} className="li click" onClick={() => openEditor('workout', { id: w.id })}>
              <div className="area-ic" style={{ ['--c' as string]: AREAS.fitness.color, width: 28, height: 28 }}><I /></div>
              <span className="grow">{WORKOUT_TYPES[w.type].label}{w.template ? ` · ${w.template}` : ''}</span>
              <span className="num small muted">{fmtDur(w.min)}{w.km ? ` · ${w.km}km` : ''}</span>
            </div>); })}
        </div>
      ) : (
        <div className="chips">
          {(['gym', 'run', 'basketball', 'walk', 'rest'] as const).map(t => { const I = WORKOUT_ICON[t]; return <button key={t} className="chip" onClick={() => openCapture('workout', { type: t })}><I />{WORKOUT_TYPES[t].label}</button>; })}
        </div>
      )}
      <div className="hr" />
      <div className="row">
        <Leaf size={15} className={meds.length ? 'accent' : 'muted'} />
        <span className="grow small">{meds.length ? `Meditated ${fmtDur(meds.reduce((a, m) => a + m.min, 0))}` : 'No meditation yet'}</span>
        {!meds.length && <Btn size="sm" onClick={() => nav('/mind')}>Breathe 5 min</Btn>}
      </div>
      <div className="row mt8">
        <Feather size={15} className={journaled ? 'accent' : 'muted'} />
        <span className="grow small">{journaled ? 'Journal written' : 'Journal not written'}</span>
        <Btn size="sm" onClick={() => openCapture('journal')}>{journaled ? 'Add' : 'Write'}</Btn>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ notes
function NotesCard() {
  const d = useDB();
  const T = today();
  const notes = d.notes.filter(n => n.pinned || (n.date === T && !n.idea)).slice(-5);
  return (
    <Card title="Quick notes" icon={NotebookPen}>
      <div className="list">
        {notes.map(n => (
          <div key={n.id} className="li click" onClick={() => openEditor(n.idea ? 'idea' : 'note', { id: n.id })}>
            {n.pinned ? <Star size={13} className="warn" /> : <NotebookPen size={13} className="muted" />}
            <span className="grow small ellipsis">{n.title ? <b>{n.title}: </b> : null}{n.body}</span>
          </div>
        ))}
      </div>
      <div className="mt8"><QuickAdd placeholder="Jot something down (goes to Inbox)" onAdd={t => add('notes', { body: t, date: T, inbox: true })} icon={NotebookPen} /></div>
    </Card>
  );
}

// ------------------------------------------------------------------ end of day
function ReviewCard() {
  const d = useDB();
  const T = today();
  const existing = d.reviews.find(r => r.kind === 'day' && r.period === T);
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<Record<string, string>>(existing?.answers ?? {});
  const [rating, setRating] = useState<number | undefined>(existing?.rating);
  const evening = new Date().getHours() >= 18;
  const save = () => {
    if (existing) update('reviews', existing.id, { answers: a, rating, updatedAt: new Date().toISOString() });
    else add('reviews', { kind: 'day', period: T, answers: a, rating });
    setOpen(false);
  };
  if (!evening && !existing && !open) {
    return <Card title="End of day" icon={ClipboardCheck}><div className="row"><span className="grow small muted">Your daily review unlocks this evening.</span><Btn size="sm" variant="ghost" onClick={() => setOpen(true)}>Open now</Btn></div></Card>;
  }
  if (existing && !open) {
    return (
      <Card title="End of day" icon={ClipboardCheck} actions={<Btn size="sm" variant="ghost" onClick={() => setOpen(true)}>Edit</Btn>}>
        <div className="row"><Pill tone="good"><Check />Reviewed</Pill>{existing.rating && <span className="small">{'★'.repeat(existing.rating)}</span>}</div>
        {existing.answers.tomorrow && <p className="small dim mt8">Tomorrow first: {existing.answers.tomorrow}</p>}
      </Card>
    );
  }
  return (
    <Card title="End of day review" icon={ClipboardCheck} className={evening ? '' : ''} style={evening && !existing ? { borderColor: 'var(--accent-line)' } : undefined}>
      <div className="col">
        <div className="row"><span className="small muted grow">How was today?</span><MoodPick value={rating} onChange={setRating} /></div>
        {[['wins', 'What went well?'], ['improve', 'What could be better?'], ['tomorrow', "Tomorrow's first thing"]].map(([k, label]) => (
          <input key={k} className="input" placeholder={label} value={a[k] ?? ''} onChange={e => setA({ ...a, [k]: e.target.value })} />
        ))}
        <div className="row end"><Btn variant="ghost" onClick={() => setOpen(false)}>Later</Btn><Btn variant="primary" onClick={save}>Close the day</Btn></div>
      </div>
    </Card>
  );
}
