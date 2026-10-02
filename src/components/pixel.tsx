import { useEffect, useRef, useState } from 'react';

// Procedural pixel-art scenery. Static layers are rendered once into ImageData;
// the animation loop only composites them and moves a handful of pixels (fireflies, clouds, stars).

type Phase = 'dawn' | 'day' | 'dusk' | 'night';
const phaseOf = (h: number): Phase => (h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night');

const PAL: Record<Phase, { sky: string[]; far: string; farHi: string; mid: string; trees: string[]; leaf: string[]; ground: string; orb: string; glow: string; cloud: string }> = {
  night: { sky: ['#060914', '#0a1024', '#0f1834', '#142044', '#1a2850'], far: '#18223e', farHi: '#243258', mid: '#0f2420', trees: ['#0a1d15', '#0f2a1c', '#173a25'], leaf: ['#0c2517', '#143a22', '#1f5530'], ground: '#07120b', orb: '#f1edd0', glow: '#c9ff6b', cloud: '#1d2a50' },
  dawn: { sky: ['#1f1735', '#3f2750', '#77405f', '#c2686a', '#eea877'], far: '#523654', farHi: '#6c4868', mid: '#28343a', trees: ['#172620', '#1f3329', '#2a4533'], leaf: ['#182a1f', '#25402c', '#34583a'], ground: '#101a13', orb: '#ffd89a', glow: '#ffe7a8', cloud: '#e39a86' },
  day: { sky: ['#2b67ad', '#3a7cc2', '#5496d4', '#80b8e3', '#b3daf0'], far: '#6a8fb0', farHi: '#86a8c4', mid: '#3a6a52', trees: ['#1d4a2a', '#2a6437', '#3b8445'], leaf: ['#265a30', '#3a7a40', '#55a353'], ground: '#1b3620', orb: '#fff4b8', glow: '#ffffff', cloud: '#eef6fb' },
  dusk: { sky: ['#121129', '#2a1d4a', '#632d5c', '#aa4458', '#e57f4c'], far: '#37244a', farHi: '#4b3160', mid: '#1c272a', trees: ['#101a17', '#16261e', '#1f3226'], leaf: ['#111f18', '#1b3225', '#284832'], ground: '#0b130f', orb: '#ffae62', glow: '#ffd76b', cloud: '#7a3f63' },
};

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function layer(W: number, H: number) {
  const img = new ImageData(W, H);
  const put = (x: number, y: number, hex: string) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = rgb(hex);
    const i = (y * W + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  };
  return { img, put };
}

function buildScene(W: number, H: number, phase: Phase, seed: number) {
  const P = PAL[phase];
  const r = rng(seed);
  // ---- back: sky + orb
  const back = layer(W, H);
  const skyH = H;
  for (let y = 0; y < skyH; y++) {
    const t = (y / (skyH * 0.8)) * (P.sky.length - 1);
    const i = Math.min(P.sky.length - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < W; x++) {
      const c = i < P.sky.length - 1 && f * 16 > BAYER[y % 4][x % 4] ? P.sky[i + 1] : P.sky[i];
      back.put(x, y, c);
    }
  }
  const orbX = phase === 'day' ? W * 0.18 : W * 0.78;
  const orbY = phase === 'day' ? 12 : phase === 'night' ? 11 : H * 0.44;
  const orbR = phase === 'night' ? 5 : 6;
  for (let y = -orbR - 4; y <= orbR + 4; y++) for (let x = -orbR - 4; x <= orbR + 4; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d <= orbR) back.put(orbX + x, orbY + y, P.orb);
    else if (d <= orbR + 3 && BAYER[(y + 8) % 4][(x + 8) % 4] < (orbR + 3 - d) * 4) back.put(orbX + x, orbY + y, P.sky[Math.min(P.sky.length - 1, 3)]);
  }
  if (phase === 'night') { back.put(orbX + 2, orbY - 1, '#d4cfb0'); back.put(orbX - 1, orbY + 2, '#d4cfb0'); back.put(orbX + 1, orbY + 2, '#d4cfb0'); }
  const stars: [number, number, number][] = [];
  if (phase === 'night' || phase === 'dusk') {
    const n = Math.floor(W * (phase === 'night' ? 0.35 : 0.12));
    for (let k = 0; k < n; k++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * H * 0.5);
      stars.push([x, y, r()]);
      back.put(x, y, r() > 0.7 ? '#ffffff' : '#9fb0d8');
    }
  }

  // ---- front: mountains, forest, bushes, vines (transparent elsewhere)
  const front = layer(W, H);
  const p1 = r() * 10, p2 = r() * 10, p3 = r() * 10;
  for (let x = 0; x < W; x++) {
    const h = Math.round(H * 0.5 + Math.sin(x * 0.045 + p1) * 6 + Math.sin(x * 0.12 + p2) * 2.5);
    for (let y = h; y < H; y++) front.put(x, y, y === h ? P.farHi : P.far);
  }
  const hill = (x: number) => Math.round(H * 0.7 + Math.sin(x * 0.028 + p3) * 3);
  for (let x = 0; x < W; x++) for (let y = hill(x); y < H; y++) front.put(x, y, P.mid);
  // conifers
  for (let x = Math.floor(r() * 6); x < W; x += 4 + Math.floor(r() * 7)) {
    const th = 9 + Math.floor(r() * 13);
    const base = hill(x) + 2;
    for (let k = 0; k < th; k++) {
      const y = base - th + k;
      const half = Math.floor(k * 0.42) + (k % 4 === 3 ? 1 : 0);
      for (let dx = -half; dx <= half; dx++) front.put(x + dx, y, dx < 0 ? P.trees[0] : dx === half && half > 0 ? P.trees[2] : P.trees[1]);
    }
    front.put(x, base, '#2a1c14');
  }
  // foreground bushes
  for (let x = -4; x < W + 4; x += 5 + Math.floor(r() * 6)) {
    const rad = 4 + Math.floor(r() * 5);
    const cy = H - 1 + Math.floor(r() * 3);
    for (let dy = -rad; dy <= 0; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const lit = dx - dy * 0.3 < -rad * 0.35 ? 2 : dx > rad * 0.4 ? 0 : 1;
      const c = lit === 2 && BAYER[(cy + dy + 16) % 4][(x + dx + 16) % 4] > 7 ? P.leaf[1] : P.leaf[lit];
      front.put(x + dx, cy + dy, c);
    }
  }
  for (let x = 0; x < W; x++) { front.put(x, H - 1, P.ground); }
  // canopy + hanging vines along the top edge
  for (let x = -3; x < W + 3; x += 3 + Math.floor(r() * 4)) {
    const rad = 2 + Math.floor(r() * 3);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) front.put(x + dx, dy + (r() < 0.02 ? 1 : 0), dy > rad * 0.3 ? P.leaf[0] : P.leaf[1]);
  }
  for (let x = Math.floor(r() * 10); x < W; x += 9 + Math.floor(r() * 16)) {
    const len = 6 + Math.floor(r() * 16);
    let vx = x;
    for (let y = 2; y < len; y++) {
      if (r() < 0.18) vx += r() < 0.5 ? -1 : 1;
      front.put(vx, y, P.leaf[1]);
      if (y % 3 === 0) front.put(vx + (y % 6 === 0 ? 1 : -1), y, P.leaf[2]);
    }
    front.put(vx, len, P.leaf[2]);
  }

  const clouds = phase === 'night' ? [] : Array.from({ length: Math.max(2, Math.floor(W / 60)) }, () => ({ x: r() * W, y: 6 + r() * H * 0.28, w: 8 + Math.floor(r() * 14), s: 0.02 + r() * 0.03 }));
  const flies = phase === 'night' || phase === 'dusk'
    ? Array.from({ length: Math.floor(W / 12) }, () => ({ x: r() * W, y: H * 0.55 + r() * H * 0.4, a: r() * 6.28, s: 0.4 + r() * 0.8 }))
    : [];
  return { back: back.img, front: front.img, clouds, flies, stars, P };
}

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

    const draw = (t: number) => {
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
    build();
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
    const ro = new ResizeObserver(() => { build(); draw(performance.now()); });
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
