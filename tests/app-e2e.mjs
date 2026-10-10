// End-to-end check of the Android app's web side, without a phone.
//
// It loads the real mobile bundle (mobile/, built by `node server.mjs --mobile`) in headless Chrome at the app's own
// origin (https://localhost), with Capacitor's real bridge script and a stand-in for the native side: an in-memory
// Vault, App and LocalNotifications. Calls to the production sync API never leave this process: they are answered by
// the real handlers in api/cloud.js on an in-memory store. Any other network request fails the run.
//
// What it cannot show: the Kotlin plugin, the Android Keystore, real notifications. See docs/ANDROID_TEST_PLAN.md.
//
// Run:  node server.mjs --mobile
//       npm i --no-save puppeteer-core        (not a project dependency; uses the Chrome already installed)
//       node tests/app-e2e.mjs                (CHROME=<path to chrome> if it is not in the default place)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const load = p => import(pathToFileURL(p).href);
const pptr = (await (process.env.PUPPETEER_CORE ? load(process.env.PUPPETEER_CORE) : import('puppeteer-core'))).default;
const { GET, PUT, OPTIONS, store } = await load(path.join(ROOT, 'api/cloud.js'));
const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
const APP = `${cap.server.androidScheme}://${cap.server.hostname}`;
const API = 'https://life-os-ecru-omega.vercel.app';
const MOBILE = path.join(ROOT, 'mobile');
assert.ok(fs.existsSync(path.join(MOBILE, 'index.html')), 'build the app assets first: node server.mjs --mobile');

