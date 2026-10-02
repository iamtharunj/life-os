import { useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Flame, LayoutGrid, Plus, Table, TrendingUp } from 'lucide-react';
import type { DB, Habit } from '../lib/types.ts';
import { update, useDB } from '../lib/store.ts';
import { addDays, addMonths, dayNum, daysInMonth, monthName, monthStart, range, shortDate, today, weekStart, WEEKDAY_LETTERS, weekday, niceDate } from '../lib/dates.ts';
import { activeHabits, habitDone, habitRate, habitStreak, habitsWeekPct } from '../lib/derive.ts';
import { HABIT_AUTO } from '../lib/meta.ts';
import { toggleHabit } from '../lib/actions.ts';
import { Btn, Card, CheckBox, Empty, Pill, Seg, Stat, usePref } from '../components/ui.tsx';
import { Lines } from '../components/charts.tsx';
import { autoHabitAction, openEditor } from '../components/editors.tsx';
import { IconOf } from '../components/icons.tsx';

const HABIT_COLORS = ['#7dff6a', '#4c95ee', '#e8a04a', '#dc5a8c', '#1fae7c', '#9085e9', '#e66767', '#c98500', '#3fb7c9'];
const colorFor = (d: DB, h: Habit) => HABIT_COLORS[d.habits.indexOf(h) % HABIT_COLORS.length];

export default function Habits() {
  const d = useDB();
  const T = today();
  const [view, setView] = usePref<'cards' | 'month'>('habits.view', 'cards');
  const hs = activeHabits(d);
  const ws = weekStart(T);
  const doneToday = hs.filter(h => habitDone(d, h, T)).length;
  const monthPct = hs.length ? Math.round(hs.reduce((a, h) => a + habitRate(d, h, monthStart(T), T), 0) / hs.length) : 0;
  const best = hs.map(h => ({ h, s: habitStreak(d, h, T) })).sort((a, b) => b.s.cur - a.s.cur)[0];
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(ws, -7 * (11 - i)));
  const archived = d.habits.filter(h => h.archived);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · habits</div><h1>Habits</h1><div className="sub">Streaks forgive a single missed day — never miss twice.</div></div>
        <div className="row">
          <Seg value={view} onChange={setView} options={[{ k: 'cards', label: 'Cards', icon: LayoutGrid }, { k: 'month', label: 'Month', icon: Table }]} />
          <Btn variant="primary" icon={Plus} onClick={() => openEditor('habit')}>Habit</Btn>
        </div>
      </div>
      <div className="g g4">
        <Card><Stat k="Today" v={`${doneToday}/${hs.length}`} d={doneToday === hs.length && hs.length ? 'all done ✦' : `${hs.length - doneToday} to go`} tone={doneToday === hs.length ? 'good' : undefined} /></Card>
        <Card><Stat k="This week" v={`${habitsWeekPct(d, ws)}%`} d="of weekly targets" /></Card>
        <Card><Stat k="This month" v={`${monthPct}%`} d="completion" /></Card>
        <Card><Stat k="Longest active streak" v={best ? `${best.s.cur}` : '—'} unit={best ? (best.s.unit === 'week' ? 'weeks' : 'days') : ''} d={best?.h.name} /></Card>
      </div>

      {hs.length === 0 && <Empty icon={Flame} title="No habits yet" hint="Track only what genuinely matters." action={<Btn icon={Plus} onClick={() => openEditor('habit')}>Add habit</Btn>} />}

      {view === 'cards' && (
        <div className="g mt16" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(270px, 100%), 1fr))' }}>
          {hs.map(h => <HabitCard key={h.id} h={h} d={d} />)}
        </div>
      )}
      {view === 'month' && <MonthMatrix d={d} />}

      <Card title="Weekly completion, last 12 weeks" icon={TrendingUp} className="mt16">
        <Lines height={160} labels={weeks.map(w => shortDate(w))} max={100} fmt={n => `${Math.round(n)}%`} series={[{ name: 'Completion', color: 'var(--accent)', values: weeks.map(w => habitsWeekPct(d, w)) }]} />
      </Card>

      {archived.length > 0 && (
        <Card title="Archived" icon={Archive} className="mt16">
          {archived.map(h => <div key={h.id} className="li"><IconOf name={h.icon} /><span className="grow">{h.name}</span><Btn size="sm" onClick={() => update('habits', h.id, { archived: false })}>Restore</Btn></div>)}
        </Card>
      )}
    </div>
  );
}

