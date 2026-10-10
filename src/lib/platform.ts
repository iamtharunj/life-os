// Which build is running: the website, or the same code bundled inside the Android app.
import { Capacitor } from '@capacitor/core';

export const native = Capacitor.isNativePlatform();

/** The one sync backend. Public configuration, not a secret; nothing in the planner can change it. */
export const CLOUD_ORIGIN = 'https://life-os-ecru-omega.vercel.app';
/** The website calls its own origin. The app is served from https://localhost, so it names the backend in full. */
export const cloudApi = (isNative: boolean) => (isNative ? CLOUD_ORIGIN : '') + '/api/cloud';
export const CLOUD_API = cloudApi(native);

/** Planner links are user data. Only web and mail links become clickable; a bare "github.com/x" is treated as https. */
export function safeHref(url?: string) {
  const u = url?.trim();
  if (!u) return undefined;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? undefined : 'https://' + u;
}
