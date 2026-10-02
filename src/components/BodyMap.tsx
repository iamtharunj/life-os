import { BODY_BACK, BODY_FRONT, BODY_KEY, MUSCLES, type MuscleId } from '../lib/muscles.ts';

// Pixel body as SVG: each run of same-letter pixels becomes one rect in that muscle's path,
// so every muscle is a single hoverable / clickable shape that stays crisp at any size.
function build(rows: string[]) {
  let neutral = '';
  const muscles: Partial<Record<MuscleId, string>> = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let n = 1;
      while (row[x + n] === c) n++;
      if (c !== '.') {
        const seg = `M${x} ${y}h${n}v1h-${n}z`;
        const m = BODY_KEY[c];
        if (m) muscles[m] = (muscles[m] ?? '') + seg; else neutral += seg;
      }
      x += n;
    }
  });
  return { neutral, muscles: Object.entries(muscles) as [MuscleId, string][] };
}
const VIEWS = { front: build(BODY_FRONT), back: build(BODY_BACK) };

/** Fill for a muscle given how much of the weekly target it got: dim → fully lit. */
export const heatFill = (color: string, t: number) =>
  t <= 0 ? undefined : `color-mix(in oklab, ${color} ${Math.round(34 + Math.min(1, t) * 66)}%, #474e43)`;

export function BodyMap({ fill, active, onPick, onHover, tip, views = ['front', 'back'], height = 280 }: {
  fill: (m: MuscleId) => string | undefined;
  active?: MuscleId;
  onPick?: (m: MuscleId) => void;
  onHover?: (m: MuscleId | undefined) => void;
  tip?: (m: MuscleId) => string;
  views?: ('front' | 'back')[];
  height?: number;
}) {
  return (
    <div className="body-map">
      {views.map(v => (
        <figure key={v}>
          <svg viewBox={`0 0 ${BODY_FRONT[0].length} ${BODY_FRONT.length}`} height={height} shapeRendering="crispEdges" role={onPick ? 'group' : 'img'} aria-label={`Body, ${v} view`}>
            <path d={VIEWS[v].neutral} className="bm-body" />
            {VIEWS[v].muscles.map(([m, d]) => (
              <path key={m} d={d} className={`bm-m ${onPick ? 'pick' : ''} ${active === m ? 'on' : ''} ${fill(m) ? 'lit' : ''}`} style={{ fill: fill(m) }}
                onMouseEnter={onHover && (() => onHover(m))} onMouseLeave={onHover && (() => onHover(undefined))}
                onClick={onPick && (() => onPick(m))}
                {...(onPick ? { role: 'button', tabIndex: 0, 'aria-label': tip?.(m) ?? MUSCLES[m].label, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(m); } } } : {})}>
                {tip && <title>{tip(m)}</title>}
              </path>
            ))}
          </svg>
          {views.length > 1 && <figcaption>{v}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Small figure with just one muscle lit, for muscle-group cards. */
export function MusclePic({ muscle, color, height = 78 }: { muscle: MuscleId; color: string; height?: number }) {
  return <BodyMap views={[MUSCLES[muscle].view]} height={height} fill={m => (m === muscle ? color : undefined)} />;
}
