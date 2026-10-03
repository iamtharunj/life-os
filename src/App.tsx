import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, CheckSquare, Cloud, CloudOff, Flame, HardDrive, LoaderCircle, Menu, Plus, Search, ShieldCheck, Sun, CalendarDays, TriangleAlert, Info, WifiOff, X, type LucideIcon } from 'lucide-react';
import { confirmReq, gate, storage, sync, toasts, useDB, ready, undo, type SyncState } from './lib/store.ts';
import { CloudGate } from './components/CloudGate.tsx';
import { xpTotals, warnings, levelTitle, buddyLines } from './lib/derive.ts';
import { tickTimer, timer, remainingMs, fmtClock, running } from './lib/focus.ts';
import { EditorHost, openCapture } from './components/editors.tsx';
import { Palette, paletteOpen } from './components/Palette.tsx';
import { NAV } from './components/nav.ts';
import { Btn, IconBtn, Meter, Modal, nav, route, useRoute, useNow } from './components/ui.tsx';
import { Avatar, Buddy } from './components/pixel.tsx';
import { today } from './lib/dates.ts';

import Today from './pages/Today.tsx';
import HomePage from './pages/Home.tsx';
import Tasks from './pages/Tasks.tsx';
import Week from './pages/Week.tsx';
import Calendar from './pages/Calendar.tsx';
import Focus from './pages/Focus.tsx';
import Academics from './pages/Academics.tsx';
import Fitness from './pages/Fitness.tsx';
import SleepPage from './pages/Sleep.tsx';
import Diet from './pages/Diet.tsx';
import Mind from './pages/Mind.tsx';
import Finance from './pages/Finance.tsx';
import Projects from './pages/Projects.tsx';
import Habits from './pages/Habits.tsx';
import Goals from './pages/Goals.tsx';
import Analytics from './pages/Analytics.tsx';
import Reviews from './pages/Reviews.tsx';
import InboxPage from './pages/Inbox.tsx';
import SettingsPage from './pages/Settings.tsx';

const PAGES: Record<string, () => React.ReactNode> = {
  today: Today, home: HomePage, tasks: Tasks, week: Week, calendar: Calendar, focus: Focus, academics: Academics,
  fitness: Fitness, sleep: SleepPage, diet: Diet, mind: Mind, finance: Finance, projects: Projects, habits: Habits,
  goals: Goals, analytics: Analytics, reviews: Reviews, inbox: InboxPage, settings: SettingsPage,
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
};

