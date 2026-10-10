// End-to-end encrypted sync for the hosted build. The passphrase never leaves this device:
//   PBKDF2(passphrase, salt) → 64 bytes → first half is the AES-256-GCM key (stays here),
//   second half is the access token (sent to the server, which stores only its hash).
// The planner is gzipped, encrypted, and uploaded as an opaque blob.
import { CLOUD_API } from './platform.ts';
import { secure, Unreadable } from './vault.ts';

const CREDS = 'lifeos.cloud';
export const ITERATIONS = 600_000;

export class WrongPassphrase extends Error {}
export interface Meta { cloud: true; configured: boolean; exists?: boolean; salt?: string; rev?: number }
interface Creds { salt: string; key: string; token: string }

const b64 = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = (u8: Uint8Array) => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const through = async (data: Uint8Array, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function derive(passphrase: string, salt: string, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt) as BufferSource, iterations }, base, 512));
  return { key: b64(bits.subarray(0, 32)), token: hex(bits.subarray(32)) };
}
const aes = (key: string) => crypto.subtle.importKey('raw', unb64(key) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** text → base64(iv ‖ AES-GCM(gzip(text))) */
export async function seal(key: string, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await through(new TextEncoder().encode(text), new CompressionStream('gzip'));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), packed as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function unseal(key: string, blob: string) {
  const raw = unb64(blob);
  const packed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) as BufferSource }, await aes(key), raw.subarray(12) as BufferSource));
  return new TextDecoder().decode(await through(packed, new DecompressionStream('gzip')));
}

// ------------------------------------------------------------------ this device
// The keys are read once at startup and held in memory; on the phone they are stored encrypted (see vault.ts).
let creds: Creds | null = null;
/** Load this device's saved keys. Throws Unreadable (app only) when they exist but cannot be decrypted. */
export async function restore() {
  creds = null;
  try { creds = JSON.parse((await secure.get(CREDS)) ?? 'null'); }
  catch (e) { if (e instanceof Unreadable) throw e; /* blocked storage or a damaged entry: same as none saved */ }
}
export const savedCreds = () => creds;
export async function forget() {
  creds = null;
  try { await secure.remove(CREDS); } catch { /* ignore */ }
}
async function remember(next: Creds) {
  creds = next;
  await secure.set(CREDS, JSON.stringify(next));
}
/** Derive the keys and remember them on this device (so the passphrase is typed once per device). */
export async function unlock(passphrase: string, salt = newSalt()) {
  await remember({ salt, ...(await derive(passphrase, salt)) });
}

// ------------------------------------------------------------------ server calls
const auth = () => ({ Authorization: `Bearer ${savedCreds()!.token}` });

/** undefined when this isn't the hosted build (or we're offline). */
export async function meta(): Promise<Meta | undefined> {
  try {
    const r = await fetch(CLOUD_API + '?meta', { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return undefined;
    const m = await r.json();
    return m?.cloud ? m : undefined;
  } catch { return undefined; }
}

/** Latest planner (or one day's backup). null = nothing saved yet. Throws WrongPassphrase on 401/429. */
export async function pull(day?: string) {
  const r = await fetch(CLOUD_API + (day ? `?backup=${day}` : ''), { headers: auth(), cache: 'no-store' });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 429) throw new WrongPassphrase((await r.json()).error);
  if (!r.ok) throw new Error(`sync failed (${r.status})`);
  const { rev, blob } = await r.json();
  return { rev: rev as number, json: await unseal(savedCreds()!.key, blob) };
}

/** `next`: change the passphrase in the same save — encrypt under the new key and hand the server the new token. */
export async function push(json: string, base: number, savedAt: string, next?: Creds) {
  const c = next ?? savedCreds()!;
  const r = await fetch(CLOUD_API, {
    method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob: await seal(c.key, json), base, salt: c.salt, savedAt, newToken: next?.token }),
  });
  if (r.status === 409) return { ok: false as const };
  if (r.status === 401 || r.status === 429) throw new WrongPassphrase((await r.json()).error);
  if (!r.ok) throw new Error(`sync failed (${r.status})`);
  if (next) await remember(next);
  return { ok: true as const, rev: (await r.json()).rev as number };
}

export async function backups(): Promise<string[]> {
  try {
    const r = await fetch(CLOUD_API + '?backups', { headers: auth(), cache: 'no-store' });
    return r.ok ? (await r.json()).days : [];
  } catch { return []; }
}
