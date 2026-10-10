// Where this device keeps the planner and its sync keys.
//   Website: localStorage, exactly as before (readable by anything with access to the browser profile).
//   Android app: files encrypted by the native Vault plugin with a key that never leaves the Android Keystore.
// The two encryption layers stay separate: cloud.ts protects the copy on the server, this protects the copy on the phone.
import { registerPlugin } from '@capacitor/core';
import { native } from './platform.ts';

/** android/app/src/main/java/.../VaultPlugin.kt */
export interface VaultPlugin {
  get(o: { key: string }): Promise<{ value?: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
  /** Keep a file that cannot be decrypted under another name, instead of overwriting it. */
  setAside(o: { key: string }): Promise<void>;
  canAuthenticate(): Promise<{ available: boolean }>;
  /** System biometric / screen-lock prompt. Rejects with code UNAVAILABLE when the phone has no screen lock. */
  authenticate(o: { title: string }): Promise<void>;
  /** Block screenshots, screen recording and the recent-apps preview. */
  setSecure(o: { on: boolean }): Promise<void>;
  /** System "save as" picker; the user chooses where the file goes. */
  saveFile(o: { name: string; text: string }): Promise<{ saved: boolean }>;
}
export const Vault = registerPlugin<VaultPlugin>('Vault');

/** The app could not decrypt what it stored (lost Keystore key, damaged file). Never thrown on the website. */
export class Unreadable extends Error {}

interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
// Each call touches localStorage before it returns, so callers that cannot wait (page unload) still get the write.
const web: SecureStore = {
  async get(key) { return localStorage.getItem(key); },
  async set(key, value) { localStorage.setItem(key, value); },
  async remove(key) { localStorage.removeItem(key); },
};
const unreadable = new Set<string>();
const app: SecureStore = {
  async get(key) {
    try { return (await Vault.get({ key })).value ?? null; }
    catch { unreadable.add(key); throw new Unreadable(`This device's copy of ${key} cannot be decrypted`); }
  },
  async set(key, value) {
    // Replacing something we could not open: keep the old file aside rather than destroy it.
    if (unreadable.delete(key)) await Vault.setAside({ key }).catch(() => {});
    await Vault.set({ key, value });
  },
  remove: key => Vault.remove({ key }),
};
export const secure: SecureStore = native ? app : web;
