import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, BellRing, Database, Download, Dumbbell, Flame, Keyboard, KeyRound, LoaderCircle, Lock, Moon, Palette, Plus, ShieldCheck, Sparkles, Target, Trash2, TriangleAlert, Upload, User, Utensils, Wallet, X, RotateCcw, Eraser } from 'lucide-react';
import type { MealSlot, Settings, WarningKind } from '../lib/types.ts';
import { changePassphrase, cloudBackups, confirmBox, lockDevice, restoreBackup, setSettings, storage, sync, toast, undo, update, useDB } from '../lib/store.ts';
import { WrongPassphrase } from '../lib/cloud.ts';
import { device, setDevice, setRemind } from '../lib/device.ts';
import { authenticate } from '../lib/native.ts';
import { native } from '../lib/platform.ts';
import { createChannels, reminderPermission, syncReminders, testReminder } from '../lib/reminders.ts';
import { Vault } from '../lib/vault.ts';
import { fmtDur, fmtTime, parseTime } from '../lib/dates.ts';
import { ACCENTS, MEAL_SLOTS } from '../lib/meta.ts';
import { clearAll, exportData, importData, removeDemo, resetDemo } from '../lib/io.ts';
import { Btn, Card, Field, IconBtn, Modal, Seg, Toggle, nav } from '../components/ui.tsx';
import { IconOf } from '../components/icons.tsx';

const WARN_LABELS: Record<WarningKind, string> = {
  sleep: 'Sleep target missed repeatedly', schedule: "Schedule leaves too little sleep", deadline: 'Assignments & exams due soon',
  overdue: 'Overdue tasks', tasks: 'Many unfinished tasks in the evening', project: 'Projects without progress',
  budget: 'Approaching / over monthly budget', logsleep: "Reminder to log last night's sleep",
};

function Num({ value, onChange, step = 1, min = 0, suffix, w = 90 }: { value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string; w?: number }) {
  return <div className="row gap-4"><input className="input num" type="number" step={step} min={min} value={value} style={{ width: w }} onChange={e => e.target.value !== '' && onChange(Number(e.target.value))} />{suffix && <span className="small muted">{suffix}</span>}</div>;
}
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="li" style={{ padding: '10px 4px' }}><div className="grow"><div className="small">{label}</div>{hint && <div className="tiny muted">{hint}</div>}</div>{children}</div>;
}

