import { useEffect, useRef, useState } from 'react';

import { buildScene, phaseOf, rgb } from '../lib/scene.ts';

export function PixelScene({ height = 64, seed = 7, animate = true, hour, className }: { height?: number; seed?: number; animate?: boolean; hour?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let raf = 0, stop = false;
    let scene: ReturnType<typeof buildScene> | null = null;
    let backC: HTMLCanvasElement, frontC: HTMLCanvasElement;
    const H = height;
    const PAD = 4; // layers are drawn a little wider so the cursor parallax never shows an edge
    const build = () => {
      scene = null;
      const rect = cv.getBoundingClientRect();
      const W = Math.max(64, Math.round((H * rect.width) / Math.max(1, rect.height)));
      cv.width = W; cv.height = H;
      scene = buildScene(W + PAD * 2, H, phaseOf(hour ?? new Date().getHours()), seed);
      backC = document.createElement('canvas'); backC.width = W + PAD * 2; backC.height = H; backC.getContext('2d')!.putImageData(scene.back, 0, 0);
      frontC = document.createElement('canvas'); frontC.width = W + PAD * 2; frontC.height = H; frontC.getContext('2d')!.putImageData(scene.front, 0, 0);
    };

    // hover: parallax toward the cursor, a sparkle trail, and fireflies that drift to it
    const mouse = { x: 0, y: 0, on: false };
    const sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    let par = 0;

    const paint = (t: number) => {
      if (!scene) return;
      const ctx = cv.getContext('2d')!;
      const W = cv.width;
      par += ((mouse.on ? (0.5 - mouse.x / W) * PAD * 2 : 0) - par) * 0.18;
      const back = Math.round(par * 0.35) - PAD, front = Math.round(par) - PAD;
      ctx.drawImage(backC, back, 0);
      for (const [x, y, ph] of scene.stars) if (Math.sin(t / 700 + ph * 40) > 0.85) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + back, y, 1, 1); }
      ctx.fillStyle = scene.P.cloud;
      for (const c of scene.clouds) {
        const x = Math.round(((c.x + t * c.s * 0.05) % (W + 40)) - 20 + par * 0.6);
        ctx.fillRect(x, Math.round(c.y), c.w, 2);
        ctx.fillRect(x + 2, Math.round(c.y) - 1, c.w - 5, 1);
        ctx.fillRect(x + 3, Math.round(c.y) - 2, Math.max(2, c.w / 3), 1);
      }
      ctx.drawImage(frontC, front, 0);
      ctx.fillStyle = scene.P.glow;
      for (const f of scene.flies) {
        let x = f.x + front + Math.sin(t / 1600 * f.s + f.a) * 6;
        let y = f.y + Math.cos(t / 1300 * f.s + f.a * 2) * 3;
        if (mouse.on) {
          const dx = mouse.x - x, dy = mouse.y - y, dist = Math.hypot(dx, dy);
          if (dist < 48) { const pull = 0.45 * (1 - dist / 48); x += dx * pull; y += dy * pull; }
        }
        const on = Math.sin(t / 500 * f.s + f.a * 3);
        if (on < -0.2) continue;
        x = Math.round(x); y = Math.round(y);
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
        ctx.globalAlpha = 1;
        ctx.fillRect(x, y, 1, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx; s.y += s.vy; s.life -= 0.04;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        const x = Math.round(s.x), y = Math.round(s.y);
        ctx.fillStyle = s.life > 0.7 ? '#ffffff' : scene.P.glow; // white-hot, cooling to the scene's glow colour
        ctx.globalAlpha = Math.min(1, s.life * 1.4);
        ctx.fillRect(x, y, 1, 1);
        if (s.life > 0.45) { ctx.globalAlpha = s.life * 0.5; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      }
      ctx.globalAlpha = 1;
    };
    // Scenery is decoration: if it ever fails, leave the banner plain rather than break the page.
    const safe = (f: () => void) => { try { f(); } catch (e) { scene = null; console.warn('pixel scene skipped:', e); } };
    const draw = (t: number) => safe(() => paint(t));
    safe(build);
    const reduce = !animate || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
    let last = 0;
    const loop = (t: number) => {
      if (stop) return;
      // ~9 fps idle is plenty for pixel art; ~30 fps while you play with it
      if (t - last > (mouse.on || sparks.length ? 33 : 110)) { last = t; draw(t); }
      raf = requestAnimationFrame(loop);
    };
    const host = cv.parentElement!;
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * cv.width;
      mouse.y = ((e.clientY - r.top) / r.height) * cv.height;
      mouse.on = true;
      if (sparks.length < 40 && Math.random() < 0.8) sparks.push({ x: mouse.x, y: mouse.y, vx: (Math.random() - 0.5) * 0.5, vy: -0.15 - Math.random() * 0.35, life: 1 });
    };
    const onLeave = () => { mouse.on = false; };
    if (reduce) draw(0);
    else {
      raf = requestAnimationFrame(loop);
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }
    const ro = new ResizeObserver(() => { safe(build); draw(performance.now()); });
    ro.observe(cv);
    return () => {
      stop = true; cancelAnimationFrame(raf); ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [height, seed, animate, hour]);
  return <canvas ref={ref} className={`pixelated ${className ?? ''}`} aria-hidden="true" />;
}

