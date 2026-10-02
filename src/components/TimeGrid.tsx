import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Moon, TriangleAlert } from 'lucide-react';
import type { DB, DateStr } from '../lib/types.ts';
import { useDB } from '../lib/store.ts';
import { dayNum, dow, fmtTime, fmtDur, nowMin, today } from '../lib/dates.ts';
import { blocksOn, isDone, layoutDay, sleepBands, sleepLeft, projectDeadline, type Inst } from '../lib/derive.ts';
import { AREAS, BLOCK_KINDS, kindColor } from '../lib/meta.ts';
import { moveInstance, toggleBlockDone } from '../lib/actions.ts';
import { openEditor } from './editors.tsx';
import { BLOCK_ICON } from './icons.tsx';
import { nav, useNow } from './ui.tsx';

const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Deadlines & all-day markers for a date: tasks, exams, project deadlines, payments. */
export function dayMarkers(d: DB, date: DateStr) {
  const out: { key: string; label: string; color: string; open: () => void }[] = [];
  for (const t of d.tasks) if (!t.parentId && !isDone(t) && t.due === date && (t.kind === 'assignment' || t.kind === 'lab' || t.priority === 1)) {
    const c = d.courses.find(c => c.id === t.courseId);
    out.push({ key: t.id, label: `${c ? c.code.slice(-4) + ' · ' : ''}${t.title}`, color: t.courseId ? AREAS.academics.color : AREAS.projects.color, open: () => openEditor(t.kind === 'task' || !t.kind ? 'task' : 'assignment', { id: t.id }) });
  }
  for (const e of d.exams) if (e.date === date) {
    const c = d.courses.find(c => c.id === e.courseId);
    out.push({ key: e.id, label: `${e.type} · ${c?.code ?? ''}`, color: AREAS.academics.color, open: () => openEditor('exam', { id: e.id }) });
  }
  for (const p of d.projects) if (projectDeadline(p) === date && !['completed', 'archived'].includes(p.status))
    out.push({ key: p.id, label: `⚑ ${p.name}`, color: p.type === 'hackathon' ? AREAS.hackathons.color : AREAS.projects.color, open: () => nav(`/projects/${p.id}`) });
  for (const s of d.subs) if (s.active && s.next === date) out.push({ key: s.id, label: `${d.settings.currency}${s.amount} ${s.name}`, color: AREAS.finance.color, open: () => openEditor('sub', { id: s.id }) });
  return out;
}

interface Drag { mode: 'move' | 'resize' | 'create'; inst?: Inst; dayIdx: number; start: number; end: number; anchor: number; offset: number; x0: number; y0: number; moved: boolean }

