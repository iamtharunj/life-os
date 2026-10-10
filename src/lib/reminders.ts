// Local reminders (Android app only). No server and no push: everything is planned on the phone from the planner.
// The plan is a pure function of the data, and the same reminder always gets the same id, so scheduling it again
// replaces it instead of duplicating it.
import { LocalNotifications } from '@capacitor/local-notifications';
import type { DB, DateStr } from './types.ts';
import type { RemindPrefs } from './device.ts';
import type { TimerState } from './focus.ts';
import { addDays, fmtDate, fmtTime, parseDate } from './dates.ts';
import { activeHabits, bedN, blocksOn, habitDone, isDone, sleepOn } from './derive.ts';

export type Channel = 'tasks' | 'schedule' | 'habits' | 'sleep' | 'focus';
/** Shown in Android's notification settings, where each can be silenced on its own. */
export const CHANNELS: Record<Channel, string> = {
  tasks: 'Tasks and deadlines', schedule: 'Schedule', habits: 'Habits', sleep: 'Sleep', focus: 'Focus timer',
};
export interface Reminder { id: number; at: Date; channel: Channel; title: string; body: string; route: string }

// ponytail: reminders exist for the next week and are rebuilt whenever the app opens or the planner changes.
// A background job (WorkManager) if the app is ever left closed for longer than that.
const WINDOW_DAYS = 7;
const MAX = 64; // far below Android's limit of 500 alarms per app

/** Stable positive 31-bit id from what the reminder is about (FNV-1a). */
export function reminderId(...parts: string[]) {
  let h = 0x811c9dc5;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return (h >>> 1) || 1;
}

/** Wall-clock time on a calendar day: 08:00 stays 08:00 across daylight-saving changes. */
const at = (date: DateStr, min: number) => { const d = parseDate(date); d.setMinutes(min); return d; };
const inQuiet = (p: RemindPrefs, d: Date) => {
  const m = d.getHours() * 60 + d.getMinutes();
  return p.quietFrom <= p.quietTo ? m >= p.quietFrom && m < p.quietTo : m >= p.quietFrom || m < p.quietTo;
};
// Default wording says nothing about what is in the planner: it can appear on a lock screen.
const PLAIN = 'Life OS';

export function planReminders(d: DB, p: RemindPrefs, now: Date, timer?: Pick<TimerState, 'kind' | 'phase' | 'endsAt' | 'left'>): Reminder[] {
  if (!p.on) return [];
  const out: Reminder[] = [];
  const add = (channel: Channel, when: Date, key: string, route: string, plain: string, detail: [string, string]) => {
    if (when.getTime() <= now.getTime() || (p.quiet && channel !== 'focus' && inQuiet(p, when))) return;
    const [title, body] = p.detail ? detail : [PLAIN, plain];
    out.push({ id: reminderId(channel, key), at: when, channel, title, body, route });
  };
  const s = d.settings;
  const first = fmtDate(now);
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = addDays(first, i);
    if (p.tasks) {
      const due = [
        ...d.tasks.filter(t => t.due === date && !isDone(t)).map(t => t.title),
        ...d.exams.filter(e => e.date === date).map(e => `${d.courses.find(c => c.id === e.courseId)?.code ?? ''} ${e.type}`.trim()),
      ];
      if (due.length) add('tasks', at(date, p.tasksAt), date, '/today', 'You have things due today.',
        [`${due.length} due today`, due.slice(0, 3).join(', ') + (due.length > 3 ? ` and ${due.length - 3} more` : '')]);
    }
    if (p.blocks) for (const b of blocksOn(d, date)) {
      if (b.done || b.missed || b.block.kind === 'sleep') continue;
      add('schedule', at(date, b.start - p.blocksLead), b.key, '/today', 'Something on your schedule starts soon.',
        [b.block.title, `Starts at ${fmtTime(b.start)}${b.block.location ? ` · ${b.block.location}` : ''}`]);
    }
    if (p.habits) {
      const left = activeHabits(d).filter(h => !habitDone(d, h, date)).length;
      if (left) add('habits', at(date, p.habitsAt), date, '/habits', 'Time for your habit check-in.',
        ['Habit check-in', `${left} habit${left === 1 ? '' : 's'} left today`]);
    }
    if (p.sleep) {
      add('sleep', at(date, bedN(s.bedtime) - p.sleepLead), 'bed|' + date, '/sleep', 'Time to wind down.',
        ['Wind down', `Bedtime is ${fmtTime(s.bedtime)} for ${s.sleepTarget}h of sleep`]);
      if (!sleepOn(d, date)) add('sleep', at(date, s.wake + 30), 'log|' + date, '/sleep', 'A quick morning check-in is waiting.',
        ['Sleep log', "Last night's sleep isn't logged yet"]);
    }
  }
  // A running focus or meditation timer: the page cannot ring while the app is in the background, so the phone does.
  if (p.focus && timer && timer.phase !== 'idle' && timer.left === undefined && timer.endsAt)
    add('focus', new Date(timer.endsAt), 'timer', timer.kind === 'meditate' ? '/mind' : '/focus', 'Your timer finished.',
      timer.kind === 'meditate' ? ['Meditation complete', 'Notice how you feel.']
        : timer.phase === 'break' ? ['Break over', 'Ready for another round?'] : ['Focus session complete', 'Time for a break.']);
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX);
}

// ------------------------------------------------------------------ the phone's side
export async function reminderPermission(ask = false): Promise<'granted' | 'denied' | 'prompt'> {
  const s = ask ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  return s.display === 'granted' || s.display === 'denied' ? s.display : 'prompt';
}
export async function createChannels() {
  // importance 3 = sound, no heads-up takeover; visibility 0 = content hidden on a locked screen when Android is set to hide it
  for (const [id, name] of Object.entries(CHANNELS)) await LocalNotifications.createChannel({ id, name, importance: 3, visibility: 0 });
}

let last = '';
/**
 * Make the phone's scheduled notifications match the plan: cancel what no longer applies, (re)schedule the rest.
 * Scheduling an id that is already pending replaces it, so running this twice never duplicates anything.
 * `api` is swappable in tests.
 */
export async function syncReminders(plan: Reminder[], force = false, api: Pick<typeof LocalNotifications, 'getPending' | 'cancel' | 'schedule'> = LocalNotifications) {
  const sig = JSON.stringify(plan);
  if (!force && sig === last) return;
  const pending = (await api.getPending()).notifications;
  const keep = new Set(plan.map(r => r.id));
  const stale = pending.filter(n => !keep.has(n.id)).map(n => ({ id: n.id }));
  if (stale.length) await api.cancel({ notifications: stale });
  if (plan.length) await api.schedule({
    notifications: plan.map(r => ({
      id: r.id, title: r.title, body: r.body, channelId: r.channel, extra: { route: r.route },
      // Inexact on purpose: no exact-alarm permission is requested. Android may deliver a few minutes late.
      schedule: { at: r.at, allowWhileIdle: true }, isExactNotification: false,
    })),
  });
  last = sig;
}
export const testReminder = () => LocalNotifications.schedule({
  notifications: [{ id: reminderId('test'), title: PLAIN, body: 'Reminders are working.', channelId: 'tasks', extra: { route: '/settings' } }],
});
