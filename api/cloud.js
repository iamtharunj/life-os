// Life OS encrypted sync (Vercel Function). It only ever sees ciphertext:
// the browser encrypts the planner with a key derived from your passphrase, and sends a separate
// access token derived from the same passphrase. This function stores sha256(token) + the encrypted blob.
//
// Storage: Upstash Redis added from the Vercel dashboard (Storage tab), called over its REST API.
//   lifeos:main            { auth, salt, rev, savedAt, blob }
//   lifeos:bak:YYYY-MM-DD  last save of each day, kept 35 days
//   lifeos:fail:<ip>       wrong-passphrase counter (10 per 10 minutes)
import { createHash, timingSafeEqual } from 'node:crypto';

const MAIN = 'lifeos:main';
const MAX_BODY = 900_000; // stay under Upstash's request limit; the blob is gzipped, so this is years of data
const BACKUP_SECONDS = 35 * 86400;

// Swappable in tests.
export const store = {
  configured: () => !!(env('URL') && env('TOKEN')),
  async pipeline(commands) {
    const r = await fetch(`${env('URL')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${env('TOKEN')}` }, body: JSON.stringify(commands) });
    if (!r.ok) throw new Error(`storage ${r.status}`);
    return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
  },
};
function env(name) { return process.env[`KV_REST_API_${name}`] ?? process.env[`UPSTASH_REDIS_REST_${name}`]; }

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bearer = req => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
const failKey = req => `lifeos:fail:${(req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim()}`;

/** Returns an error Response, or null when the request carries the right token. */
async function denied(req, rec, fails) {
  if (Number(fails) >= 10) return json({ error: 'Too many wrong attempts. Try again in 10 minutes.' }, 429);
  if (same(sha(bearer(req)), rec.auth)) return null;
  await store.pipeline([['INCR', failKey(req)], ['EXPIRE', failKey(req), 600]]);
  return json({ error: 'Wrong passphrase' }, 401);
}

export async function GET(req) {
  if (!store.configured()) return json({ cloud: true, configured: false });
  const q = new URL(req.url).searchParams;
  const day = q.get('backup');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Bad date' }, 400);
  const [raw, fails] = await store.pipeline([['GET', day ? `lifeos:bak:${day}` : MAIN], ['GET', failKey(req)]]);
  const rec = raw ? JSON.parse(raw) : null;
  // Public: only says whether a planner exists, its salt (not secret) and revision number.
  if (q.has('meta')) return json({ cloud: true, configured: true, exists: !!rec, salt: rec?.salt, rev: rec?.rev ?? 0 });
  if (!rec) return json({ error: 'Nothing saved yet' }, 404);
  const no = await denied(req, rec, fails);
  if (no) return no;
  if (q.has('backups')) {
    const [keys] = await store.pipeline([['KEYS', 'lifeos:bak:*']]);
    return json({ days: keys.map(k => k.slice('lifeos:bak:'.length)).sort().reverse() });
  }
  return json({ rev: rec.rev, savedAt: rec.savedAt, blob: rec.blob });
}

export async function PUT(req) {
  if (!store.configured()) return json({ error: 'Storage is not connected' }, 503);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'Planner is too large to sync' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Bad JSON' }, 400); }
  const { blob, base, salt, savedAt } = body ?? {};
  const token = bearer(req);
  if (typeof blob !== 'string' || !blob || typeof salt !== 'string' || !salt || token.length < 32) return json({ error: 'Bad request' }, 400);

  const [raw, fails] = await store.pipeline([['GET', MAIN], ['GET', failKey(req)]]);
  const rec = raw ? JSON.parse(raw) : null;
  if (rec) {
    const no = await denied(req, rec, fails);
    if (no) return no;
    // Another device saved since this one last loaded: refuse rather than overwrite newer data.
    if (rec.rev !== base) return json({ error: 'conflict', rev: rec.rev }, 409);
  }
  // First save claims the planner: its token becomes the only one accepted from then on.
  // ponytail: read-then-write is not atomic, so two saves within the same few milliseconds could both pass.
  // Fine for one person; switch to a Lua compare-and-set if that ever matters.
  const next = { auth: rec?.auth ?? sha(token), salt: rec?.salt ?? salt, rev: (rec?.rev ?? 0) + 1, savedAt: typeof savedAt === 'string' ? savedAt : new Date().toISOString(), blob };
  const value = JSON.stringify(next);
  await store.pipeline([['SET', MAIN, value], ['SET', `lifeos:bak:${new Date().toISOString().slice(0, 10)}`, value, 'EX', BACKUP_SECONDS]]);
  return json({ rev: next.rev });
}