export function TimeGrid({ days, ppm = 0.8, compactHead, hideAreas = [] }: { days: DateStr[]; ppm?: number; compactHead?: boolean; hideAreas?: string[] }) {
  const d = useDB();
  useNow(60000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointerType = useRef('mouse');
  const T = today();
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (d.settings.gridStart * 60 - 20) * ppm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppm]);

  const minuteAt = (y: number) => (y - bodyRef.current!.getBoundingClientRect().top) / ppm;
  const dayAt = (x: number) => {
    const r = bodyRef.current!.getBoundingClientRect(); // first 52px are the hour gutter
    return clamp(Math.floor(((x - r.left - 52) / (r.width - 52)) * days.length), 0, days.length - 1);
  };
  const begin = (g: Drag) => { dragRef.current = g; setDrag(g); };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const g = dragRef.current;
      if (!g) return;
      const moved = g.moved || Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 5;
      let next: Drag = { ...g, moved };
      const m = minuteAt(e.clientY);
      if (g.mode === 'move') {
        const len = g.end - g.start;
        const s = clamp(snap(m - g.offset), 0, 1440 - len);
        next = { ...next, start: s, end: s + len, dayIdx: dayAt(e.clientX) };
      } else if (g.mode === 'resize') {
        next = { ...next, end: clamp(snap(m), g.start + SNAP, 1440) };
      } else {
        const cur = clamp(snap(m), 0, 1440);
        next = { ...next, start: Math.min(g.anchor, cur), end: Math.max(g.anchor + SNAP, cur) };
      }
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const g = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!g) return;
      const date = days[g.dayIdx];
      if (g.mode === 'create') {
        if (g.moved && g.end - g.start >= SNAP) openEditor('block', { defaults: { date, start: g.start, end: g.end } });
        else openEditor('block', { defaults: { date, start: g.anchor, end: Math.min(1440, g.anchor + 60) } });
        return;
      }
      const i = g.inst!;
      if (!g.moved) { openEditor('block', { id: i.block.id, instDate: i.date }); return; }
      if (date !== i.date || g.start !== i.start || g.end !== i.end) moveInstance(i, date, g.start, g.end);
    };
    const cancel = () => { dragRef.current = null; setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, days.join()]);

  const onBlockDown = (e: React.PointerEvent, inst: Inst, mode: 'move' | 'resize') => {
    pointerType.current = e.pointerType;
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.pointerType === 'touch') return; // touch: tap opens the editor (handled by onClick)
    e.preventDefault();
    begin({ mode, inst, dayIdx: days.indexOf(inst.date), start: inst.start, end: inst.end, anchor: inst.start, offset: minuteAt(e.clientY) - inst.start, x0: e.clientX, y0: e.clientY, moved: false });
  };
  const onColDown = (e: React.PointerEvent, dayIdx: number) => {
    pointerType.current = e.pointerType;
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    const m = clamp(snap(minuteAt(e.clientY) - 7), 0, 1425);
    begin({ mode: 'create', dayIdx, start: m, end: m + SNAP, anchor: m, offset: 0, x0: e.clientX, y0: e.clientY, moved: false });
  };

  const bands = sleepBands(d.settings);
  const nm = nowMin();

  return (
    <div className="tg" style={{ ['--hour' as string]: `${60 * ppm}px` }}>
      <div className="tg-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map(date => {
          const marks = dayMarkers(d, date);
          const left = sleepLeft(d, date);
          const planned = blocksOn(d, date).filter(i => !['sleep', 'meal'].includes(i.block.kind)).reduce((a, i) => a + i.end - i.start, 0);
          return (
            <div key={date} className={`tg-dayhead ${date === T ? 'today' : ''}`} onClick={() => nav(`/calendar?day=${date}`)} title="Open day view">
              <div className="row between">
                <div>
                  <div className="dw">{dow(date)}</div>
                  <div className="dn">{dayNum(date)}</div>
                </div>
                <div className="col gap-4" style={{ alignItems: 'flex-end' }}>
                  {left.short && <span className="pill bad" title={`Only ${fmtDur(left.min)} left for sleep tonight`}><Moon />{fmtDur(left.min)}</span>}
                  {!compactHead && planned > 0 && <span className="tiny muted num">{fmtDur(planned)}</span>}
                </div>
              </div>
              {!compactHead && marks.length > 0 && (
                <div className="tg-allday">
                  {marks.slice(0, 3).map(m => (
                    <div key={m.key} className="tg-chip" style={{ borderColor: m.color }} title={m.label} onClick={e => { e.stopPropagation(); m.open(); }}>{m.label}</div>
                  ))}
                  {marks.length > 3 && <div className="tiny muted">+{marks.length - 3} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" ref={bodyRef} style={{ gridTemplateColumns: cols, height: 1440 * ppm }}>
          <div className="tg-gutter">
            {Array.from({ length: 24 }, (_, h) => h > 0 && <div key={h} className="tg-hour" style={{ top: h * 60 * ppm }}>{String(h).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((date, di) => {
              let insts = blocksOn(d, date).filter(i => !hideAreas.includes(BLOCK_KINDS[i.block.kind].area));
              if (drag?.inst && drag.mode !== 'create') {
                insts = insts.filter(i => i.key !== drag.inst!.key);
                if (drag.dayIdx === di) insts = [...insts, { ...drag.inst, date, start: drag.start, end: drag.end }];
              }
              const lay = layoutDay(insts);
              return (
                <div key={date} className={`tg-col ${date === T ? 'today' : ''}`} onPointerDown={e => onColDown(e, di)}
                  onClick={e => {
                    if (pointerType.current !== 'touch' || e.target !== e.currentTarget) return;
                    const m = clamp(snap(minuteAt(e.clientY) - 30), 0, 1380);
                    openEditor('block', { defaults: { date, start: m, end: m + 60 } });
                  }}>
                  {bands.map(([a, b]) => (
                    <div key={a} className="tg-sleep" style={{ top: a * ppm, height: (b - a) * ppm }}>{b - a >= 60 && <span><Moon size={9} style={{ verticalAlign: -1 }} /> sleep</span>}</div>
                  ))}
                  {insts.map(i => {
                    const L = lay.get(i.key)!;
                    const color = i.block.courseId ? d.courses.find(c => c.id === i.block.courseId)?.color ?? kindColor(i.block.kind) : kindColor(i.block.kind);
                    const Icon = BLOCK_ICON[i.block.kind];
                    const intoSleep = i.block.kind !== 'sleep' && bands.some(([a, b]) => i.start < b && a < i.end);
                    const dragging = drag?.inst?.key === i.key;
                    const h = (i.end - i.start) * ppm;
                    return (
                      <div key={i.key}
                        className={`tg-block ${i.done ? 'done' : ''} ${L.overlap ? 'conflict' : intoSleep ? 'sleepy' : ''} ${dragging ? 'drag' : ''}`}
                        style={{ ['--c' as string]: color, top: i.start * ppm + 1, height: Math.max(14, h - 2), left: `calc(${(L.col / L.cols) * 100}% + 2px)`, width: `calc(${100 / L.cols}% - 4px)` }}
                        onPointerDown={e => onBlockDown(e, i, 'move')}
                        onClick={e => { e.stopPropagation(); if (pointerType.current === 'touch') openEditor('block', { id: i.block.id, instDate: i.date }); }}
                        title={`${i.block.title} · ${fmtTime(i.start)}–${fmtTime(i.end)}${L.overlap ? ' · overlaps another block' : intoSleep ? ' · cuts into protected sleep' : ''}`}>
                        <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="bt">{(L.overlap || intoSleep) && <TriangleAlert size={10} style={{ verticalAlign: -1, marginRight: 3, color: L.overlap ? 'var(--bad)' : 'var(--warn)' }} />}{i.block.title}</div>
                            {h > 30 && <div className="bm">{dragging ? `${fmtTime(drag!.start)}–${fmtTime(drag!.end)}` : `${fmtTime(i.start)}–${fmtTime(i.end)}${i.block.location ? ' · ' + i.block.location : ''}`}</div>}
                          </div>
                          {h > 22 && L.cols < 3 && (
                            <button type="button" className="icon-btn sm" style={{ width: 18, height: 18, color: i.done ? 'var(--accent)' : 'var(--muted)' }}
                              aria-label={i.done ? 'Mark not done' : 'Mark done'} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleBlockDone(i); }}>
                              {i.done ? <Check size={12} /> : <Icon size={11} />}
                            </button>
                          )}
                        </div>
                        <div className="rs" onPointerDown={e => onBlockDown(e, i, 'resize')} />
                      </div>
                    );
                  })}
                  {drag?.mode === 'create' && drag.dayIdx === di && drag.moved && (
                    <div className="tg-ghost" style={{ top: drag.start * ppm, height: (drag.end - drag.start) * ppm }}>{fmtTime(drag.start)}–{fmtTime(drag.end)}</div>
                  )}
                  {date === T && <div className="tg-now" style={{ top: nm * ppm }} />}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
