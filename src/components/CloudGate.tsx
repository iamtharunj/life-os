import { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, LoaderCircle, Lock, RotateCcw, ShieldCheck, TriangleAlert, Upload, WifiOff } from 'lucide-react';
import { confirmBox, recoverWith, unlockCloud, type GateKind } from '../lib/store.ts';
import { WrongPassphrase } from '../lib/cloud.ts';
import { readBackup } from '../lib/io.ts';
import { unlockApp } from '../lib/native.ts';
import { PixelScene } from './pixel.tsx';
import { Btn } from './ui.tsx';

/** Shown before the planner opens: until this device has the passphrase, or when the app cannot open its saved copy. */
export function CloudGate({ kind, note, empty }: { kind: GateKind; note?: string; empty?: boolean }) {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const setup = kind === 'setup';

  const submit = async () => {
    if (busy) return;
    if (setup && pass.length < 10) { setErr('Use at least 10 characters. A few random words work well.'); return; }
    if (setup && pass !== again) { setErr('The two passphrases do not match.'); return; }
    if (!pass) return;
    setErr(''); setBusy(true);
    try { await unlockCloud(pass); }
    catch (e) { setErr(e instanceof WrongPassphrase ? e.message : 'Could not reach the server. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  const startOver = async () => {
    if (await confirmBox('Start over on this phone?', { body: 'Opens the sample planner. The copy that could not be read is kept aside on the phone but cannot be opened by the app again.', ok: 'Start over', danger: true, typeToConfirm: 'START OVER' })) recoverWith(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card pad0" style={{ width: 'min(440px, 100%)', overflow: 'hidden' }}>
        <div style={{ height: 110, position: 'relative' }}><PixelScene seed={11} height={48} /></div>
        <div style={{ padding: 20 }}>
          <div className="eyebrow">Life OS · encrypted sync</div>
          {kind === 'unconfigured' ? (
            <>
              <h2 className="mt8">Connect storage first</h2>
              <p className="small dim mt8">This deployment has nowhere to save yet. In the Vercel dashboard:</p>
              <ol className="small dim" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Open this project → <b>Storage</b> → <b>Create Database</b>.</li>
                <li>Choose <b>Upstash for Redis</b> (free plan) and connect it to this project.</li>
                <li>Go to <b>Deployments</b> and <b>Redeploy</b> the latest one.</li>
              </ol>
              <Btn variant="primary" onClick={() => location.reload()}>I've done that — reload</Btn>
            </>
          ) : kind === 'offline' ? (
            <div className="col gap-12 mt8">
              <h2>Connect once to get started</h2>
              <p className="small dim">This phone has not been unlocked with your passphrase yet, and that first step needs the internet. After that, Life OS opens and saves without a connection.</p>
              {note && <div className="warn-item warn"><TriangleAlert /><span>{note}</span></div>}
              <Btn variant="primary" size="lg" icon={WifiOff} onClick={() => location.reload()}>Try again</Btn>
            </div>
          ) : kind === 'recover' ? (
            <div className="col gap-12 mt8">
              <h2>This phone's copy can't be opened</h2>
              <p className="small dim">Life OS keeps your planner encrypted on this phone. The saved copy could not be decrypted, which can happen after some screen-lock or system changes. Nothing has been deleted.</p>
              {note && <div className="warn-item info"><TriangleAlert /><span>{note}</span></div>}
              <Btn variant="primary" size="lg" icon={RotateCcw} onClick={() => location.reload()}>Try again</Btn>
              <Btn icon={Upload} onClick={() => file.current?.click()}>Restore from a backup file</Btn>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; const db = f && await readBackup(f); if (db) recoverWith(db); }} />
              {/* Only when the cloud is known to be empty: starting over can then replace nothing. */}
              {empty && <Btn variant="ghost" onClick={startOver}>Start over with sample data</Btn>}
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); submit(); }} className="col gap-12 mt8">
              <h2>{setup ? 'Create your passphrase' : 'Enter your passphrase'}</h2>
              <p className="small dim">
                {setup
                  ? 'Your planner is encrypted on this device with this passphrase before anything is uploaded. The server only ever holds unreadable data.'
                  : 'It unlocks your encrypted planner on this device. You only need to type it once per device.'}
              </p>
              {note && <div className="warn-item warn"><TriangleAlert /><span>{note}</span></div>}
              <label className="field"><span>Passphrase</span>
                <input className="input" type="password" autoFocus autoComplete={setup ? 'new-password' : 'current-password'} value={pass} onChange={e => setPass(e.target.value)} />
              </label>
              {setup && (
                <label className="field"><span>Repeat it</span>
                  <input className="input" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} />
                </label>
              )}
              {setup && <div className="warn-item warn"><TriangleAlert /><span>Nobody can reset this. If you forget it, the cloud copy cannot be read by anyone, including you. Write it down somewhere safe.</span></div>}
              {err && <div className="warn-item bad"><TriangleAlert /><span>{err}</span></div>}
              <Btn variant="primary" size="lg" type="submit" disabled={busy} icon={busy ? LoaderCircle : setup ? ShieldCheck : KeyRound}>
                {busy ? 'Deriving keys…' : setup ? 'Create and open' : 'Unlock'}
              </Btn>
              {setup && <p className="tiny muted">Starts with demo data. To bring your existing planner: Export on your laptop, then Settings → Data → Import here.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** App lock (Android): nothing of the planner is drawn until the system prompt is passed. */
export function LockScreen() {
  // Ask once when the lock appears; the button is there if the prompt was dismissed.
  useEffect(() => { unlockApp(); }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="col gap-12" style={{ alignItems: 'center' }}>
        <Lock size={30} className="muted" />
        <h2>Life OS is locked</h2>
        <Btn variant="primary" size="lg" icon={Fingerprint} onClick={unlockApp}>Unlock</Btn>
      </div>
    </div>
  );
}
