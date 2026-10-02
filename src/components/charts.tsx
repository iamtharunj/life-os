import { useState, type ReactNode } from 'react';
import { useWidth } from './ui.tsx';

// Charts: thin marks, hairline grid, one axis, hover tooltips. Text stays in text tokens.
export interface Datum { label: string; value: number; tip?: ReactNode; color?: string }

function niceMax(max: number, int = false, force?: number) {
  if (max <= 0) return { top: force ?? 1, step: 1 };
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw)!;
  if (int) step = Math.max(1, Math.ceil(step)); // counts never get half-ticks
  return { top: force ?? step * Math.ceil(max / step), step };
}
const ticksOf = (top: number, step: number) => Array.from({ length: Math.floor(top / step + 1e-9) + 1 }, (_, i) => i * step);
const allInt = (xs: number[]) => xs.every(Number.isInteger);
const topRounded = (x: number, y: number, w: number, h: number, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export function Bars({ data, height = 160, color = 'var(--accent)', target, fmt = (n: number) => String(+n.toFixed(1)), labelEvery, empty = 'No data yet' }: {
  data: Datum[]; height?: number; color?: string; target?: { value: number; label: string }; fmt?: (n: number) => string; labelEvery?: number; empty?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34, padB = 20, padT = 8;
  const max = Math.max(...data.map(d => d.value), target?.value ?? 0);
  const { top, step } = niceMax(max, allInt(data.map(d => d.value)));
  const plotW = Math.max(0, w - padL - 4), plotH = height - padB - padT;
  const band = data.length ? plotW / data.length : 0;
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Bar chart, ${data.length} values`}>
          {ticksOf(top, step).map(t => (
            <g key={t}>
              <line className="grid-line" x1={padL} x2={w} y1={y(t)} y2={y(t)} />
              <text className="axis-label" x={padL - 6} y={y(t) + 3.5} textAnchor="end">{fmt(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * band + (band - bw) / 2;
            const h = (d.value / top) * plotH;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * band} y={padT} width={band} height={plotH + padB} fill="transparent" />
                <path d={topRounded(x, y(d.value), bw, h)} fill={d.color ?? color} opacity={hover === null || hover === i ? 1 : 0.55} />
                {i % every === 0 && <text className="axis-label" x={x + bw / 2} y={height - 5} textAnchor="middle">{d.label}</text>}
              </g>
            );
          })}
          {target && target.value > 0 && (
            <g>
              <line className="target-line" x1={padL} x2={w} y1={y(target.value)} y2={y(target.value)} />
              <text className="target-label" x={w - 2} y={y(target.value) - 4} textAnchor="end">{target.label}</text>
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="tip" style={{ left: padL + hover * band + band / 2, top: y(data[hover].value) }}>
          {data[hover].tip ?? <><b>{fmt(data[hover].value)}</b> <span className="muted">{data[hover].label}</span></>}
        </div>
      )}
      {w > 0 && total === 0 && <div className="muted small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{empty}</div>}
    </div>
  );
}

export interface Series { name: string; color: string; values: number[] }
export function Lines({ labels, series, height = 170, fmt = (n: number) => String(+n.toFixed(1)), target, area = true, max: forceMax, floor = 0 }: {
  labels: string[]; series: Series[]; height?: number; fmt?: (n: number) => string; target?: { value: number; label: string }; area?: boolean; max?: number;
  /** y-axis starts here instead of 0 (fine for lines; e.g. running pace) */
  floor?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34, padB = 20, padT = 10, padR = 8;
  const all = series.flatMap(s => s.values);
  const span = niceMax((forceMax ?? Math.max(...all, target?.value ?? 0, 0)) - floor, allInt(all) && Number.isInteger(floor), forceMax === undefined ? undefined : forceMax - floor);
  const top = span.top + floor, step = span.step;
  const plotW = Math.max(0, w - padL - padR), plotH = height - padB - padT;
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((Math.max(floor, v) - floor) / (top - floor)) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 52))));
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / plotW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {series.length > 1 && (
        <div className="legend" style={{ position: 'absolute', right: 0, top: -24 }}>
          {series.map(s => <span key={s.name}><i className="swatch" style={{ background: s.color, height: 3, width: 12 }} />{s.name}</span>)}
        </div>
      )}
      {w > 0 && (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Line chart of ${series.map(s => s.name).join(', ')}`}>
          {ticksOf(top - floor, step).map(t => t + floor).map(t => (
            <g key={t}>
              <line className="grid-line" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
              <text className="axis-label" x={padL - 6} y={y(t) + 3.5} textAnchor="end">{fmt(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => i % every === 0 && <text key={i} className="axis-label" x={x(i)} y={height - 5} textAnchor="middle">{l}</text>)}
          {target && target.value > 0 && (
            <g>
              <line className="target-line" x1={padL} x2={w - padR} y1={y(target.value)} y2={y(target.value)} />
              <text className="target-label" x={w - padR} y={y(target.value) - 4} textAnchor="end">{target.label}</text>
            </g>
          )}
          {series.map(s => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
            return (
              <g key={s.name}>
                {area && series.length === 1 && n > 1 && <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill={s.color} opacity={0.1} />}
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {n > 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />}
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--line-2)" />
              {series.map(s => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
      )}
      {hover !== null && (
        <div className="tip" style={{ left: x(hover), top: y(Math.max(...series.map(s => s.values[hover]))) }}>
          <div className="muted tiny">{labels[hover]}</div>
          {series.map(s => <div key={s.name}>{series.length > 1 && <i className="swatch" style={{ background: s.color, marginRight: 6 }} />}<b>{fmt(s.values[hover])}</b>{series.length > 1 && <span className="muted"> {s.name}</span>}</div>)}
        </div>
      )}
    </div>
  );
}

export function HBars({ data, fmt = String, color = 'var(--accent)', max }: { data: Datum[]; fmt?: (n: number) => string; color?: string; max?: number }) {
  const m = max ?? Math.max(1, ...data.map(d => d.value));
  return (
    <div className="col gap-4">
      {data.map(d => (
        <div className="hbar" key={d.label} title={`${d.label}: ${fmt(d.value)}`}>
          <span className="ellipsis dim">{d.label}</span>
          <div className="track"><i style={{ width: `${(d.value / m) * 100}%`, background: d.color ?? color }} /></div>
          <span className="num small">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** GitHub-style calendar. `cell(date)` returns a fill (or undefined for empty) and a tooltip. */
export function Heatmap({ days, cell, today, cols }: { days: string[]; cell: (d: string) => { fill?: string; tip: string }; today: string; cols?: number }) {
  return (
    <div className="heat" style={cols ? { gridTemplateColumns: `repeat(${cols}, 1fr)` } : undefined}>
      {days.map((d, i) => {
        if (!d) return <i key={'blank' + i} style={{ visibility: 'hidden' }} />;
        const fut = d > today;
        const c = fut ? undefined : cell(d);
        return <i key={d} className={`${fut ? 'fut' : ''} ${d === today ? 'today' : ''}`} style={c?.fill ? { background: c.fill } : undefined} title={c?.tip ?? d} />;
      })}
    </div>
  );
}
/** Sequential ramp: one hue, stepped toward the surface for low values. */
export const ramp = (color: string, t: number) =>
  t <= 0 ? undefined : `color-mix(in oklab, ${color} ${Math.round(28 + Math.min(1, t) * 72)}%, var(--card-3))`;

export function Spark({ values, color = 'var(--accent)', width = 90, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--line-2)" strokeWidth={1.5} />
      <polyline points={values.slice(-4).map((v, i) => `${x(values.length - 4 + i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}
