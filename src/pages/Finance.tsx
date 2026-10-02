import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CreditCard, PieChart, Plus, Receipt, Repeat, TrendingUp, Wallet } from 'lucide-react';
import { add, useDB } from '../lib/store.ts';
import { addDays, addMonths, monthName, monthStart, niceDate, range, shortDate, today, weekStart, diffDays } from '../lib/dates.ts';
import { balance, monthFinance, spendIn, upcomingPayments } from '../lib/derive.ts';
import { AREAS } from '../lib/meta.ts';
import { paySubscription } from '../lib/actions.ts';
import { Btn, Card, Chips, Empty, IconBtn, Meter, Pill, Stat, money, plural } from '../components/ui.tsx';
import { HBars, Lines } from '../components/charts.tsx';
import { openEditor } from '../components/editors.tsx';

const C = AREAS.finance.color;

export default function Finance() {
  const d = useDB();
  const T = today();
  const s = d.settings;
  const cur = s.currency;
  const [month, setMonth] = useState(monthStart(T));
  const f = monthFinance(d, month, T);
  const isCurrent = month === monthStart(T);
  const bal = balance(d);
  const ws = weekStart(T);
  const txns = d.txns.filter(t => t.date >= f.from && t.date <= f.to).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const upcoming = upcomingPayments(d, 30);

  // cumulative spend vs budget pace — answers "am I on track this month?"
  const days = range(f.from, f.to);
  let run = 0;
  const cum = days.map(x => (x <= T ? (run += spendIn(d, x, x)) : NaN));
  const shown = days.filter(x => x <= T || !isCurrent);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · finance</div><h1>Finance</h1><div className="sub">Balance {money(bal, cur)} · budget {money(f.budget, cur)}/month</div></div>
        <div className="row">
          <IconBtn icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
          <Btn size="sm" onClick={() => setMonth(monthStart(T))}>{monthName(month, true)}</Btn>
          <IconBtn icon={ChevronRight} label="Next month" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))} />
          <Btn icon={TrendingUp} onClick={() => openEditor('income')}>Income</Btn>
        </div>
      </div>

      <QuickExpense />

      <div className="g g4 mt16">
        <Card><Stat k="Current balance" v={money(bal, cur)} d={`since ${shortDate(s.openingDate)}`} big /></Card>
        <Card>
          <Stat k={`Spent in ${monthName(month)}`} v={money(f.spent, cur)} unit={`/ ${money(f.budget, cur)}`} />
          <div className="mt8"><Meter value={f.usedPct} color={f.usedPct > 100 ? 'var(--bad)' : f.usedPct > f.pacePct + 5 ? 'var(--warn)' : C} /></div>
          <div className="tiny muted mt4">{Math.round(f.usedPct)}% used · {Math.round(f.pacePct)}% of month gone</div>
        </Card>
        <Card><Stat k="Remaining budget" v={money(f.remaining, cur)} d={f.remaining < 0 ? 'over budget — pause non-essentials' : isCurrent ? `≈ ${money(f.safePerDay, cur)}/day for ${plural(f.days - f.elapsed + 1, 'day')}` : 'month closed'} tone={f.remaining < 0 ? 'bad' : 'good'} /></Card>
        <Card><Stat k="This week" v={money(spendIn(d, ws, T), cur)} d={`Saved this month: ${money(f.saved, cur)}`} tone={f.saved >= 0 ? 'good' : 'bad'} /></Card>
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Spending vs budget pace" icon={TrendingUp}>
          <Lines height={180} labels={shown.map(x => shortDate(x))} fmt={n => money(n, cur)}
            series={[{ name: 'Spent (cumulative)', color: C, values: shown.map((_, i) => cum[i]) }, { name: 'Budget pace', color: '#6b7466', values: shown.map((_, i) => (f.budget * (i + 1)) / f.days) }]} />
          <div className="tiny muted mt4">Above the grey line = spending faster than the budget allows.</div>
        </Card>
        <Card title="By category" icon={PieChart}>
          {f.byCat.length === 0 ? <Empty title="No expenses this month" /> : <HBars data={f.byCat.map(c => ({ label: c.cat, value: c.amt }))} fmt={n => money(n, cur)} color={C} />}
          {f.largest.length > 0 && (
            <>
              <div className="hr" />
              <div className="label" style={{ marginBottom: 6 }}>Largest expenses</div>
              {f.largest.slice(0, 3).map(t => <div key={t.id} className="li click" onClick={() => openEditor('expense', { id: t.id })}><span className="grow small">{t.note || t.category}</span><span className="tiny muted">{shortDate(t.date)}</span><span className="num small bold" style={{ width: 70, textAlign: 'right' }}>{money(t.amount, cur)}</span></div>)}
            </>
          )}
        </Card>
        <Card title="Transactions" icon={Receipt}>
          {txns.length === 0 && <Empty title="No transactions" />}
          <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {txns.slice(0, 60).map(t => (
              <div key={t.id} className="li click" onClick={() => openEditor(t.type === 'income' ? 'income' : 'expense', { id: t.id })}>
                {t.type === 'income' ? <ArrowDownRight size={15} className="good" /> : <ArrowUpRight size={15} className="muted" />}
                <div className="grow" style={{ minWidth: 0 }}><div className="small ellipsis">{t.note || t.category}</div><div className="tiny muted">{t.category} · {t.method ?? ''} · {diffDays(T, t.date) < 2 ? (t.date === T ? 'today' : 'yesterday') : niceDate(t.date)}{t.recurring ? ' · recurring' : ''}</div></div>
                <span className={`num small bold ${t.type === 'income' ? 'good' : ''}`}>{t.type === 'income' ? '+' : '−'}{money(t.amount, cur)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Subscriptions & upcoming" icon={Repeat} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openEditor('sub')}>Add</Btn>}>
          {d.subs.length === 0 && <div className="small muted">Track recurring payments here — you'll see them before they hit.</div>}
          <div className="list">
            {[...d.subs].sort((a, b) => a.next.localeCompare(b.next)).map(sub => {
              const n = diffDays(sub.next, T);
              const soon = upcoming.includes(sub);
              return (
                <div key={sub.id} className="li" style={{ opacity: sub.active ? 1 : 0.5 }}>
                  <CreditCard size={15} className="muted" />
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => openEditor('sub', { id: sub.id })}>
                    <div className="small">{sub.name}</div>
                    <div className="tiny muted">{money(sub.amount, cur)} / {sub.cycle.replace('ly', '')} · {n < 0 ? `overdue ${-n}d` : n === 0 ? 'due today' : `in ${n}d`}</div>
                  </button>
                  {soon && sub.active && <Pill tone={n <= 2 ? 'warn' : 'outline'}>{shortDate(sub.next)}</Pill>}
                  {sub.active && <Btn size="sm" onClick={() => paySubscription(sub.id)}>Paid</Btn>}
                </div>
              );
            })}
          </div>
          <div className="hr" />
          <div className="row small"><Wallet size={14} className="muted" /><span className="grow muted">Monthly recurring</span><span className="num bold">{money(d.subs.filter(x => x.active).reduce((a, x) => a + (x.cycle === 'monthly' ? x.amount : x.cycle === 'weekly' ? x.amount * 4.35 : x.amount / 12), 0), cur)}</span></div>
        </Card>
      </div>
      <p className="tiny muted mt8">Past 30 days: {money(spendIn(d, addDays(T, -29), T), cur)} spent.</p>
    </div>
  );
}

function QuickExpense() {
  const d = useDB();
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState<string | undefined>('Food');
  const [note, setNote] = useState('');
  const save = () => {
    const n = Number(amt);
    if (!(n > 0)) return;
    add('txns', { date: today(), amount: n, type: 'expense', category: cat ?? 'Other', method: d.settings.paymentMethods[0], note: note.trim() || undefined });
    setAmt(''); setNote('');
  };
  return (
    <Card className="flat">
      <form className="row wrap" onSubmit={e => { e.preventDefault(); save(); }}>
        <span className="label"><Receipt />Quick expense</span>
        <input className="input num" style={{ width: 110, fontSize: 16, fontWeight: 650 }} inputMode="decimal" placeholder={`${d.settings.currency} 0`} value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Amount" />
        <input className="input" style={{ maxWidth: 220 }} placeholder="What for? (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <div className="grow" style={{ minWidth: 240 }}><Chips value={cat} onChange={setCat} options={d.settings.expenseCategories.map(k => ({ k, label: k }))} /></div>
        <Btn variant="primary" type="submit" icon={Plus}>Add</Btn>
      </form>
    </Card>
  );
}
