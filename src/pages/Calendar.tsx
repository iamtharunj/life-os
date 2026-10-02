import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Area } from '../lib/types.ts';
import { useDB } from '../lib/store.ts';
import { addDays, addMonths, dayNum, DOW, longDate, monthName, monthStart, today, weekDays, weekStart, fmtTime } from '../lib/dates.ts';
import { blocksOn, tasksForDay, isDone } from '../lib/derive.ts';
import { AREAS, BLOCK_KINDS, kindColor } from '../lib/meta.ts';
import { TimeGrid, dayMarkers } from '../components/TimeGrid.tsx';
import { Btn, Card, IconBtn, Seg, nav, useMobile, useQuery, usePref } from '../components/ui.tsx';
import { WeekAgenda } from './Week.tsx';
import { TaskRow } from '../components/rows.tsx';
import { openEditor } from '../components/editors.tsx';

type View = 'day' | 'week' | 'month';

export default function Calendar() {
  const d = useDB();
  const T = today();
  const q = useQuery();
  const mobile = useMobile();
  const [prefView, setPrefView] = usePref<View>('cal.view', 'week');
  const view = (q.get('view') as View) ?? (q.get('day') ? 'day' : prefView);
  const day = q.get('day') ?? T;
  const [hidden, setHidden] = usePref<string[]>('cal.hidden', []);
  const go = (v: View, dd: string) => { setPrefView(v); nav(`/calendar?view=${v}&day=${dd}`); };
  const step = (n: number) => go(view, view === 'day' ? addDays(day, n) : view === 'week' ? addDays(day, 7 * n) : addMonths(day, n));
  const title = view === 'day' ? longDate(day) : view === 'week' ? `${monthName(weekStart(day), true)} ${weekStart(day).slice(0, 4)}` : `${monthName(day, true)} ${day.slice(0, 4)}`;

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Calendar</div><h1>{title}</h1></div>
        <div className="row wrap">
          <Seg value={view} onChange={v => go(v, day)} options={[{ k: 'day', label: 'Day' }, { k: 'week', label: 'Week' }, { k: 'month', label: 'Month' }]} />
          <IconBtn icon={ChevronLeft} label="Previous" onClick={() => step(-1)} />
          <Btn size="sm" onClick={() => go(view, T)}>Today</Btn>
          <IconBtn icon={ChevronRight} label="Next" onClick={() => step(1)} />
          <Btn variant="primary" icon={Plus} onClick={() => openEditor('block', { defaults: { date: day } })}>Event</Btn>
        </div>
      </div>
      <div className="legend" style={{ marginBottom: 12 }}>
        {(Object.entries(AREAS) as [Area, { label: string; color: string }][]).map(([k, a]) => (
          <button key={k} className={`chip ${hidden.includes(k) ? '' : 'on'}`} onClick={() => setHidden(hidden.includes(k) ? hidden.filter(x => x !== k) : [...hidden, k])} aria-pressed={!hidden.includes(k)}>
            <span className="sw" style={{ background: a.color }} />{a.label}
          </button>
        ))}
      </div>

      {view === 'month' && <MonthGrid day={day} hidden={hidden} onPick={dd => go('day', dd)} />}
      {view === 'week' && (mobile ? <WeekAgenda days={weekDays(weekStart(day))} /> : <TimeGrid days={weekDays(weekStart(day))} hideAreas={hidden} />)}
      {view === 'day' && (
        <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1fr) minmax(0, 340px)', alignItems: 'start' }}>
          <TimeGrid days={[day]} hideAreas={hidden} ppm={1.1} />
          <div className="g">
            <Card title="Due & deadlines">
              {dayMarkers(d, day).length === 0 && <div className="small muted">No deadlines.</div>}
              {dayMarkers(d, day).map(m => <div key={m.key} className="li click" onClick={m.open}><span className="swatch" style={{ background: m.color }} /><span className="small grow">{m.label}</span></div>)}
            </Card>
            <Card title="Tasks">
              {tasksForDay(d, day).length === 0 && <div className="small muted">No tasks due.</div>}
              <div className="list">{tasksForDay(d, day).sort((a, b) => Number(isDone(a)) - Number(isDone(b))).map(t => <TaskRow key={t.id} t={t} d={d} date={day} />)}</div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({ day, hidden, onPick }: { day: string; hidden: string[]; onPick: (d: string) => void }) {
  const d = useDB();
  const T = today();
  const first = weekStart(monthStart(day));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const m = day.slice(0, 7);
  return (
    <div className="month">
      {[1, 2, 3, 4, 5, 6, 0].map(i => <div key={i} className="month-dow">{DOW[i]}</div>)}
      {cells.map(c => {
        const ev = blocksOn(d, c).filter(i => i.block.kind !== 'sleep' && !hidden.includes(BLOCK_KINDS[i.block.kind].area));
        const marks = dayMarkers(d, c);
        return (
          <div key={c} className={`month-cell ${c.slice(0, 7) !== m ? 'out' : ''} ${c === T ? 'today' : ''}`} onClick={() => onPick(c)}>
            <span className="dn">{dayNum(c)}</span>
            {marks.slice(0, 2).map(x => <div key={x.key} className="month-ev bold" style={{ ['--c' as string]: x.color }} title={x.label}>{x.label}</div>)}
            {ev.slice(0, Math.max(0, 3 - Math.min(2, marks.length))).map(i => (
              <div key={i.key} className="month-ev" style={{ ['--c' as string]: kindColor(i.block.kind) }} title={`${fmtTime(i.start)} ${i.block.title}`}>{fmtTime(i.start)} {i.block.title}</div>
            ))}
            {ev.length + marks.length > 3 && <div className="tiny muted hide-m">+{ev.length + marks.length - 3}</div>}
          </div>
        );
      })}
    </div>
  );
}
