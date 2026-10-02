import { useMemo, useState } from 'react';
import { Beef, ChevronLeft, ChevronRight, Droplet, History, Minus, Plus, Utensils, X } from 'lucide-react';
import type { MealSlot } from '../lib/types.ts';
import { add, dayLog, remove, useDB } from '../lib/store.ts';
import { addDays, niceDate, range, shortDate, today, weekStart, dow } from '../lib/dates.ts';
import { dietStats, kcalOn, mealsOn, proteinOn } from '../lib/derive.ts';
import { MEAL_SLOTS } from '../lib/meta.ts';
import { addWater } from '../lib/actions.ts';
import { Btn, Card, IconBtn, Meter, Stat } from '../components/ui.tsx';
import { Bars } from '../components/charts.tsx';
import { openCapture, openEditor } from '../components/editors.tsx';

const QUALITY = ['', 'Poor', 'Okay', 'Good'];

export default function Diet() {
  const d = useDB();
  const T = today();
  const [date, setDate] = useState(T);
  const s = d.settings;
  const meals = mealsOn(d, date);
  const protein = proteinOn(d, date);
  const kcal = kcalOn(d, date);
  const water = dayLog(d, date).water;
  const ws = weekStart(T);
  const week = dietStats(d, ws, T);
  const last14 = range(addDays(T, -13), T);

  // one-tap options per slot: saved mess favourites + what you ate recently
  const options = useMemo(() => {
    const out: Record<string, { name: string; protein?: number }[]> = {};
    for (const slot of MEAL_SLOTS) {
      const m = new Map<string, number | undefined>();
      for (const f of s.foods) if (!f.slot || f.slot === slot.k) m.set(f.name, f.protein);
      for (const x of [...d.meals].reverse()) if (x.slot === slot.k && !x.skipped && !m.has(x.food) && m.size < 8) m.set(x.food, x.protein);
      out[slot.k] = [...m.entries()].map(([name, protein]) => ({ name, protein }));
    }
    return out;
  }, [d.meals, s.foods]);

  const log = (slot: MealSlot, name: string, p?: number) => add('meals', { date, slot, food: name, protein: p, quality: 2 });

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · diet</div><h1>Diet</h1><div className="sub">Mess food, logged in one tap. Approximate is fine.</div></div>
        <div className="row">
          <IconBtn icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDays(date, -1))} />
          <Btn size="sm" onClick={() => setDate(T)}>{date === T ? 'Today' : niceDate(date)}</Btn>
          <IconBtn icon={ChevronRight} label="Next day" disabled={date >= T} onClick={() => setDate(addDays(date, 1))} />
        </div>
      </div>

      <div className="g g4">
        <Card><Stat k="Protein" v={`${protein}`} unit={`/ ${s.proteinTarget} g`} /><div className="mt8"><Meter value={(protein / s.proteinTarget) * 100} color={protein >= s.proteinTarget ? 'var(--good)' : undefined} /></div></Card>
        <Card><Stat k="Calories" v={kcal ? kcal : '—'} unit={kcal ? 'kcal' : ''} d={kcal ? (s.kcalTarget ? `target ${s.kcalTarget}` : 'only meals where you entered them') : 'optional'} /></Card>
        <Card>
          <div className="stat"><div className="k">Water</div>
            <div className="row"><span className="v" style={{ fontSize: 24, fontWeight: 650 }}>{water}</span><span className="muted small">/ {s.waterTarget} glasses</span><div className="grow" /><IconBtn icon={Minus} sm label="Remove a glass" onClick={() => addWater(date, -1)} /><Btn size="sm" icon={Droplet} onClick={() => addWater(date, 1)}>+1</Btn></div>
          </div>
          <div className="mt8"><Meter value={(water / s.waterTarget) * 100} color="#4fb6ff" /></div>
        </Card>
        <Card><Stat k="Meals logged" v={`${new Set(meals.filter(m => !m.skipped).map(m => m.slot)).size}`} unit="/ 4" d={meals.some(m => m.skipped) ? `${meals.filter(m => m.skipped).length} skipped` : undefined} /></Card>
      </div>

      <div className="g g4 mt16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', alignItems: 'start' }}>
        {MEAL_SLOTS.map(slot => {
          const m = meals.filter(x => x.slot === slot.k);
          return (
            <Card key={slot.k} title={slot.label} icon={Utensils} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openCapture('meal', { slot: slot.k, date })}>Other</Btn>}>
              {m.map(x => (
                <div key={x.id} className="li click" onClick={() => openEditor('meal', { id: x.id })}>
                  <div className="grow" style={{ minWidth: 0 }}><div className="title ellipsis">{x.food}</div><div className="tiny muted">{x.skipped ? 'skipped' : `${x.protein ?? '?'}g protein${x.kcal ? ` · ${x.kcal} kcal` : ''}${x.quality ? ` · ${QUALITY[x.quality]}` : ''}`}</div></div>
                  <IconBtn icon={X} sm label="Remove" onClick={e => { e.stopPropagation(); remove('meals', x.id, 'Meal removed'); }} />
                </div>
              ))}
              <div className="chips mt8">
                {options[slot.k].slice(0, 6).map(o => (
                  <button key={o.name} className="chip" onClick={() => log(slot.k, o.name, o.protein)} title="Log in one tap"><Plus />{o.name}{o.protein !== undefined && <span className="tiny muted num">{o.protein}g</span>}</button>
                ))}
                {!m.length && <button className="chip" onClick={() => add('meals', { date, slot: slot.k, food: 'Skipped', skipped: true })}>Skipped</button>}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Protein, last 14 days" icon={Beef}>
          <Bars data={last14.map(x => ({ label: `${dow(x).slice(0, 2)}`, value: proteinOn(d, x), tip: <><b>{proteinOn(d, x)} g</b> <span className="muted">{niceDate(x)} · {mealsOn(d, x).length} meals</span></> }))} height={150} target={{ value: s.proteinTarget, label: `${s.proteinTarget}g` }} fmt={n => `${Math.round(n)}`} />
        </Card>
        <Card title="This week" icon={History}>
          <div className="g g2">
            <Stat k="Avg protein" v={`${Math.round(week.avgProtein)} g`} d={`${week.proteinDays} days on target`} tone={week.avgProtein >= s.proteinTarget ? 'good' : 'warn'} />
            <Stat k="Meal consistency" v={`${week.consistency}%`} d={`${week.meals} meals logged`} />
            <Stat k="Avg water" v={`${week.avgWater.toFixed(1)}`} unit="glasses" tone={week.avgWater >= s.waterTarget ? 'good' : undefined} />
            <Stat k="Incomplete days" v={week.incomplete} d="fewer than 3 meals logged" tone={week.incomplete ? 'warn' : 'good'} />
          </div>
          <div className="hr" />
          <div className="list">
            {range(addDays(T, -6), T).reverse().map(x => {
              const slots = new Set(mealsOn(d, x).filter(m => !m.skipped).map(m => m.slot));
              return (
                <button key={x} className="li click" style={{ width: '100%' }} onClick={() => setDate(x)}>
                  <span className="small" style={{ width: 80, textAlign: 'left' }}>{x === T ? 'Today' : shortDate(x)}</span>
                  <span className="row gap-4 grow">{MEAL_SLOTS.map(sl => <span key={sl.k} title={sl.label} className="swatch" style={{ width: 16, height: 8, background: slots.has(sl.k) ? 'var(--accent)' : 'var(--card-3)' }} />)}</span>
                  <span className="num small" style={{ width: 50, textAlign: 'right' }}>{proteinOn(d, x)}g</span>
                  <span className="num small muted" style={{ width: 40, textAlign: 'right' }}>💧{d.days[x]?.water ?? 0}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
