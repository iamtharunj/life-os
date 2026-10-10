// Android-only glue: app lock, back button, background/foreground, reminders. main.tsx calls initNative() inside the app.
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NAV } from '../components/nav.ts';
import { device, setDevice } from './device.ts';
import { timer } from './focus.ts';
import { native } from './platform.ts';
import { planReminders, syncReminders } from './reminders.ts';
import { flush, getDB, ready, refresh, signal, subscribe, toast } from './store.ts';
import { Vault } from './vault.ts';

// ------------------------------------------------------------------ app lock
// A screen in front of the app, checked by the system's own biometric / screen-lock prompt. It does not change how
// the data is encrypted: that is the Keystore's job (vault.ts).
export const appLocked = signal(native && device.get().lock);
let prompting = false;
let hiddenAt = 0;

/** True when the person passed the system prompt. */
export async function authenticate() {
  if (prompting) return false;
  prompting = true;
  try { await Vault.authenticate({ title: 'Unlock Life OS' }); return true; }
  catch (e) {
    if ((e as { code?: string }).code !== 'UNAVAILABLE') return false;
    // The phone no longer has a screen lock, so there is nothing to check against. Don't lock its owner out.
    setDevice({ lock: false });
    toast('App lock was turned off: this phone has no screen lock set up.', { kind: 'warn' });
    return true;
  } finally { prompting = false; }
}
export async function unlockApp() { if (await authenticate()) appLocked.set(false); }

// ------------------------------------------------------------------ reminders
let replanTimer: ReturnType<typeof setTimeout> | undefined;
/** Rebuild the reminder plan from the planner. Skipped until the planner is open, so a locked start never cancels anything. */
export function replan(force = false) {
  clearTimeout(replanTimer);
  replanTimer = setTimeout(() => {
    if (!ready.get()) return;
    syncReminders(planReminders(getDB(), device.get().remind, new Date(), timer.get()), force).catch(() => {});
  }, force ? 0 : 1500);
}
/** Only routes the app itself defines are ever opened from a notification. */
export const isRoute = (r: unknown): r is string => typeof r === 'string' && NAV.some(n => n.to === r);

export function initNative() {
  Vault.setSecure({ on: !device.get().screenshots }).catch(() => {});

  App.addListener('pause', () => {
    if (!prompting) hiddenAt = Date.now(); // the system prompt itself can pause the app
    flush(); // best effort: Android usually leaves time for this, but an upload in progress is not guaranteed to finish
  });
  App.addListener('resume', () => {
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (!prompting && away && device.get().lock && away >= device.get().lockAfter * 60000) appLocked.set(true);
    refresh();
    replan(true); // the clock, time zone or pending alarms may have changed while we were away
  });
  App.addListener('backButton', ({ canGoBack }) => {
    if (appLocked.get()) { App.minimizeApp(); return; }
    if (document.querySelector('.overlay')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
    if (canGoBack) history.back(); else App.minimizeApp();
  });

  LocalNotifications.addListener('localNotificationActionPerformed', a => {
    const r = (a.notification.extra as { route?: unknown } | undefined)?.route;
    if (isRoute(r)) location.hash = r;
  });
  subscribe(() => replan());
  device.subscribe(() => replan());
  timer.subscribe(() => replan());
  ready.subscribe(() => replan(true));
}