export default function SettingsPage() {
  const d = useDB();
  const s = d.settings;
  const set = (p: Partial<Settings>) => setSettings(p);
  const file = useRef<HTMLInputElement>(null);
  const status = sync.use();
  const mode = storage.use();
  const routine = ((s.wake - s.bedtime + 1440) % 1440);

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head"><div><div className="eyebrow">System</div><h1>Settings</h1><div className="sub">Everything saves instantly.</div></div></div>
      <div className="g g2" style={{ alignItems: 'start' }}>
        <div className="g">
          <Card title="Profile" icon={User}>
            <Field label="Your name"><input className="input" value={s.name} onChange={e => set({ name: e.target.value })} /></Field>
          </Card>
          <Card title="Appearance" icon={Palette}>
            <Row label="Theme"><Seg value={s.theme} onChange={theme => set({ theme })} options={[{ k: 'dark', label: 'Dark' }, { k: 'black', label: 'OLED black' }]} /></Row>
            <Row label="Accent color">
              <div className="row gap-4">
                {ACCENTS.map(c => <button key={c} aria-label={c} onClick={() => set({ accent: c })} style={{ width: 24, height: 24, borderRadius: 7, background: c, outline: s.accent === c ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} />)}
                <input type="color" value={s.accent} onChange={e => set({ accent: e.target.value })} style={{ width: 30, height: 26, background: 'none', border: 0 }} aria-label="Custom accent" />
              </div>
            </Row>
            <Row label="Pixel-art scenery"><Toggle on={s.banner} onChange={banner => set({ banner })} label="Pixel banner" /></Row>
            <Row label="Animations" hint="Completion, XP and page transitions"><Toggle on={s.motion} onChange={motion => set({ motion })} label="Animations" /></Row>
          </Card>
          <Card title="Sleep" icon={Moon}>
            <Row label="Minimum sleep target"><Num value={s.sleepTarget} step={0.25} onChange={sleepTarget => set({ sleepTarget })} suffix="hours" /></Row>
            <Row label="Planned bedtime"><input className="input" type="time" value={fmtTime(s.bedtime)} style={{ width: 120 }} onChange={e => e.target.value && set({ bedtime: parseTime(e.target.value) })} /></Row>
            <Row label="Planned wake time" hint={<span className={routine < s.sleepTarget * 60 ? 'bad' : 'good'}>Routine allows {fmtDur(routine)}{routine < s.sleepTarget * 60 ? ' — below your target' : ''}</span>}>
              <input className="input" type="time" value={fmtTime(s.wake)} style={{ width: 120 }} onChange={e => e.target.value && set({ wake: parseTime(e.target.value) })} />
            </Row>
            <Row label="Planner scrolls to" hint="First hour shown in week/day views"><Num value={s.gridStart} min={0} onChange={gridStart => set({ gridStart: Math.min(20, gridStart) })} suffix=":00" w={70} /></Row>
          </Card>
          <Card title="Weekly targets" icon={Target}>
            <Row label="Study"><Num value={s.weekly.studyHours} onChange={v => set({ weekly: { ...s.weekly, studyHours: v } })} suffix="h / week" /></Row>
            <Row label="Training sessions"><Num value={s.weekly.workouts} onChange={v => set({ weekly: { ...s.weekly, workouts: v } })} suffix="/ week" /></Row>
            <Row label="Sets per muscle group" hint="Body map turns fully lit at this many sets in 7 days"><Num value={s.weekly.muscleSets} onChange={v => set({ weekly: { ...s.weekly, muscleSets: Math.max(1, v) } })} suffix="sets / week" /></Row>
            <Row label="Running"><Num value={s.weekly.runKm} onChange={v => set({ weekly: { ...s.weekly, runKm: v } })} suffix="km / week" /></Row>
            <Row label="Meditation"><Num value={s.weekly.mindfulMin} step={5} onChange={v => set({ weekly: { ...s.weekly, mindfulMin: v } })} suffix="min / week" /></Row>
            <Row label="Protein"><Num value={s.proteinTarget} step={5} onChange={proteinTarget => set({ proteinTarget })} suffix="g / day" /></Row>
            <Row label="Water"><Num value={s.waterTarget} onChange={waterTarget => set({ waterTarget: Math.max(1, Math.min(20, waterTarget)) })} suffix="glasses" /></Row>
            <Row label="Calories (optional)" hint="0 = not tracked"><Num value={s.kcalTarget} step={50} onChange={kcalTarget => set({ kcalTarget })} suffix="kcal" /></Row>
          </Card>
          <Card title="XP values" icon={Sparkles}>
            <p className="tiny muted" style={{ marginBottom: 6 }}>XP is recalculated from your history, so changes apply everywhere. Nothing done after bedtime earns XP.</p>
            {([['task', 'Task done'], ['taskHigh', 'High-priority task'], ['sleep', `Sleep ≥ ${s.sleepTarget}h`], ['workout', 'Workout'], ['study30', 'Every 30 min study'], ['focus', 'Focus session'],
              ['meditation', 'Meditation'], ['journal', 'Journal day'], ['projectUpdate', 'Project progress update'], ['milestone', 'Milestone reached'], ['dayReview', 'Daily review'], ['weekReview', 'Weekly review'], ['monthReview', 'Monthly review']] as [keyof Settings['xp'], string][]).map(([k, l]) => (
              <Row key={k} label={l}><Num value={s.xp[k]} step={5} onChange={v => set({ xp: { ...s.xp, [k]: v } })} suffix="XP" w={80} /></Row>
            ))}
            <div className="row mt8"><Btn size="sm" onClick={() => nav('/home')}>Manage rewards</Btn></div>
          </Card>
        </div>

        <div className="g">
          <Card title="Finance" icon={Wallet}>
            <Row label="Currency symbol"><input className="input" value={s.currency} style={{ width: 70 }} onChange={e => set({ currency: e.target.value })} /></Row>
            <Row label="Monthly budget"><Num value={s.monthlyBudget} step={500} onChange={monthlyBudget => set({ monthlyBudget })} w={110} /></Row>
            <Row label="Opening balance" hint="Balance = this + income − expenses since the date"><Num value={s.openingBalance} step={100} onChange={openingBalance => set({ openingBalance })} w={110} /></Row>
            <Row label="Opening date"><input className="input" type="date" value={s.openingDate} style={{ width: 150 }} onChange={e => e.target.value && set({ openingDate: e.target.value })} /></Row>
            <ListEditor label="Expense categories" items={s.expenseCategories} onChange={expenseCategories => set({ expenseCategories })} />
            <ListEditor label="Payment methods" items={s.paymentMethods} onChange={paymentMethods => set({ paymentMethods })} />
          </Card>
          <Card title="Meal presets (mess menu)" icon={Utensils}>
            <p className="tiny muted" style={{ marginBottom: 8 }}>These appear as one-tap chips when you log a meal.</p>
            <FoodEditor />
          </Card>
          <Card title="Habits" icon={Flame}>
            {d.habits.filter(h => !h.archived).map(h => (
              <div key={h.id} className="li"><IconOf name={h.icon} /><span className="grow small">{h.name}</span><span className="tiny muted">{h.freq >= 7 ? 'daily' : `${h.freq}×/wk`}</span><Btn size="sm" variant="ghost" onClick={() => update('habits', h.id, { archived: true })}>Archive</Btn></div>
            ))}
            <div className="row mt8"><Btn size="sm" onClick={() => nav('/habits')}>Open habits</Btn></div>
          </Card>
          <Card title="Workouts" icon={Dumbbell}>
            <Row label="Templates" hint={d.templates.map(t => t.name).join(' · ') || 'none yet'}><Btn size="sm" onClick={() => nav('/fitness')}>Manage</Btn></Row>
          </Card>
          <Card title="Warnings" icon={Bell}>
            {(Object.keys(WARN_LABELS) as WarningKind[]).map(k => (
              <Row key={k} label={WARN_LABELS[k]}><Toggle on={s.warnings[k]} onChange={v => set({ warnings: { ...s.warnings, [k]: v } })} label={WARN_LABELS[k]} /></Row>
            ))}
            {'Notification' in window && (
              <Row label="Desktop notifications" hint="Used when a focus or meditation timer ends while the tab is hidden">
                <Btn size="sm" disabled={Notification.permission !== 'default'} onClick={() => Notification.requestPermission()}>{Notification.permission === 'granted' ? 'Enabled' : Notification.permission === 'denied' ? 'Blocked in browser' : 'Enable'}</Btn>
              </Row>
            )}
          </Card>
          {native && <RemindersCard />}
          {native && <SecurityCard />}
          <Card title="Data" icon={Database}>
            <p className="small dim">{mode === 'cloud'
              ? 'Encrypted on this device with your passphrase, then synced. The server stores only unreadable data, plus one encrypted snapshot per day for 35 days.'
              : status === 'local' ? 'Running without the local server: data is stored in this browser. Export backups regularly.'
              : 'Stored on your disk in data/lifeos.json. A daily copy goes to data/backups (last 30 days kept). Deleting anything can be undone right after.'}</p>
            <div className="row wrap mt12">
              <Btn icon={Download} onClick={() => exportData()}>Export data</Btn>
              {mode === 'cloud' && <Btn icon={Lock} onClick={() => exportData(true)}>Export encrypted</Btn>}
              <Btn icon={Upload} onClick={() => file.current?.click()}>Import data</Btn>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
            </div>
            <div className="hr" />
            <div className="row wrap">
              <Btn icon={Eraser} onClick={removeDemo}>Remove demo data</Btn>
              <Btn icon={RotateCcw} onClick={resetDemo}>Reset demo data</Btn>
              <Btn variant="danger" icon={Trash2} onClick={clearAll}>Delete everything</Btn>
            </div>
            {mode === 'cloud' && <CloudData />}
          </Card>
          <Card title="Keyboard" icon={Keyboard}>
            {[['Ctrl / ⌘ + K', 'Search & command palette'], ['C or N', 'Quick capture'], ['T / W / F / H', 'Today · Week · Focus · Home'], ['/', 'Search'], ['Ctrl + Z', 'Undo last delete'], ['Enter', 'Save a form'], ['Ctrl + Enter', 'Save from a text area'], ['Esc', 'Close']].map(([k, v]) => (
              <div key={k} className="li"><span className="kbd">{k}</span><span className="small grow" style={{ textAlign: 'right' }}>{v}</span></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (xs: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="mt12">
      <div className="small" style={{ marginBottom: 6 }}>{label}</div>
      <div className="chips">
        {items.map(c => <span key={c} className="chip">{c}<button aria-label={`Remove ${c}`} onClick={() => onChange(items.filter(x => x !== c))}><X size={11} /></button></span>)}
        <form className="row gap-4" onSubmit={e => { e.preventDefault(); const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV(''); }}>
          <input className="input" style={{ height: 28, width: 120 }} placeholder="Add…" value={v} onChange={e => setV(e.target.value)} />
        </form>
      </div>
    </div>
  );
}

function FoodEditor() {
  const d = useDB();
  const foods = d.settings.foods;
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [slot, setSlot] = useState<MealSlot>('lunch');
  return (
    <>
      <div className="list">
        {foods.map((f, i) => (
          <div key={i} className="li">
            <span className="grow small">{f.name}</span>
            <span className="tiny muted">{MEAL_SLOTS.find(s => s.k === f.slot)?.label ?? 'Any'}</span>
            <span className="num small" style={{ width: 44, textAlign: 'right' }}>{f.protein}g</span>
            <IconBtn icon={X} sm label="Remove" onClick={() => setSettings({ foods: foods.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
      <form className="row wrap mt8" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; setSettings({ foods: [...foods, { name: name.trim(), protein: Number(protein) || 0, slot }] }); setName(''); setProtein(''); }}>
        <input className="input" placeholder="Food" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <input className="input num" placeholder="g protein" value={protein} onChange={e => setProtein(e.target.value)} style={{ width: 90 }} />
        <select className="select" value={slot} onChange={e => setSlot(e.target.value as MealSlot)} style={{ width: 120 }}>{MEAL_SLOTS.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}</select>
        <Btn type="submit" icon={Plus}>Add</Btn>
      </form>
    </>
  );
}

function CloudData() {
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState('');
  const [changing, setChanging] = useState(false);
  useEffect(() => { if (!changing) cloudBackups().then(setDays); }, [changing]);
  const restore = async () => {
    if (!day || !(await confirmBox(`Restore the backup from ${day}?`, { body: 'Your planner is replaced by that day\'s snapshot. You can undo right after.', ok: 'Restore' }))) return;
    if (await restoreBackup(day)) toast(`Restored ${day}`, { action: 'Undo', onAction: undo });
    else toast('That backup could not be loaded', { kind: 'warn' });
  };
  const lock = async () => {
    if (await confirmBox('Lock this device?', { body: 'Removes the passphrase and the local copy from this device. The encrypted cloud copy stays. You will need your passphrase to open Life OS here again.', ok: 'Lock' })) {
      if (native) await syncReminders([], true).catch(() => {}); // nothing keeps ringing for a planner this phone can no longer open
      lockDevice();
    }
  };
  return (
    <>
      <div className="hr" />
      <div className="row wrap">
        <select className="select" style={{ width: 210 }} value={day} onChange={e => setDay(e.target.value)} aria-label="Daily backup">
          <option value="">{days.length ? 'Restore a daily backup…' : 'No daily backups yet'}</option>
          {days.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <Btn disabled={!day} onClick={restore}>Restore</Btn>
        <Btn icon={Lock} onClick={lock}>Lock this device</Btn>
        <Btn icon={KeyRound} onClick={() => setChanging(true)}>Change passphrase</Btn>
      </div>
      {changing && <ChangePassphrase close={() => setChanging(false)} />}
    </>
  );
}

function ChangePassphrase({ close }: { close: () => void }) {
  const [cur, setCur] = useState('');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || !cur) return;
    if (pass.length < 10) { setErr('Use at least 10 characters. A few random words work well.'); return; }
    if (pass !== again) { setErr('The two new passphrases do not match.'); return; }
    setErr(''); setBusy(true);
    try { await changePassphrase(cur, pass); toast('Passphrase changed. Your other devices will ask for the new one.'); close(); }
    catch (e) { setErr(e instanceof WrongPassphrase ? e.message : 'Could not change it. Check your connection and try again.'); setBusy(false); }
  };
  return (
    <Modal open onClose={close} title="Change passphrase" icon={KeyRound}>
      <form className="modal-b col gap-12" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="small dim">Your planner is encrypted again with the new passphrase. Your other devices will ask for it once. Daily backups made before the change are removed, because only the old passphrase could read them.</p>
        <Field label="Current passphrase"><input className="input" type="password" autoFocus autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></Field>
        <Field label="New passphrase"><input className="input" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} /></Field>
        <Field label="Repeat it"><input className="input" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} /></Field>
        <div className="warn-item warn"><TriangleAlert /><span>Nobody can reset this. If you forget the new one, the cloud copy cannot be read by anyone, including you.</span></div>
        {err && <div className="warn-item bad"><TriangleAlert /><span>{err}</span></div>}
        <Btn variant="primary" type="submit" disabled={busy} icon={busy ? LoaderCircle : KeyRound}>{busy ? 'Encrypting again…' : 'Change passphrase'}</Btn>
      </form>
    </Modal>
  );
}

function TimeInput({ value, onChange, label }: { value: number; onChange: (min: number) => void; label: string }) {
  return <input className="input" type="time" aria-label={label} value={fmtTime(value)} style={{ width: 112 }} onChange={e => e.target.value && onChange(parseTime(e.target.value))} />;
}

/** Android app only. Reminders are planned on the phone (lib/reminders.ts); nothing here is synced. */
function RemindersCard() {
  const r = device.use().remind;
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  useEffect(() => { reminderPermission().then(setPerm).catch(() => {}); }, [r.on]);
  const turn = async (on: boolean) => {
    if (!on) { setRemind({ on: false }); return; }
    const p = await reminderPermission(true).catch(() => 'denied' as const);
    setPerm(p);
    if (p !== 'granted') { toast('Android is blocking notifications for Life OS. Allow them under Settings → Apps → Life OS → Notifications. The alert bell inside the app keeps working either way.', { kind: 'warn' }); return; }
    await createChannels().catch(() => {});
    setRemind({ on: true });
  };
  return (
    <Card title="Reminders" icon={BellRing}>
      <Row label="Reminders on this phone" hint={r.on && perm === 'denied' ? <span className="bad">Blocked in Android settings, so nothing will show</span> : perm === 'granted' ? 'Allowed by Android' : 'Android asks for permission when you turn this on'}>
        <Toggle on={r.on} onChange={turn} label="Reminders on this phone" />
      </Row>
      {r.on && (
        <>
          <Row label="Tasks and exams due" hint="One reminder on the day">
            <TimeInput label="Time for due reminders" value={r.tasksAt} onChange={tasksAt => setRemind({ tasksAt })} /><Toggle on={r.tasks} onChange={tasks => setRemind({ tasks })} label="Tasks and exams due" />
          </Row>
          <Row label="Schedule" hint="Before each time block starts">
            <Num value={r.blocksLead} onChange={blocksLead => setRemind({ blocksLead: Math.min(120, blocksLead) })} suffix="min" w={64} /><Toggle on={r.blocks} onChange={blocks => setRemind({ blocks })} label="Schedule" />
          </Row>
          <Row label="Habit check-in" hint="Only when something is still open">
            <TimeInput label="Time for the habit check-in" value={r.habitsAt} onChange={habitsAt => setRemind({ habitsAt })} /><Toggle on={r.habits} onChange={habits => setRemind({ habits })} label="Habit check-in" />
          </Row>
          <Row label="Sleep" hint="Wind-down before bedtime, and a morning nudge to log it">
            <Num value={r.sleepLead} onChange={sleepLead => setRemind({ sleepLead: Math.min(180, sleepLead) })} suffix="min" w={64} /><Toggle on={r.sleep} onChange={sleep => setRemind({ sleep })} label="Sleep" />
          </Row>
          <Row label="Focus timer" hint="When a session or break ends while the app is in the background">
            <Toggle on={r.focus} onChange={focus => setRemind({ focus })} label="Focus timer" />
          </Row>
          <Row label="Quiet hours" hint="Nothing is scheduled inside this window">
            <TimeInput label="Quiet from" value={r.quietFrom} onChange={quietFrom => setRemind({ quietFrom })} /><TimeInput label="Quiet until" value={r.quietTo} onChange={quietTo => setRemind({ quietTo })} /><Toggle on={r.quiet} onChange={quiet => setRemind({ quiet })} label="Quiet hours" />
          </Row>
          <Row label="Show details" hint="Names tasks and time blocks in the notification. Off keeps the text generic, which is safer on a lock screen">
            <Toggle on={r.detail} onChange={detail => setRemind({ detail })} label="Show details" />
          </Row>
          <div className="row wrap mt8"><Btn size="sm" onClick={() => testReminder().catch(() => toast('Android did not accept the test. Check that notifications are allowed.', { kind: 'warn' }))}>Send a test</Btn></div>
          <p className="tiny muted mt8">Planned on this phone for the next 7 days and refreshed whenever you open Life OS. No internet needed. Android may deliver them a few minutes late; if they go missing, set Life OS to Unrestricted under Android Settings → Apps → Life OS → Battery.</p>
        </>
      )}
    </Card>
  );
}

/** Android app only. */
function SecurityCard() {
  const d = device.use();
  const setLock = async (lock: boolean) => {
    if (lock && !(await Vault.canAuthenticate().catch(() => ({ available: false }))).available) {
      toast('Set up a screen lock or fingerprint in Android settings first.', { kind: 'warn' });
      return;
    }
    if (await authenticate()) setDevice({ lock }); // prove it is you, to turn it on and to turn it off
  };
  return (
    <Card title="App security" icon={ShieldCheck}>
      <Row label="App lock" hint="Ask for your fingerprint, face or screen lock before showing the planner">
        <Toggle on={d.lock} onChange={setLock} label="App lock" />
      </Row>
      {d.lock && (
        <Row label="Lock again after" hint="Time in the background before it asks again">
          <select className="select" style={{ width: 140 }} aria-label="Lock again after" value={d.lockAfter} onChange={e => setDevice({ lockAfter: Number(e.target.value) })}>
            <option value={0}>Every time</option><option value={1}>1 minute</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option>
          </select>
        </Row>
      )}
      <Row label="Allow screenshots" hint="Off blocks screenshots and screen recording. The recent-apps preview stays hidden on Android 13 and newer either way">
        <Toggle on={d.screenshots} onChange={screenshots => { setDevice({ screenshots }); Vault.setSecure({ on: !screenshots }).catch(() => {}); }} label="Allow screenshots" />
      </Row>
      <p className="tiny muted mt8">Your planner and sync keys are stored encrypted on this phone with a key held by Android's Keystore. The app lock is an extra screen in front of that. It does not replace your phone's own lock.</p>
    </Card>
  );
}
