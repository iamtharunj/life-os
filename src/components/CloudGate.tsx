import { useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { unlockCloud } from '../lib/store.ts';
import { WrongPassphrase } from '../lib/cloud.ts';
import { PixelScene } from './pixel.tsx';
import { Btn } from './ui.tsx';

/** Hosted build: shown before the planner opens, until this device has the passphrase. */
export function CloudGate({ kind }: { kind: 'setup' | 'unlock' | 'unconfigured' }) {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = kind === 'setup';

  const submit = async () => {
    if (busy) return;
    if (setup && pass.length < 10) { setErr('Use at least 10 characters. A few random words work well.'); return; }
    if (setup && pass !== again) { setErr('The two passphrases do not match.'); return; }
    if (!pass) return;
    setErr(''); setBusy(true);
    try { await unlockCloud(pass); }
    catch (e) { setErr(e instanceof WrongPassphrase ? e.message : 'Could not reach the server. Check your connection and try again.'); setBusy(false); }
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
          ) : (
            <form onSubmit={e => { e.preventDefault(); submit(); }} className="col gap-12 mt8">
              <h2>{setup ? 'Create your passphrase' : 'Enter your passphrase'}</h2>
              <p className="small dim">
                {setup
                  ? 'Your planner is encrypted on this device with this passphrase before anything is uploaded. The server only ever holds unreadable data.'
                  : 'It unlocks your encrypted planner on this device. You only need to type it once per device.'}
              </p>
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