// ------------------------------------------------------------------ stand-in backend (real handlers, memory store)
const redis = new Map();
store.configured = () => true;
store.pipeline = async cmds => cmds.map(([op, k, ...rest]) => {
  if (op === 'GET') return redis.get(k) ?? null;
  if (op === 'SET') { redis.set(k, rest[0]); return 'OK'; }
  if (op === 'KEYS') return [...redis.keys()].filter(x => x.startsWith(k.slice(0, -1)));
  if (op === 'DEL') return [k, ...rest].filter(x => redis.delete(x)).length;
  return 1;
});
const cloudRec = () => JSON.parse(redis.get('lifeos:main'));
const api = (method, token, body, q = '') => ({ GET, PUT })[method](new Request(API + '/api/cloud' + q, { method, headers: { authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }));

// ------------------------------------------------------------------ stand-in phone
const phone = {
  vault: new Map(), // what the Keystore-encrypted files would hold; lives outside the page, like the real thing
  unreadable: new Set(), asideCalls: [],
  online: true, strangers: [],
  auth: 'ok', authCalls: 0, secure: null,
  notifPermission: 'granted', pending: new Map(), channels: [], scheduleCalls: 0,
  saved: [], minimized: 0, listeners: {}, preflights: 0,
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const fail = (message, code) => ({ ok: false, error: { message, code } });
async function native({ pluginId, methodName, options: o = {}, callbackId }) {
  const key = `${pluginId}.${methodName}`;
  if (methodName === 'addListener') { (phone.listeners[`${pluginId}.${o.eventName}`] ??= []).push(callbackId); return { keep: true }; }
  if (methodName === 'removeListener') return { ok: true };
  switch (key) {
    case 'Vault.get': return phone.unreadable.has(o.key) ? fail('Stored data cannot be decrypted', 'UNREADABLE') : { ok: true, data: phone.vault.has(o.key) ? { value: phone.vault.get(o.key) } : {} };
    case 'Vault.set': phone.vault.set(o.key, o.value); phone.unreadable.delete(o.key); return { ok: true };
    case 'Vault.remove': phone.vault.delete(o.key); return { ok: true };
    case 'Vault.setAside': phone.asideCalls.push(o.key); return { ok: true };
    case 'Vault.canAuthenticate': return { ok: true, data: { available: phone.auth !== 'none' } };
    case 'Vault.authenticate': phone.authCalls++; return phone.auth === 'ok' ? { ok: true } : fail('Not unlocked', phone.auth === 'none' ? 'UNAVAILABLE' : 'CANCELLED');
    case 'Vault.setSecure': phone.secure = o.on; return { ok: true };
    case 'Vault.saveFile': phone.saved.push(o); return { ok: true, data: { saved: true } };
    case 'App.minimizeApp': phone.minimized++; return { ok: true };
    case 'LocalNotifications.checkPermissions': return { ok: true, data: { display: phone.notifPermission === 'granted' ? 'granted' : 'prompt' } };
    case 'LocalNotifications.requestPermissions': return { ok: true, data: { display: phone.notifPermission } };
    case 'LocalNotifications.createChannel': phone.channels.push(o); return { ok: true };
    case 'LocalNotifications.getPending': return { ok: true, data: { notifications: [...phone.pending.values()] } };
    case 'LocalNotifications.cancel': o.notifications.forEach(n => phone.pending.delete(n.id)); return { ok: true };
    case 'LocalNotifications.schedule':
      if (phone.notifPermission !== 'granted') return fail('Notifications are disabled', 'NOTIFICATIONS_DISABLED');
      phone.scheduleCalls++;
      o.notifications.forEach(n => phone.pending.set(n.id, n));
      return { ok: true, data: { notifications: o.notifications.map(n => ({ id: n.id })) } };
    default: throw new Error('the app called a native method the stand-in does not know: ' + key);
  }
}
const headers = name => ({ name, methods: [] });
const promise = (...names) => names.map(name => ({ name, rtype: 'promise' }));
const PLUGIN_HEADERS = [
  { ...headers('Vault'), methods: promise('get', 'set', 'remove', 'setAside', 'canAuthenticate', 'authenticate', 'setSecure', 'saveFile') },
  { ...headers('App'), methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener' }, ...promise('minimizeApp', 'exitApp', 'getState', 'getInfo')] },
  { ...headers('LocalNotifications'), methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener' }, ...promise('checkPermissions', 'requestPermissions', 'createChannel', 'getPending', 'cancel', 'schedule')] },
];
// What Capacitor injects at document start on Android, with our stand-in where the Java bridge would be.
const BRIDGE = `
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective + ' ' + e.blockedURI));
  window.androidBridge = { postMessage(json) {
    const m = JSON.parse(json);
    window.__native(json).then(r => {
      if (r.keep) return;
      window.Capacitor.fromNative({ callbackId: m.callbackId, pluginId: m.pluginId, methodName: m.methodName, success: r.ok, data: r.data, error: r.error });
    });
  } };
  window.Capacitor = { DEBUG: false, isLoggingEnabled: false, Plugins: {} };
  ${fs.readFileSync(path.join(ROOT, 'node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js'), 'utf8')}
  window.Capacitor.PluginHeaders = ${JSON.stringify(PLUGIN_HEADERS)};
`;

// ------------------------------------------------------------------ browser
const browser = await pptr.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  // Belt and braces: DNS resolves nothing, so a request that slipped past the interception below could not reach a real server.
  args: ['--window-size=1280,900', '--host-resolver-rules=MAP * ~NOTFOUND'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const problems = [];
page.on('pageerror', e => problems.push('page error: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) problems.push('console error: ' + m.text()); });
await page.exposeFunction('__native', async json => {
  try { return await native(JSON.parse(json)); } catch (e) { problems.push(e.message); return fail(e.message); }
});
await page.evaluateOnNewDocument(BRIDGE);
await page.setRequestInterception(true);
page.on('request', async req => {
  const url = new URL(req.url());
  try {
    if (url.origin === APP) { // the bundled files, as Capacitor's local server would hand them out
      const file = path.join(MOBILE, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!file.startsWith(MOBILE) || !fs.existsSync(file)) return await req.respond({ status: 404, body: 'not found' });
      return await req.respond({ status: 200, contentType: MIME[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (url.origin === API && url.pathname === '/api/cloud') {
      if (!phone.online) return await req.abort('internetdisconnected');
      const method = req.method();
      if (method === 'OPTIONS') phone.preflights++;
      const res = await ({ GET, PUT, OPTIONS })[method](new Request(req.url(), { method, headers: req.headers(), body: method === 'PUT' ? req.postData() : undefined }));
      return await req.respond({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    }
    if (url.protocol === 'data:') return await req.continue();
    phone.strangers.push(req.url()); // nothing else may be contacted
    await req.abort('blockedbyclient');
  } catch (e) { problems.push('request handling: ' + e.message); }
});

// ------------------------------------------------------------------ helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (what, fn, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    try { if (await fn()) return; } catch { /* the page is reloading: ask again */ }
  }
  throw new Error('timed out waiting for: ' + what + '\n--- page says:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 600));
};
const text = () => page.evaluate(() => document.body.innerText);
const sees = (s, ms) => until(`"${s}" on screen`, async () => (await text()).includes(s), ms);
const gone = s => until(`"${s}" to disappear`, async () => !(await text()).includes(s));
const click = label => page.evaluate(l => {
  const b = [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === l || x.getAttribute('aria-label') === l).pop();
  if (!b) throw new Error('no button: ' + l);
  b.click();
}, label);
const fill = async (sel, values) => {
  const els = await page.$$(sel);
  assert.equal(els.length, values.length, `${sel}: expected ${values.length} inputs, found ${els.length}`);
  for (let i = 0; i < els.length; i++) { await els[i].evaluate(e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await els[i].type(values[i]); }
};
const open = async route => { await page.goto(`${APP}/#${route}`); await page.reload(); };
const go = route => page.evaluate(r => { location.hash = r; }, route);
const emit = (event, data = {}) => page.evaluate((ids, plugin, d) => ids.forEach(callbackId => window.Capacitor.fromNative({ callbackId, pluginId: plugin, methodName: 'addListener', success: true, data: d, save: true })),
  phone.listeners[event] ?? [], event.split('.')[0], data);
const rename = async name => {
  await go('/settings'); await sees('Your name');
  const el = await page.$('input.input:not([type])'); // the first plain text field on the page is "Your name"
  await el.evaluate(e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await el.type(name);
};
const syncLabel = () => page.evaluate(() => document.querySelector('.side-foot .nav-item')?.innerText.trim());
const webStorage = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
const step = name => console.log('  ok  ' + name);
const PASS = 'correct horse battery staple';
const MARK = 'Quokka-7f3a'; // a synthetic "secret" we can look for in places it must never be

// ------------------------------------------------------------------ 1. first launch, set up, encrypted at rest
await page.goto(APP + '/');
await sees('Create your passphrase');
assert.equal(await page.evaluate(() => window.Capacitor.isNativePlatform() && window.Capacitor.getPlatform()), 'android', 'the page believes it is the Android app');
await fill('input[type=password]', [PASS, PASS]);
await click('Create and open');
await until('first sync', async () => redis.has('lifeos:main'), 40000);
assert.deepEqual([...phone.vault.keys()].sort(), ['lifeos.cloud', 'lifeos.db', 'lifeos.timer'].filter(k => phone.vault.has(k)), 'only known slots are used');
assert.ok(phone.vault.has('lifeos.cloud') && phone.vault.has('lifeos.db'), 'planner and keys went to the vault');
assert.equal(phone.secure, true, 'screenshots are blocked by default');
await rename(MARK);
await until('the rename to reach the vault and the server', async () => phone.vault.get('lifeos.db').includes(MARK) && cloudRec().rev >= 2);
const creds = JSON.parse(phone.vault.get('lifeos.cloud'));
let ws = await webStorage();
for (const [what, needle] of [['the planner', MARK], ['planner structure', '"tasks"'], ['the AES key', creds.key], ['the access token', creds.token], ['the passphrase', PASS]])
  assert.ok(!ws.includes(needle), `web storage must not contain ${what}`);
assert.ok(!/lifeos\.(db|cloud|timer)"/.test(ws), 'no planner, key or timer entries in web storage');
assert.ok(!JSON.stringify([...redis]).includes(MARK) && !JSON.stringify([...redis]).includes(creds.token), 'the server holds neither plaintext nor the token itself');
assert.equal((await page.evaluate(() => navigator.serviceWorker?.getRegistrations().then(r => r.length))) ?? 0, 0, 'no service worker in the app');
await until('synced state', async () => (await syncLabel()) === 'Synced · encrypted');
step('set up; planner and keys only in the vault; server sees ciphertext; no service worker');

// ------------------------------------------------------------------ 2. offline edit, restart offline, reconnect
phone.online = false;
await rename(MARK + '-offline');
await until('offline state shown only after the local save', async () => (await syncLabel()) === 'Offline · saved here' && phone.vault.get('lifeos.db').includes(MARK + '-offline'));
const revBefore = cloudRec().rev;
await open('/settings'); // a process restart with no network
await sees('Your name');
assert.equal(await page.$eval('input.input:not([type])', e => e.value), MARK + '-offline', 'offline launch opens the saved copy, with the offline edit');
assert.ok(!(await text()).includes('Enter your passphrase'), 'no passphrase prompt on an offline restart');
phone.online = true;
await emit('App.resume');
await until('the offline edit to sync after reconnect', async () => cloudRec().rev > revBefore && (await syncLabel()) === 'Synced · encrypted');
step('offline edit kept on the phone, survives an offline restart, syncs on reconnect');

// ------------------------------------------------------------------ 3. background flush, conflict (409) never overwrites newer data
await rename(MARK + '-bg');
await emit('App.pause'); // going to the background flushes straight away instead of waiting for the save timer
await until('flush on pause', async () => phone.vault.get('lifeos.db').includes(MARK + '-bg'), 1200);
await until('upload after pause', async () => (await syncLabel()) === 'Synced · encrypted');
const other = JSON.parse(phone.vault.get('lifeos.db'));
other.settings.name = 'From-the-laptop';
const blob = await page.evaluate(async (key, json) => { // "another device": same key, newer revision
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const k = await crypto.subtle.importKey('raw', Uint8Array.from(atob(key), c => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, packed));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  let s = ''; for (const b of out) s += String.fromCharCode(b);
  return btoa(s);
}, creds.key, JSON.stringify(other));
assert.equal((await api('PUT', creds.token, { blob, base: cloudRec().rev, salt: creds.salt })).status, 200);
const revOther = cloudRec().rev;
await rename('Stale-edit-from-the-phone');
await sees('Another device saved newer data');
await until('the newer copy to be adopted', async () => (await page.$eval('input.input:not([type])', e => e.value)) === 'From-the-laptop');
assert.equal(cloudRec().rev, revOther, 'the stale save was refused, not written');
assert.ok(phone.vault.get('lifeos.db').includes('From-the-laptop'), 'the adopted copy is what the phone now stores');
step('pause flushes; a stale phone gets 409, adopts the newer copy and overwrites nothing');

// ------------------------------------------------------------------ 4. reminders: opt-in, private text, idempotent, tap routing
await go('/settings');
phone.notifPermission = 'denied';
await click('Reminders on this phone');
await sees('Android is blocking notifications');
assert.equal(phone.pending.size, 0, 'nothing scheduled without permission');
assert.equal(await page.$eval('button[aria-label="Reminders on this phone"]', b => b.getAttribute('aria-checked')), 'false', 'the switch stays off when Android says no');
phone.notifPermission = 'granted';
await click('Reminders on this phone');
await until('reminders to be scheduled', async () => phone.pending.size > 0);
assert.deepEqual(phone.channels.map(c => c.id).sort(), ['focus', 'habits', 'schedule', 'sleep', 'tasks']);
const first = [...phone.pending.values()];
assert.ok(first.every(n => n.isExactNotification === false && n.schedule.allowWhileIdle === true), 'inexact alarms only');
assert.ok(first.every(n => n.title === 'Life OS' && typeof n.extra.route === 'string' && n.extra.route.startsWith('/')), 'generic title, internal route');
const seeded = JSON.parse(phone.vault.get('lifeos.db'));
const names = [...seeded.tasks.map(t => t.title), ...seeded.blocks.map(b => b.title), ...seeded.habits.map(h => h.name)].filter(Boolean);
assert.ok(names.length > 10 && !names.some(n => JSON.stringify(first).includes(n)), 'no task, block or habit name in any default notification');
const calls = phone.scheduleCalls;
await emit('App.resume'); // reopening the app reschedules everything
await until('reschedule on resume', async () => phone.scheduleCalls > calls);
assert.deepEqual([...phone.pending.keys()].sort(), first.map(n => n.id).sort(), 'same reminders after a reschedule: no duplicates');
await click('Habit check-in');
await until('habit reminders to be cancelled', async () => ![...phone.pending.values()].some(n => n.channelId === 'habits'));
await click('Show details');
await until('details to appear when asked for', async () => [...phone.pending.values()].some(n => n.title !== 'Life OS'));
await click('Show details');
await emit('LocalNotifications.localNotificationActionPerformed', { actionId: 'tap', notification: { id: 1, extra: { route: '/sleep' } } });
await until('a notification tap to open its page', async () => (await page.evaluate(() => location.hash)) === '#/sleep');
for (const route of ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '/settings/../../x', { to: '/tasks' }]) {
  await emit('LocalNotifications.localNotificationActionPerformed', { actionId: 'tap', notification: { id: 1, extra: { route } } });
  await sleep(150);
  assert.equal(await page.evaluate(() => location.href), APP + '/#/sleep', 'a notification can only open a page the app defines');
}
await go('/settings');
await click('Reminders on this phone');
await until('everything to be cancelled when reminders are turned off', async () => phone.pending.size === 0);
step('reminders: denied → off with an explanation; granted → inexact, private wording, no duplicates, cancel on disable; taps open only app routes');

// ------------------------------------------------------------------ 5. back button
await go('/tasks'); await go('/habits');
await emit('App.backButton', { canGoBack: true });
await until('back to go to the previous page', async () => (await page.evaluate(() => location.hash)) === '#/tasks');
await page.keyboard.press('c'); // quick capture dialog
await until('capture dialog', async () => !!(await page.$('.overlay')));
await emit('App.backButton', { canGoBack: true });
await until('back to close the dialog', async () => !(await page.$('.overlay')));
assert.equal(await page.evaluate(() => location.hash), '#/tasks', 'closing a dialog does not also navigate');
await emit('App.backButton', { canGoBack: false });
await until('back at the first page to leave the app in the background', async () => phone.minimized === 1);
assert.ok(phone.vault.get('lifeos.db').includes('From-the-laptop'), 'back never clears data');
step('back: previous page, closes dialogs first, minimizes at the root');

// ------------------------------------------------------------------ 6. export: warned plaintext, encrypted option, import back
await go('/settings');
await click('Export data');
await sees('Export without encryption?');
await click('Cancel');
assert.equal(phone.saved.length, 0, 'cancelling the warning saves nothing');
await click('Export encrypted');
await until('encrypted export', async () => phone.saved.length === 1);
const backup = phone.saved[0];
assert.ok(backup.name.endsWith('.encrypted.json') && JSON.parse(backup.text).lifeosBackup === 1);
assert.ok(!backup.text.includes('From-the-laptop') && !backup.text.includes('"tasks"') && !backup.text.includes(creds.key), 'an encrypted backup has no readable planner and no key');
await rename('Changed-after-backup');
await until('the change to sync', async () => phone.vault.get('lifeos.db').includes('Changed-after-backup') && (await syncLabel()) === 'Synced · encrypted');
const tmp = path.join(fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'lifeos-e2e-')), backup.name);
fs.writeFileSync(tmp, backup.text);
await (await page.$('input[type=file]')).uploadFile(tmp);
await sees('Replace all current data with this backup?');
await click('Import');
await until('the encrypted backup to be imported', async () => (await page.$eval('input.input:not([type])', e => e.value)) === 'From-the-laptop');
fs.rmSync(path.dirname(tmp), { recursive: true });
step('export: plaintext asks first; encrypted export is unreadable; it imports back');

// ------------------------------------------------------------------ 7. app lock
await until('idle', async () => (await syncLabel()) === 'Synced · encrypted');
phone.auth = 'cancel';
await click('App lock');
await sleep(400);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos.device') ?? '{}').lock ?? false), false, 'the lock is not enabled unless the system prompt is passed');
phone.auth = 'ok';
await click('App lock');
await until('lock enabled', async () => page.evaluate(() => JSON.parse(localStorage.getItem('lifeos.device')).lock === true));
phone.auth = 'cancel'; phone.authCalls = 0;
await page.reload(); // process restart
await sees('Life OS is locked');
await sleep(600);
assert.equal(phone.authCalls, 1, 'the system prompt is shown once, not on every render');
assert.ok(!(await text()).includes('From-the-laptop') && !(await text()).includes('Settings'), 'nothing of the planner is drawn while locked');
phone.auth = 'ok';
await click('Unlock');
await sees('Your name');
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('lifeos.device')); d.lockAfter = 0; localStorage.setItem('lifeos.device', JSON.stringify(d)); });
await page.reload(); await sees('Your name'); // unlocks through the prompt (auth ok)
phone.auth = 'cancel'; phone.authCalls = 0;
await emit('App.pause'); await sleep(50); await emit('App.resume');
await sees('Life OS is locked');
phone.auth = 'none'; // the phone's screen lock was removed: the owner must not be locked out
await click('Unlock');
await sees('Your name');
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos.device')).lock), false);
phone.auth = 'ok';
step('app lock: needs the system prompt to enable; locks on restart and after background time; one prompt; no lockout');

// ------------------------------------------------------------------ 8. unreadable local data fails closed
phone.unreadable.add('lifeos.db');
await page.reload();
await sees('restored from the cloud');
await sees('Your name');
assert.deepEqual(phone.asideCalls, ['lifeos.db'], 'the unreadable file is set aside, not overwritten');
assert.equal(await page.$eval('input.input:not([type])', e => e.value), 'From-the-laptop');
phone.asideCalls.length = 0;
phone.unreadable.add('lifeos.db'); phone.online = false;
await page.reload();
await sees("This phone's copy can't be opened");
await sees('Go online and try again');
assert.equal(phone.asideCalls.length, 0, 'offline and unreadable: nothing is replaced, nothing is seeded');
assert.ok(!(await text()).includes('Your name'), 'no empty planner is opened over data that could not be read');
assert.ok(!(await text()).includes('Start over'), 'starting over is not offered while a cloud copy may exist');
phone.online = true;
await click('Try again');
await sees('restored from the cloud');
phone.unreadable.add('lifeos.cloud'); // the saved keys cannot be decrypted
await page.reload();
await sees('Enter your passphrase');
await sees('could not read its saved keys');
await fill('input[type=password]', ['not the passphrase']);
await click('Unlock');
await sees('Wrong passphrase');
assert.ok(!phone.vault.has('lifeos.cloud') || phone.unreadable.has('lifeos.cloud'), 'a wrong passphrase leaves no keys behind');
await fill('input[type=password]', [PASS]);
await click('Unlock');
await gone('Enter your passphrase');
await go('/settings'); await sees('Your name');
step('unreadable copy: restored from the cloud when online, recovery screen when offline, passphrase again when the keys are lost');

// ------------------------------------------------------------------ 9. passphrase changed elsewhere → this phone is asked again
const c2 = JSON.parse(phone.vault.get('lifeos.cloud'));
assert.equal((await api('PUT', c2.token, { blob: cloudRec().blob, base: cloudRec().rev, salt: 'AAAAAAAAAAAAAAAAAAAAAA==', newToken: 'e'.repeat(64) })).status, 200);
await rename('Edit-after-rekey');
await sees('Enter your passphrase');
assert.ok(!phone.vault.has('lifeos.cloud'), 'the old keys are dropped when the server stops accepting them');
step('failed authentication: the phone forgets its keys and asks for the passphrase');

// ------------------------------------------------------------------ wrap up
const violations = await page.evaluate(() => window.__violations);
assert.deepEqual(violations, [], 'Content-Security-Policy violations');
assert.deepEqual(phone.strangers, [], 'requests to hosts other than the app and the sync API');
assert.deepEqual(problems, [], 'page errors');
ws = await webStorage();
assert.ok(!ws.includes('From-the-laptop') && !ws.includes(c2.key) && !ws.includes(c2.token), 'web storage stayed free of planner content and keys throughout');
await browser.close();
console.log(`app e2e: all scenarios passed (${phone.preflights} CORS preflights answered by the real OPTIONS handler)`);
