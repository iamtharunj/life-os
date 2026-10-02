import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, CalendarDays, CheckSquare, Command, Download, Dumbbell, FileText, Flame, GraduationCap, Leaf, Lightbulb,
  Moon, NotebookPen, Receipt, Rocket, Search, Target, Timer, Utensils, CalendarPlus, ClipboardCheck, Feather, type LucideIcon,
} from 'lucide-react';
import { signal, useDB, getDB } from '../lib/store.ts';
import { search, type Hit } from '../lib/derive.ts';
import { openCapture, openEditor, type EditorKind } from './editors.tsx';
import { startTimer } from '../lib/focus.ts';
import { exportData } from '../lib/io.ts';
import { Modal, nav } from './ui.tsx';
import { NAV } from './nav.ts';

export const paletteOpen = signal(false);

interface Cmd { id: string; label: string; icon: LucideIcon; hint?: string; run: () => void; kw?: string }

const cap = (k: EditorKind) => () => openCapture(k);
const COMMANDS: Cmd[] = [
  { id: 'add-task', label: 'Add task', icon: CheckSquare, hint: 'C', run: cap('task'), kw: 'new todo' },
  { id: 'log-workout', label: 'Log workout', icon: Dumbbell, run: cap('workout'), kw: 'gym run basketball exercise' },
  { id: 'log-meal', label: 'Log meal', icon: Utensils, run: cap('meal'), kw: 'food eat protein mess' },
  { id: 'add-expense', label: 'Add expense', icon: Receipt, run: cap('expense'), kw: 'spend money pay' },
  { id: 'start-focus', label: 'Start focus · 25 / 5', icon: Timer, run: () => { startTimer({ kind: 'focus', workMin: 25, breakMin: 5 }); nav('/focus'); }, kw: 'pomodoro timer' },
  { id: 'start-focus-50', label: 'Start deep focus · 50 / 10', icon: Timer, run: () => { startTimer({ kind: 'focus', workMin: 50, breakMin: 10 }); nav('/focus'); }, kw: 'pomodoro timer' },
  { id: 'create-project', label: 'Create project', icon: Rocket, run: () => openEditor('project'), kw: 'hackathon' },
  { id: 'log-sleep', label: 'Log sleep', icon: Moon, run: cap('sleep'), kw: 'bed wake' },
  { id: 'open-today', label: "Open today's plan", icon: CalendarDays, hint: 'T', run: () => nav('/today') },
  { id: 'add-assignment', label: 'Add assignment', icon: GraduationCap, run: cap('assignment'), kw: 'homework lab' },
  { id: 'add-exam', label: 'Add exam', icon: FileText, run: () => openEditor('exam'), kw: 'cat fat quiz' },
  { id: 'review-week', label: 'Review week', icon: ClipboardCheck, run: () => nav('/reviews'), kw: 'weekly reflection' },
  { id: 'add-event', label: 'Add event / time block', icon: CalendarPlus, run: cap('block'), kw: 'schedule class' },
  { id: 'log-habits', label: 'Check off habits', icon: Flame, run: cap('habitlog') },
  { id: 'add-note', label: 'Quick note', icon: NotebookPen, run: cap('note') },
  { id: 'add-idea', label: 'Capture idea', icon: Lightbulb, run: cap('idea') },
  { id: 'meditate', label: 'Meditate', icon: Leaf, run: () => nav('/mind'), kw: 'breathe mindfulness calm' },
  { id: 'journal', label: 'Write journal entry', icon: Feather, run: cap('journal'), kw: 'diary reflect gratitude' },
  { id: 'study', label: 'Log study session', icon: BookOpen, run: cap('study') },
  { id: 'add-goal', label: 'Add goal', icon: Target, run: () => openEditor('goal') },
  { id: 'export', label: 'Export data (backup)', icon: Download, run: exportData, kw: 'backup json' },
];

function openHit(h: Hit) {
  const d = getDB();
  switch (h.kind) {
    case 'task': return openEditor('task', { id: h.id });
    case 'assignment': return openEditor('assignment', { id: h.id });
    case 'project': return nav(`/projects/${h.id}`);
    case 'course': return nav(`/academics?course=${h.id}`);
    case 'note': return openEditor(d.notes.find(n => n.id === h.id)?.idea ? 'idea' : 'note', { id: h.id });
    case 'journal': return openEditor('journal', { id: h.id });
    case 'expense': return openEditor(d.txns.find(t => t.id === h.id)?.type === 'income' ? 'income' : 'expense', { id: h.id });
    case 'block': return openEditor('block', { id: h.id });
    case 'goal': return openEditor('goal', { id: h.id });
    case 'habit': return openEditor('habit', { id: h.id });
    case 'exam': return openEditor('exam', { id: h.id });
  }
}

export function Palette() {
  const open = paletteOpen.use();
  if (!open) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const d = useDB();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => paletteOpen.set(false);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (c: { label: string; kw?: string }) => !s || `${c.label} ${c.kw ?? ''}`.toLowerCase().includes(s);
    const cmds = COMMANDS.filter(match).map(c => ({ sec: 'Actions', ...c }));
    const navs = NAV.filter(n => match({ label: n.label, kw: 'go open ' + n.to })).map(n => ({ sec: 'Go to', id: 'nav' + n.to, label: n.label, icon: n.icon, run: () => nav(n.to), hint: undefined as string | undefined }));
    const hits = search(d, q).map(h => ({ sec: 'Search results', id: h.kind + h.id, label: h.title, hint: `${h.kind}${h.sub ? ' · ' + h.sub : ''}`, icon: Search, run: () => openHit(h) }));
    return s ? [...hits, ...cmds, ...navs] : [...cmds.slice(0, 10), ...navs];
  }, [q, d]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const run = (i: number) => { const it = items[i]; if (!it) return; close(); it.run(); };
  let lastSec = '';
  return (
    <Modal open onClose={close} className="palette">
      <div className="palette-input">
        <Command size={18} className="muted" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search everything or type a command…" aria-label="Command palette"
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); run(sel); }
          }} />
        <span className="kbd">esc</span>
      </div>
      <div className="palette-list" ref={listRef} role="listbox">
        {items.length === 0 && <div className="empty"><div className="t">Nothing found</div><div className="small">Try a task, course code, project or amount.</div></div>}
        {items.map((it, i) => {
          const head = it.sec !== lastSec ? <div className="palette-sec">{it.sec}</div> : null;
          lastSec = it.sec;
          return (
            <div key={it.id}>
              {head}
              <button type="button" role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'on' : ''}`} onMouseMove={() => setSel(i)} onClick={() => run(i)}>
                <it.icon />
                <span className="grow ellipsis">{it.label}</span>
                {it.hint && <span className="tiny muted ellipsis" style={{ maxWidth: 200 }}>{it.hint}</span>}
                {i === sel && <ArrowRight size={14} />}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