export default function App() {
  const d = useDB();
  const isReady = ready.use();
  const locked = gate.use();
  const parts = useRoute();
  const Page = PAGES[parts[0] ?? 'today'] ?? Today;
  const [more, setMore] = useState(false);

  // theme + accent from settings
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = d.settings.theme;
    r.dataset.motion = d.settings.motion ? 'on' : 'off';
    r.style.setProperty('--accent', d.settings.accent);
  }, [d.settings.theme, d.settings.accent, d.settings.motion]);

  // timer heartbeat
  useEffect(() => { const t = setInterval(tickTimer, 1000); return () => clearInterval(t); }, []);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.set(!paletteOpen.get()); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTyping(e)) { e.preventDefault(); undo(); return; }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.overlay')) return;
      const k = e.key.toLowerCase();
      if (k === 'c' || k === 'n') { e.preventDefault(); openCapture('task'); }
      else if (k === '/') { e.preventDefault(); paletteOpen.set(true); }
      else if (k === 't') nav('/today');
      else if (k === 'w') nav('/week');
      else if (k === 'f') nav('/focus');
      else if (k === 'h') nav('/home');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // XP gain + level-up feedback (derived XP, so we just watch the total)
  const xp = useMemo(() => xpTotals(d), [d]);
  const prev = useRef<{ total: number; level: number } | null>(null);
  useEffect(() => {
    if (!isReady) return;
    const p = prev.current;
    prev.current = { total: xp.total, level: xp.level };
    if (!p) return;
    const gain = xp.total - p.total;
    if (gain > 0 && gain <= 600) {
      toasts.set(ts => [...ts.slice(-3), { id: String(Math.random()), msg: `+${gain} XP`, kind: 'xp' }]);
      const id = setTimeout(() => toasts.set(ts => ts.filter(t => !(t.kind === 'xp' && t.msg === `+${gain} XP`))), 2200);
      if (xp.level > p.level) toasts.set(ts => [...ts, { id: 'lvl' + xp.level, msg: `Level up! You are now level ${xp.level} · ${levelTitle(xp.level)}`, kind: 'level' }]);
      return () => clearTimeout(id);
    }
  }, [xp.total, xp.level, isReady]);

  const inboxCount = d.notes.filter(n => n.inbox).length;
  const active = '/' + (parts[0] ?? 'today');

  if (locked) return <CloudGate kind={locked.kind} />;
  if (!isReady) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }} className="muted"><LoaderCircle className="spin" /> Loading your Life OS…</div>;

  return (
    <div className="app">
      <aside className="side" aria-label="Navigation">
        <a className="brand" href="#/home">
          <Buddy level={xp.level} size={34} accent={d.settings.accent} lines={buddyLines(d)} down />
          <div className="brand-text">
            <div className="brand-name">LIFE·OS</div>
            <div className="brand-sub">Lv {xp.level} · {levelTitle(xp.level)}</div>
          </div>
        </a>
        <NavList active={active} inboxCount={inboxCount} />
        <div className="side-foot">
          <div className="xp-text" style={{ padding: '0 10px' }}>
            <div className="row between tiny muted"><span>XP to level {xp.level + 1}</span><span className="num">{xp.into}/{xp.need}</span></div>
            <div className="mt4"><Meter value={(xp.into / xp.need) * 100} pixel /></div>
          </div>
          <SyncBadge />
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button className="search-trigger" onClick={() => paletteOpen.set(true)} aria-label="Search and commands">
            <Search size={15} /><span className="grow st" style={{ textAlign: 'left' }}>Search or run a command…</span><span className="kbd">Ctrl K</span>
          </button>
          <div className="grow" />
          <TimerPill />
          <SyncDot />
          <WarningsBell />
          <button className="xp-chip hide-m" onClick={() => nav('/home')} title={`${xp.total} XP total · ${xp.available} available to spend`}>
            <Avatar level={xp.level} size={24} accent={d.settings.accent} />
            <span className="lvl">LV {xp.level}</span>
            <span style={{ width: 70 }}><Meter value={(xp.into / xp.need) * 100} /></span>
          </button>
          <Btn variant="primary" icon={Plus} className="hide-m" onClick={() => openCapture('task')}>Capture <span className="kbd" style={{ background: 'transparent', borderColor: 'rgba(0,0,0,.25)', color: 'inherit' }}>C</span></Btn>
        </header>
        <main key={route.get()}>
          <PageBoundary><Page /></PageBoundary>
        </main>
      </div>

      <button className="fab show-m" onClick={() => openCapture('task')} aria-label="Quick capture"><Plus /><span>Capture</span></button>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <a href="#/today" className={active === '/today' ? 'on' : ''}><Sun />Today</a>
        <a href="#/tasks" className={active === '/tasks' ? 'on' : ''}><CheckSquare />Tasks</a>
        <a href="#/calendar" className={active === '/calendar' ? 'on' : ''}><CalendarDays />Calendar</a>
        <a href="#/habits" className={active === '/habits' ? 'on' : ''}><Flame />Habits</a>
        <button onClick={() => setMore(true)}><Menu />More</button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Life OS">
        <div className="modal-b" onClick={() => setMore(false)}>
          <div className="g g2">
            {NAV.map(n => <a key={n.to} href={'#' + n.to} className={`nav-item ${active === n.to ? 'on' : ''}`}><n.icon /><span>{n.label}</span></a>)}
          </div>
        </div>
      </Modal>

      <EditorHost />
      <Palette />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}


/** A bug on one page shows a message there; navigation, capture and your data keep working. */
class PageBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="eyebrow" style={{ color: 'var(--bad)' }}>Something broke on this page</div>
          <h2 className="mt8">Your data is safe</h2>
          <p className="small dim mt8">This page hit an error while drawing. Other pages still work, and nothing was lost.</p>
          <pre className="tiny muted mt8" style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error.message)}</pre>
          <div className="row mt12"><Btn variant="primary" onClick={() => location.reload()}>Reload</Btn><Btn onClick={() => nav('/tasks')}>Go to Tasks</Btn></div>
        </div>
      </div>
    );
  }
}

function NavList({ active, inboxCount }: { active: string; inboxCount: number }) {
  const groups: [string, typeof NAV][] = [
    ['', NAV.filter(n => n.group === 'main')],
    ['Life', NAV.filter(n => n.group === 'life')],
    ['Reflect', NAV.filter(n => n.group === 'review')],
    ['', NAV.filter(n => n.group === 'system')],
  ];
  return (
    <>
      {groups.map(([label, items], gi) => (
        <div key={gi}>
          {label && <div className="nav-group">{label}</div>}
          {gi === 3 && <div className="hr" />}
          {items.map(n => (
            <a key={n.to} href={'#' + n.to} className={`nav-item ${label === 'Life' ? 'nav-sub' : ''} ${active === n.to ? 'on' : ''}`} title={n.label}>
              <n.icon /><span>{n.label}</span>
              {n.to === '/inbox' && inboxCount > 0 && <span className="badge">{inboxCount}</span>}
            </a>
          ))}
        </div>
      ))}
    </>
  );
}

