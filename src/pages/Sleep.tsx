import { Bed, CalendarDays, Moon, Plus, TriangleAlert, TrendingUp, Hourglass } from 'lucide-react';
import { useDB } from '../lib/store.ts';
import { addDays, fmtDur, fmtTime, monthStart, niceDate, range, shortDate, today, weekStart, dow } from '../lib/dates.ts';
import { sleepLeft, sleepMin, sleepOn, sleepStats } from '../lib/derive.ts';
import { SLEEP_COLOR } from '../lib/meta.ts';
import { Btn, Card, Empty, Pill, Stat, Seg, usePref, nav } from '../components/ui.tsx';
import { Bars, Heatmap } from '../components/charts.tsx';
import { openCapture, openEditor } from '../components/editors.tsx';

// Status colors carry meaning here (below target = problem), always with a legend + tooltip text.
const statusFill = (min: number, target: number) => (min >= target ? 'var(--good)' : min >= target - 60 ? 'var(--warn)' : 'var(--bad)');

export default function SleepPage() {
  const d = useDB();
  const T = today();
  const s = d.settings;
  const target = s.sleepTarget * 60;
  const [span, setSpan] = usePref<number>('sleep.span', 30);
  const last = sleepOn(d, T);
  const wk = sleepStats(d, addDays(T, -6), T);
  const mo = sleepStats(d, addDays(T, -29), T);
  const month = sleepStats(d, monthStart(T), T);
  const days = range(addDays(T, -(span - 1)), T);
  const heat = range(weekStart(addDays(T, -7 * 17)), addDays(weekStart(T), 6));
  const nights = range(T, addDays(T, 6)).map(x => ({ x, l: sleepLeft(d, x) }));
  const routine = sleepLeft({ ...d, blocks: [] }, T).min;

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · sleep</div><h1>Sleep</h1><div className="sub">Target {s.sleepTarget}h minimum · routine {fmtTime(s.bedtime)} → {fmtTime(s.wake)} ({fmtDur(routine)})</div></div>
        <Btn variant="primary" icon={Plus} onClick={() => openCapture('sleep')}>Log sleep</Btn>
      </div>
      {routine < target && <div className="warn-item bad" style={{ marginBottom: 'var(--gap)' }}><TriangleAlert />Your planned routine itself only allows {fmtDur(routine)}. Adjust bedtime or wake time in Settings.</div>}

      <div className="g g4">
        <Card>
          <Stat k="Last night" v={last ? fmtDur(sleepMin(last)) : '—'} d={last ? `${fmtTime(last.bed)} → ${fmtTime(last.wake)}` : 'not logged'} tone={last ? (sleepMin(last) >= target ? 'good' : 'bad') : undefined} big />
          {last && <div className="mt8">{sleepMin(last) >= target ? <Pill tone="good">✓ target met</Pill> : <Pill tone="bad">{fmtDur(target - sleepMin(last))} short</Pill>}</div>}
        </Card>
        <Card><Stat k="7-day average" v={fmtDur(wk.avg)} d={`${wk.good} of ${wk.nights} nights ≥ ${s.sleepTarget}h`} tone={wk.avg >= target ? 'good' : 'warn'} /></Card>
        <Card><Stat k="30-day average" v={fmtDur(mo.avg)} d={`${mo.good} good · ${mo.short} short nights`} /><div className="tiny muted mt4">This month so far: {fmtDur(month.avg)} avg</div></Card>
        <Card><Stat k="Consistency" v={`±${Math.round(mo.spread)}m`} d={`bedtime spread · avg ${fmtTime(mo.bedAvg)}`} tone={mo.spread <= 30 ? 'good' : mo.spread <= 60 ? 'warn' : 'bad'} /><div className="tiny muted mt4">7-day sleep debt: {fmtDur(wk.debt)}</div></Card>
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Sleep trend" icon={TrendingUp} actions={<Seg value={span} onChange={setSpan} options={[{ k: 14, label: '14d' }, { k: 30, label: '30d' }, { k: 90, label: '90d' }]} />} className="span2" style={{ gridColumn: '1 / -1' }}>
          <Bars height={190}
            data={days.map(x => { const l = sleepOn(d, x); const m = l ? sleepMin(l) : 0; return { label: span > 30 ? shortDate(x) : `${dow(x).slice(0, 2)} ${Number(x.slice(8))}`, value: m / 60, color: l ? statusFill(m, target) : undefined, tip: l ? <><b>{fmtDur(m)}</b> <span className="muted">{niceDate(x)} · {fmtTime(l.bed)}→{fmtTime(l.wake)}</span></> : <span className="muted">{niceDate(x)}: not logged</span> }; })}
            fmt={n => `${Math.round(n)}h`} target={{ value: s.sleepTarget, label: `${s.sleepTarget}h target` }} />
          <div className="legend mt8">
            <span><i className="swatch" style={{ background: 'var(--good)' }} />≥ target</span>
            <span><i className="swatch" style={{ background: 'var(--warn)' }} />within 1h</span>
            <span><i className="swatch" style={{ background: 'var(--bad)' }} />more than 1h short</span>
          </div>
        </Card>
        <Card title="History" icon={CalendarDays}>
          <Heatmap days={heat} today={T} cell={x => { const l = sleepOn(d, x); return l ? { fill: statusFill(sleepMin(l), target), tip: `${niceDate(x)}: ${fmtDur(sleepMin(l))}` } : { tip: `${niceDate(x)}: not logged` }; }} />
          <div className="row between tiny muted mt8"><span>{shortDate(heat[0])}</span><span>green ≥ {s.sleepTarget}h · amber within 1h · red short</span></div>
        </Card>
        <Card title="Next 7 nights (from your plan)" icon={Hourglass}>
          <div className="list">
            {nights.map(({ x, l }) => (
              <div key={x} className="li click" onClick={() => nav(`/calendar?view=day&day=${x}`)}>
                <span className="small" style={{ width: 80 }}>{x === T ? 'Tonight' : niceDate(x)}</span>
                <span className="num small muted grow">{fmtTime(l.start)} → {fmtTime(l.end)}</span>
                {l.short ? <Pill tone="bad"><Moon />{fmtDur(l.min)}</Pill> : <Pill tone="good">{fmtDur(l.min)}</Pill>}
              </div>
            ))}
          </div>
          <p className="tiny muted mt8">Late blocks and early starts shrink the window. The planner never counts lost sleep as productivity.</p>
        </Card>
        <Card title="Log" icon={Bed} style={{ gridColumn: '1 / -1' }}>
          {d.sleep.length === 0 && <Empty icon={Moon} title="No sleep logged yet" action={<Btn icon={Plus} onClick={() => openCapture('sleep')}>Log last night</Btn>} />}
          <div className="list">
            {[...d.sleep].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map(l => {
              const m = sleepMin(l);
              return (
                <div key={l.id} className="li click" onClick={() => openEditor('sleep', { id: l.id })}>
                  <span className="small" style={{ width: 90 }}>{niceDate(l.date)}</span>
                  <span className="num small muted" style={{ width: 110 }}>{fmtTime(l.bed)} → {fmtTime(l.wake)}</span>
                  <span className="grow"><span className="meter" style={{ display: 'block', maxWidth: 260 }}><i style={{ width: `${Math.min(100, (m / 600) * 100)}%`, background: statusFill(m, target) }} /></span></span>
                  <span className="num small bold" style={{ width: 60, textAlign: 'right' }}>{fmtDur(m)}</span>
                  <span className="tiny" style={{ width: 70, textAlign: 'right' }}>{l.quality ? '★'.repeat(l.quality) : ''}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <p className="tiny muted mt8" style={{ color: SLEEP_COLOR }}>Sleep ≥ {s.sleepTarget}h earns {s.xp.sleep} XP. Nothing done after bedtime earns XP.</p>
    </div>
  );
}
