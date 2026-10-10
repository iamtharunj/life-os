// Life OS local server: builds the app with esbuild, serves it, and persists data to data/lifeos.json.
//   node server.mjs            build + serve on http://localhost:4321 and open the browser
//   node server.mjs --dev      rebuild on file changes + auto-reload the page
//   node server.mjs --lan      also reachable from your phone on the same Wi-Fi (no auth — trusted networks only)
//   node server.mjs --build    build to dist/ and exit
//   node server.mjs --site     build the deployable static site into site/ (used by Vercel) and exit
//   node server.mjs --mobile   build the Android app's web assets into mobile/ (used by Capacitor) and exit
// (Vite can't run from a folder whose path contains '#', so this replaces it.)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const ROOT = import.meta.dirname;
const args = new Set(process.argv.slice(2));
const DEV = args.has('--dev');
const LAN = args.has('--lan');
const PORT = Number(process.env.PORT) || 4321;
const DIST = path.join(ROOT, 'dist');
const WEB = path.join(ROOT, 'web'); // manifest, icons, service worker: served from the site root
const INDEX = path.join(ROOT, 'index.html');
const SITE = args.has('--site');
const MOBILE = args.has('--mobile');
const MOBILE_OUT = path.join(ROOT, 'mobile');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'lifeos.json');
const BACKUPS = path.join(DATA, 'backups');
const MAX_BODY = 20 * 1024 * 1024;

// ------------------------------------------------------------------ build
const reloaders = new Set();
const buildOpts = {
  entryPoints: [path.join(ROOT, 'src/main.tsx')],
  bundle: true,
  outdir: MOBILE ? path.join(MOBILE_OUT, 'dist') : DIST,
  jsx: 'automatic',
  loader: { '.woff2': 'file', '.woff': 'file' },
  minify: !DEV,
  sourcemap: !SITE && !MOBILE,
  target: 'es2022',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': DEV ? '"development"' : '"production"' },
  plugins: [{
    name: 'reload',
    setup(b) {
      b.onEnd(r => {
        if (r.errors.length) return;
        if (DEV) console.log(`rebuilt ${new Date().toLocaleTimeString()}`);
        for (const res of reloaders) res.write('data: reload\n\n');
      });
    },
  }],
};
if (MOBILE) fs.rmSync(MOBILE_OUT, { recursive: true, force: true }); // start clean: nothing stale ends up in the APK
if (DEV) await (await esbuild.context(buildOpts)).watch();
else await esbuild.build(buildOpts);
if (SITE) {
  const out = path.join(ROOT, 'site');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(WEB, out, { recursive: true });
  fs.cpSync(DIST, path.join(out, 'dist'), { recursive: true, filter: f => !f.endsWith('.map') });
  fs.copyFileSync(INDEX, path.join(out, 'index.html'));
  console.log('Built site/');
  process.exit(0);
}
if (MOBILE) {
  // Same bundle as the website, minus the service worker and manifest (the APK is the install). The policy lets the
  // page run only its own files and talk only to itself and the production sync API.
  const { CLOUD_ORIGIN } = await import('./src/lib/platform.ts');
  const csp = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    `connect-src 'self' ${CLOUD_ORIGIN}`, "object-src 'none'", "base-uri 'self'", "frame-src 'none'", "form-action 'none'",
  ].join('; ');
  const html = fs.readFileSync(INDEX, 'utf8')
    .replace(/^[ \t]*<link rel="(manifest|apple-touch-icon)"[^\n]*\n/gm, '')
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
  if (!html.includes('Content-Security-Policy') || html.includes('manifest')) throw new Error('index.html changed: update the --mobile rewrite');
  fs.writeFileSync(path.join(MOBILE_OUT, 'index.html'), html);
  console.log('Built mobile/');
  process.exit(0);
}
if (args.has('--build')) { console.log('Built to dist/'); process.exit(0); }

// ------------------------------------------------------------------ persistence API
function backup() {
  if (!fs.existsSync(DB_FILE)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const target = path.join(BACKUPS, `lifeos-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DB_FILE, target);
  const files = fs.readdirSync(BACKUPS).filter(f => f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(BACKUPS, f));
}

function api(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.end(fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE) : 'null');
  if (req.method !== 'PUT') { res.statusCode = 405; return res.end('{}'); }
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY) { res.statusCode = 413; res.end('{}'); req.destroy(); }
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    try {
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || !parsed.settings || !Array.isArray(parsed.tasks)) throw new Error('not a Life OS database');
      fs.mkdirSync(DATA, { recursive: true });
      backup();
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(parsed)); // write-then-rename: never a half-written file
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
      res.end('{"ok":true}');
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
  });
}

// ------------------------------------------------------------------ static
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const RELOAD_SNIPPET = `<script>new EventSource('/__reload').onmessage = () => location.reload();</script>`;
// Loopback names, plus *.ts.net for `tailscale serve` (Tailscale proxies your own devices to localhost).
const localHost = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.[a-z0-9-]+\.ts\.net)(:\d+)?$/i;

function handle(req, res) {
  // Reject other hostnames (DNS-rebinding guard) unless LAN mode was explicitly requested.
  if (!LAN && !localHost.test(req.headers.host ?? '')) { res.statusCode = 403; return res.end('Forbidden'); }
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/db') return api(req, res);
  // The app asks whether it is the hosted (encrypted cloud) build; this local server is not.
  if (url.pathname === '/api/cloud') { res.setHeader('Content-Type', 'application/json'); return res.end('{"cloud":false}'); }
  if (DEV && url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    reloaders.add(res);
    req.on('close', () => reloaders.delete(res));
    return;
  }
  const p = decodeURIComponent(url.pathname);
  const file = p === '/' ? INDEX : p.startsWith('/dist/') ? path.join(ROOT, p) : path.join(WEB, path.basename(p));
  if (file !== INDEX && !file.startsWith(DIST + path.sep) && !file.startsWith(WEB + path.sep)) { res.statusCode = 404; return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(DEV && file.endsWith('index.html') ? buf.toString().replace('</body>', RELOAD_SNIPPET + '</body>') : buf);
  });
}

const url = `http://localhost:${PORT}`;
const openBrowser = () => {
  if (args.has('--no-open') || DEV) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
};
// Listen on both IPv4 and IPv6 loopback: browsers may resolve "localhost" to either one.
const hosts = LAN ? ['0.0.0.0', '::1'] : ['127.0.0.1', '::1'];
const listen = host => new Promise((resolve, reject) => {
  const srv = http.createServer(handle);
  srv.once('error', reject);
  srv.listen(PORT, host, () => resolve(srv));
});
try {
  await listen(hosts[0]);
} catch (e) {
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`\n  Life OS is already running at ${url} (opening it). Close the other window to restart.\n`);
  openBrowser();
  process.exit(0);
}
await listen(hosts[1]).catch(() => { /* IPv6 unavailable or already bound — IPv4 still works */ });

console.log(`\n  Life OS running at ${url}${DEV ? '  (dev: auto-reload on save)' : ''}`);
console.log(`  Data: ${DB_FILE}`);
if (LAN) {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
  console.log(`  On your phone (same Wi-Fi): ${ips.join('  ')}`);
  console.log('  Warning: anyone on this network can open it. Use only on trusted Wi-Fi.');
}
console.log('  Keep this window open while you use Life OS. Press Ctrl+C to stop.\n');
openBrowser();