function useSyncInfo() {
  const s = sync.use();
  const cloud = storage.use() === 'cloud';
  const map: Record<SyncState, [LucideIcon, string, string, string]> = {
    loading: [LoaderCircle, 'Loading…', 'muted', ''],
    saving: [Cloud, cloud ? 'Syncing…' : 'Saving…', 'muted', ''],
    saved: cloud
      ? [ShieldCheck, 'Synced · encrypted', 'good', 'Encrypted on this device before upload. Only your passphrase can read it.']
      : [HardDrive, 'Saved to disk', 'good', 'Stored in data/lifeos.json with daily backups'],
    local: [HardDrive, 'Saved in browser', 'warn', 'No server: data is in this browser only. Export backups regularly.'],
    offline: [WifiOff, 'Offline · saved here', 'warn', 'Changes are kept on this device and sync when you are back online.'],
    error: [CloudOff, 'Save failed — retrying', 'bad', ''],
  };
  const [Icon, label, tone, tip] = map[s];
  return { Icon, label, tone, tip: tip || label };
}
function SyncBadge() {
  const { Icon, label, tone, tip } = useSyncInfo();
  return <div className={`nav-item tiny ${tone}`} title={tip}><Icon /><span>{label}</span></div>;
}
/** Phones have no sidebar, so the top bar carries the sync state as a small icon. */
function SyncDot() {
  const { Icon, tone, tip } = useSyncInfo();
  return <span className={`show-m ${tone}`} title={tip} aria-label={tip} style={{ display: 'inline-grid', placeItems: 'center', width: 26 }}><Icon size={16} /></span>;
}

function TimerPill() {
  const s = timer.use();
  useNow(1000);
  if (s.phase === 'idle') return null;
  return (
    <a className="focus-pill" href={s.kind === 'meditate' ? '#/mind' : '#/focus'} title="Open timer">
      {running(s) && <span className="pulse" />}
      {s.kind === 'meditate' ? 'Meditate' : s.phase === 'break' ? 'Break' : 'Focus'} {fmtClock(remainingMs(s))}
    </a>
  );
}

function WarningsBell() {
  const d = useDB();
  const now = useNow(60000);
  const [open, setOpen] = useState(false);
  const ws = useMemo(() => warnings(d, now), [d, now]);
  const [dismissed, setDismissed] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('lifeos.dismissed.' + today()) ?? '[]'); } catch { return []; } });
  const shown = ws.filter(w => !dismissed.includes(w.key));
  const dismiss = (k: string) => { const n = [...dismissed, k]; setDismissed(n); try { localStorage.setItem('lifeos.dismissed.' + today(), JSON.stringify(n)); } catch { /* ignore */ } };
  const Icon = (l: string) => (l === 'info' ? Info : TriangleAlert);
  return (
    <div style={{ position: 'relative' }}>
      <IconBtn icon={Bell} label={`${shown.length} alerts`} onClick={() => setOpen(!open)} />
      {shown.length > 0 && <span className="badge" style={{ position: 'absolute', top: -3, right: -3, pointerEvents: 'none', background: shown.some(w => w.level === 'bad') ? 'var(--bad)' : 'var(--warn)', color: '#111' }}>{shown.length}</span>}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="card" style={{ position: 'absolute', right: 0, top: 40, width: 'min(380px, calc(100vw - 32px))', zIndex: 41, maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="card-h"><div className="label"><Bell />Heads-up</div></div>
            {shown.length === 0 && <div className="empty"><div className="t">All clear</div><div className="small">Nothing needs your attention right now.</div></div>}
            <div className="col">
              {shown.map(w => {
                const I = Icon(w.level);
                return (
                  <div key={w.key} className={`warn-item ${w.level}`}>
                    <I /><a className="grow" href={w.to ? '#' + w.to : undefined} onClick={() => setOpen(false)}>{w.text}</a>
                    <IconBtn icon={X} sm label="Dismiss for today" onClick={() => dismiss(w.key)} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ConfirmHost() {
  const req = confirmReq.use();
  const [typed, setTyped] = useState('');
  if (!req) return null;
  const done = (ok: boolean) => { req.resolve(ok); confirmReq.set(null); setTyped(''); };
  const blocked = !!req.typeToConfirm && typed !== req.typeToConfirm;
  return (
    <Modal open onClose={() => done(false)} title={req.title} icon={req.danger ? TriangleAlert : undefined}
      footer={<><div className="grow" /><Btn onClick={() => done(false)}>Cancel</Btn><Btn variant={req.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => done(true)}>{req.ok ?? 'Confirm'}</Btn></>}>
      <div className="modal-b col">
        {req.body && <p className="dim">{req.body}</p>}
        {req.typeToConfirm && <label className="field"><span>Type {req.typeToConfirm} to confirm</span><input className="input" autoFocus value={typed} onChange={e => setTyped(e.target.value)} /></label>}
      </div>
    </Modal>
  );
}

function Toasts() {
  const ts = toasts.use();
  return (
    <div className="toasts" aria-live="polite">
      {ts.map(t => (
        <div key={t.id} className={`toast ${t.kind ?? ''}`}>
          {t.kind === 'xp' ? <b>{t.msg}</b> : <span>{t.msg}</span>}
          {t.action && <Btn size="sm" onClick={() => { t.onAction?.(); toasts.set(x => x.filter(y => y.id !== t.id)); }}>{t.action}</Btn>}
        </div>
      ))}
    </div>
  );
}
