// Settings that belong to this phone, not to the planner: they are never synced and hold no planner content.
import { signal } from './store.ts';

export interface RemindPrefs {
  on: boolean;
  tasks: boolean; tasksAt: number; // minutes from midnight
  blocks: boolean; blocksLead: number; // minutes before a time block starts
  habits: boolean; habitsAt: number;
  sleep: boolean; sleepLead: number; // minutes before bedtime
  focus: boolean;
  quiet: boolean; quietFrom: number; quietTo: number;
  detail: boolean; // name tasks and blocks in the notification instead of generic text
}
export interface DevicePrefs {
  lock: boolean;
  lockAfter: number; // minutes in the background before the app locks; 0 = every time
  screenshots: boolean; // allow screenshots and the recent-apps preview
  remind: RemindPrefs;
}
export const DEFAULT_REMIND: RemindPrefs = {
  on: false,
  tasks: true, tasksAt: 8 * 60,
  blocks: true, blocksLead: 10,
  habits: true, habitsAt: 20 * 60,
  sleep: true, sleepLead: 30,
  focus: true,
  quiet: true, quietFrom: 23 * 60, quietTo: 7 * 60,
  detail: false,
};
const DEFAULTS: DevicePrefs = { lock: false, lockAfter: 1, screenshots: false, remind: DEFAULT_REMIND };

const KEY = 'lifeos.device';
function read(): DevicePrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...DEFAULTS, ...saved, remind: { ...DEFAULT_REMIND, ...saved.remind } };
  } catch { return DEFAULTS; }
}
export const device = signal<DevicePrefs>(read());
export function setDevice(patch: Partial<DevicePrefs>) {
  device.set(d => ({ ...d, ...patch }));
  try { localStorage.setItem(KEY, JSON.stringify(device.get())); } catch { /* ignore */ }
}
export const setRemind = (patch: Partial<RemindPrefs>) => setDevice({ remind: { ...device.get().remind, ...patch } });