// ------------------------------------------------------------------ avatar sprite
const SPRITE = [
  '................',
  '......kkkk......',
  '....kkhhhhkk....',
  '...khhhhhhhhk...',
  '..khhhHHHHhhhk..',
  '..khhHssssHhhk..',
  '..khHsesseshHk..',
  '..khHssSSssHhk..',
  '...kHHssssHHk...',
  '...kccHHHHcck...',
  '..kccchggchcck..',
  '.kscccchhccccsk.',
  '..kcccbbbbccck..',
  '..kcccppppccck..',
  '...kkpp..ppkk...',
  '....kBBk.kBBk...',
];
const TIERS = ['#5d8a4c', '#3f7fae', '#7a4fb3', '#2e8a6a', '#b0873a', '#c24b4b'];
const shade = (hex: string, f: number) => '#' + rgb(hex).map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('');

export function Avatar({ level, size = 56, accent }: { level: number; size?: number; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const tier = TIERS[Math.min(TIERS.length - 1, level >= 30 ? 5 : level >= 20 ? 4 : level >= 15 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0)];
    const map: Record<string, string> = {
      k: '#0b0d0a', h: tier, H: shade(tier, 0.62), c: shade(tier, 0.78), s: '#f1c79b', S: '#c98f68', e: '#151515',
      g: accent.length === 7 ? accent : '#7dff6a', b: '#6b4a2b', p: '#2b3140', B: '#3a2a1e',
    };
    ctx.clearRect(0, 0, 16, 16);
    SPRITE.forEach((row, y) => [...row].forEach((ch, x) => { if (map[ch]) { ctx.fillStyle = map[ch]; ctx.fillRect(x, y, 1, 1); } }));
  }, [level, accent]);
  return <canvas ref={ref} width={16} height={16} className="sprite" style={{ width: size, height: size }} aria-label={`Level ${level} avatar`} />;
}

/** The avatar hops when you hover it and says something about your actual day. */
export function Buddy({ level, accent, size = 40, lines, side = 'right', down }: {
  level: number; accent: string; size?: number; lines: string[]; side?: 'left' | 'right'; down?: boolean;
}) {
  const [say, setSay] = useState<string | null>(null);
  return (
    <span className={`buddy ${side} ${down ? 'down' : ''}`}
      onMouseEnter={() => setSay(lines[Math.floor(Math.random() * lines.length)] ?? null)}
      onMouseLeave={() => setSay(null)}>
      <Avatar level={level} size={size} accent={accent} />
      {say && <span className="bubble" role="status">{say}</span>}
    </span>
  );
}