function HabitCard({ h, d }: { h: Habit; d: DB }) {
  const T = today();
  const st = habitStreak(d, h, T);
  const done = habitDone(d, h, T);
  const ws = weekStart(T);
  const weekCount = range(ws, T).filter(x => habitDone(d, h, x)).length;
  const color = colorFor(d, h);
  const grid = range(addDays(ws, -7 * 11), addDays(ws, 6));
  return (
    <Card className="flat flame-host">
      <div className="row">
        <div className="area-ic" style={{ ['--c' as string]: color }}><IconOf name={h.icon} /></div>
        <button className="grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => openEditor('habit', { id: h.id })}>
          <div className="bold ellipsis">{h.name}</div>
          <div className="tiny muted">{h.freq >= 7 ? 'Daily' : `${h.freq}× per week`}{h.auto ? ' · auto' : ` · ${h.xp} XP`}</div>
        </button>
        <CheckBox on={done} onChange={() => (h.auto ? autoHabitAction(h.auto) : toggleHabit(h, T))} label={`${h.name} today`} lg color={color} />
      </div>
      <div className="row mt12 small">
        <span style={{ color: st.cur ? 'var(--serious)' : 'var(--muted)' }}><span className="flame">🔥</span> {st.cur} {st.unit === 'week' ? 'wk' : 'd'}</span>
        <span className="muted">best {st.best}</span>
        <div className="grow" />
        <span className="num">{Math.min(weekCount, 7)}/{h.freq}</span><span className="tiny muted">this week</span>
      </div>
      <div className="mt8" style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: 3 }}>
        {grid.map(x => {
          const fut = x > T;
          const on = !fut && habitDone(d, h, x);
          return (
            <button key={x} className={`habit-cell ${on ? 'on' : ''} ${fut ? 'fut' : ''} ${x === T ? 'today' : ''}`} style={{ ['--c' as string]: color }}
              disabled={fut || !!h.auto} title={`${niceDate(x)}: ${on ? 'done' : 'not done'}${h.auto ? ' (auto)' : ''}`} onClick={() => toggleHabit(h, x)} aria-label={`${h.name} ${x}`} />
          );
        })}
      </div>
      <div className="row between tiny muted mt8">
        <span>30-day: {habitRate(d, h, addDays(T, -29), T)}%</span>
        {h.auto && <span className="ellipsis" style={{ maxWidth: 170 }} title={HABIT_AUTO[h.auto]}>{HABIT_AUTO[h.auto]}</span>}
      </div>
    </Card>
  );
}

function MonthMatrix({ d }: { d: DB }) {
  const T = today();
  const [m, setM] = useState(monthStart(T));
  const days = range(m, addDays(m, daysInMonth(m) - 1));
  const hs = activeHabits(d);
  return (
    <Card className="mt16" title={`${monthName(m, true)} ${m.slice(0, 4)}`} actions={<><Btn size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setM(addMonths(m, -1))}>Prev</Btn><Btn size="sm" variant="ghost" onClick={() => setM(addMonths(m, 1))} disabled={m >= monthStart(T)}>Next<ChevronRight size={14} /></Btn></>}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 720 }}>
          <thead>
            <tr><th />{days.map(x => <th key={x} className="tiny muted" style={{ fontWeight: 500, width: 20 }}>{WEEKDAY_LETTERS[weekday(x)]}<br />{dayNum(x)}</th>)}<th className="tiny muted">%</th></tr>
          </thead>
          <tbody>
            {hs.map(h => (
              <tr key={h.id}>
                <td className="small ellipsis" style={{ maxWidth: 160, paddingRight: 8 }}>{h.name}{h.auto && <Pill className="hide-m" tone="outline">auto</Pill>}</td>
                {days.map(x => {
                  const fut = x > T;
                  const on = !fut && habitDone(d, h, x);
                  return <td key={x}><button className={`habit-cell ${on ? 'on' : ''} ${fut ? 'fut' : ''} ${x === T ? 'today' : ''}`} style={{ ['--c' as string]: colorFor(d, h), width: 20 }} disabled={fut || !!h.auto} onClick={() => toggleHabit(h, x)} title={`${niceDate(x)}: ${on ? 'done' : '—'}`} aria-label={`${h.name} ${x}`} /></td>;
                })}
                <td className="num small" style={{ paddingLeft: 6 }}>{habitRate(d, h, m, days[days.length - 1] < T ? days[days.length - 1] : T)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted mt8">Click any past day to backfill a manual habit. Auto habits fill themselves from your logs.</p>
    </Card>
  );
}
