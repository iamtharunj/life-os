import { useEffect, useState } from 'react';
import { Feather, Heart, Leaf, Pause, Play, Plus, Square, Sparkles, Wind } from 'lucide-react';
import { useDB } from '../lib/store.ts';
import { addDays, fmtDur, range, shortDate, today, weekStart, diffDays, parseDate, dow } from '../lib/dates.ts';
import { journalOn, mindStats, moodOn, habitStreak } from '../lib/derive.ts';
import { JOURNAL_PROMPTS, MEDITATION_TYPES, AREAS } from '../lib/meta.ts';
import { timer, startTimer, pauseTimer, resumeTimer, stopTimer, remainingMs, running, fmtClock } from '../lib/focus.ts';
import { Btn, Card, Chips, Empty, Meter, Seg, Stat, moodFace, useNow } from '../components/ui.tsx';
import { Heatmap, Lines, ramp } from '../components/charts.tsx';
import { openCapture, openEditor } from '../components/editors.tsx';

const PATTERNS = {
  box: { label: 'Box 4·4·4·4', steps: [['Breathe in', 4, 1], ['Hold', 4, 1], ['Breathe out', 4, 0.55], ['Hold', 4, 0.55]] },
  relax: { label: 'Relax 4·7·8', steps: [['Breathe in', 4, 1], ['Hold', 7, 1], ['Breathe out', 8, 0.55]] },
  coherent: { label: 'Coherent 5·5', steps: [['Breathe in', 5, 1], ['Breathe out', 5, 0.55]] },
} as const;
type Pattern = keyof typeof PATTERNS;

export default function Mind() {
  const d = useDB();
  const T = today();
  const s = timer.use();
  const now = useNow(250);
  const [mins, setMins] = useState(5);
  const [type, setType] = useState<string>('Breathing');
  const [pattern, setPattern] = useState<Pattern>('box');
  const active = s.kind === 'meditate' && s.phase !== 'idle';
  const rem = active ? remainingMs(s, now.getTime()) : mins * 60000;

  // breathing guide: step through the pattern while the timer runs
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || !running(s)) return;
    const p = PATTERNS[pattern].steps;
    const t = setTimeout(() => setStep(x => (x + 1) % p.length), p[step % p.length][1] * 1000);
    return () => clearTimeout(t);
  }, [active, running(s), step, pattern]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = PATTERNS[pattern].steps[step % PATTERNS[pattern].steps.length];

  const ws = weekStart(T);
  const week = mindStats(d, ws, T);
  const medHabit = d.habits.find(h => h.auto === 'meditate');
  const streak = medHabit ? habitStreak(d, medHabit, T) : undefined;
  const prompt = JOURNAL_PROMPTS[Math.abs(diffDays(T, '2026-01-01')) % JOURNAL_PROMPTS.length];
  const todays = journalOn(d, T);
  const entries = [...d.journal].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const days30 = range(addDays(T, -29), T);
  const heatDays = range(weekStart(addDays(T, -7 * 17)), addDays(weekStart(T), 6));
  const gratitude = entries.flatMap(e => (e.gratitude ?? []).map(g => ({ g, date: e.date }))).slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Life · mind</div><h1>Mindfulness</h1><div className="sub">Meditation and journaling. Small, daily, no pressure.</div></div>
        <div className="row"><Btn icon={Plus} onClick={() => openEditor('meditation')}>Log meditation</Btn><Btn variant="primary" icon={Feather} onClick={() => openCapture('journal')}>Write</Btn></div>
      </div>

      <div className="g split" style={{ ['--cols' as string]: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card title="Meditate" icon={Leaf}>
          <div className="row gap-16 wrap" style={{ justifyContent: 'center', padding: '8px 0' }}>
            <div className="breath" style={{ ['--s' as string]: active && running(s) ? cur[2] : 0.7, ['--t' as string]: `${active ? cur[1] : 1}s` }}>
              <div style={{ position: 'relative', textAlign: 'center' }}>
                <div className="focus-time" style={{ fontSize: 38 }}>{fmtClock(rem)}</div>
                <div className="small dim">{active ? (running(s) ? cur[0] : 'Paused') : 'Ready'}</div>
              </div>
            </div>
            <div className="col gap-12" style={{ minWidth: 240, flex: 1 }}>
              <div className="field"><span>Duration</span><Chips value={mins} onChange={v => v && setMins(v)} options={[3, 5, 10, 15, 20, 30].map(k => ({ k, label: `${k} min` }))} /></div>
              <div className="field"><span>Practice</span><Chips value={type} onChange={v => v && setType(v)} options={MEDITATION_TYPES.map(k => ({ k, label: k }))} /></div>
              {type === 'Breathing' && <div className="field"><span>Breathing pattern</span><Seg value={pattern} onChange={p => { setPattern(p); setStep(0); }} options={(Object.keys(PATTERNS) as Pattern[]).map(k => ({ k, label: PATTERNS[k].label }))} /></div>}
              <div className="row">
                {!active && <Btn variant="primary" icon={Play} onClick={() => { setStep(0); startTimer({ kind: 'meditate', workMin: mins, breakMin: 0, medType: type, link: {} }); }}>Begin</Btn>}
                {active && running(s) && <Btn icon={Pause} onClick={pauseTimer}>Pause</Btn>}
                {active && !running(s) && <Btn variant="primary" icon={Play} onClick={resumeTimer}>Resume</Btn>}
                {active && <Btn icon={Square} onClick={stopTimer}>End</Btn>}
              </div>
              <p className="tiny muted">A soft chime plays at the end. The session logs itself (5+ minutes counts if you end early).</p>
            </div>
          </div>
        </Card>

        <div className="g">
          <Card title="This week" icon={Sparkles}>
            <div className="g g2">
              <div><Stat k="Meditation" v={`${week.minutes}`} unit={`/ ${d.settings.weekly.mindfulMin} min`} /><div className="mt4"><Meter value={(week.minutes / d.settings.weekly.mindfulMin) * 100} color={AREAS.personal.color} /></div></div>
              <Stat k="Streak" v={streak ? `${streak.cur}` : '—'} unit={streak?.unit === 'week' ? 'weeks' : 'days'} d={streak ? `best ${streak.best}` : 'Add a “Meditate” habit'} />
              <Stat k="Journal days" v={week.journalDays} unit={`· ${week.words} words`} />
              <Stat k="Mood lift" v={week.moodLift ? `${week.moodLift > 0 ? '+' : ''}${week.moodLift.toFixed(1)}` : '—'} d="after vs before meditating" tone={week.moodLift > 0 ? 'good' : undefined} />
            </div>
          </Card>
          <Card title="Today's prompt" icon={Wind}>
            <p style={{ fontSize: 16, fontWeight: 550 }}>“{prompt}”</p>
            <div className="row mt12">
              {todays.length > 0 && <span className="small good grow">✓ You journaled today</span>}
              <div className="grow" />
              <Btn variant="primary" icon={Feather} onClick={() => openCapture('journal', { prompt })}>Answer it</Btn>
            </div>
          </Card>
        </div>
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Mood, last 30 days" icon={Heart}>
          {(() => {
            const rated = days30.filter(x => moodOn(d, x) > 0);
            return rated.length > 1
              ? <Lines labels={rated.map(x => shortDate(x))} series={[{ name: 'Mood', color: AREAS.personal.color, values: rated.map(x => moodOn(d, x)) }]} max={5} height={150} fmt={n => n.toFixed(0)} />
              : <Empty title="Not enough ratings yet" hint="Rate your mood when you journal or meditate." />;
          })()}
          <div className="tiny muted mt4">Daily average of journal and post-meditation moods (1 rough – 5 great), rated days only.</div>
        </Card>
        <Card title="Practice days" icon={Leaf}>
          <Heatmap days={heatDays} today={T} cell={x => {
            const m = d.meditations.filter(y => y.date === x).reduce((a, y) => a + y.min, 0);
            const j = journalOn(d, x).length;
            return { fill: ramp(AREAS.personal.color, (m / 20) + (j ? 0.35 : 0)), tip: `${shortDate(x)}: ${m ? fmtDur(m) + ' meditation' : 'no meditation'}${j ? ' · journaled' : ''}` };
          }} />
          <div className="row between tiny muted mt8"><span>{shortDate(heatDays[0])}</span><span>darker = more minutes; journaling adds a step</span></div>
        </Card>
      </div>

      <div className="g g2 mt16" style={{ alignItems: 'start' }}>
        <Card title="Journal" icon={Feather} actions={<Btn size="sm" variant="ghost" icon={Plus} onClick={() => openCapture('journal')}>Entry</Btn>}>
          {entries.length === 0 && <Empty icon={Feather} title="No entries yet" hint="Even one sentence a day compounds." />}
          <div className="list">
            {entries.map(e => (
              <button key={e.id} className="li click" style={{ textAlign: 'left', alignItems: 'flex-start' }} onClick={() => openEditor('journal', { id: e.id })}>
                <div style={{ width: 46, flex: 'none' }}><div className="tiny muted">{dow(e.date)}</div><div className="bold num">{parseDate(e.date).getDate()}</div></div>
                <div className="grow" style={{ minWidth: 0 }}>
                  {e.prompt && <div className="tiny muted ellipsis">{e.prompt}</div>}
                  <div className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.body || <span className="muted">(gratitude only)</span>}</div>
                </div>
                <span style={{ fontSize: 18 }}>{moodFace(e.mood)}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Good things" icon={Heart}>
          {gratitude.length === 0 && <div className="small muted">Your gratitude notes collect here.</div>}
          <div className="chips">{gratitude.map((g, i) => <span key={i} className="chip" title={g.date}>✦ {g.g}</span>)}</div>
          <div className="hr" />
          <div className="label" style={{ marginBottom: 6 }}>Recent sessions</div>
          <div className="list">
            {[...d.meditations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(m => (
              <div key={m.id} className="li click" onClick={() => openEditor('meditation', { id: m.id })}>
                <Leaf size={14} className="accent" /><span className="grow small">{m.type}</span>
                <span className="small">{moodFace(m.moodBefore)}{m.moodAfter ? ` → ${moodFace(m.moodAfter)}` : ''}</span>
                <span className="num small muted" style={{ width: 70, textAlign: 'right' }}>{fmtDur(m.min)} · {shortDate(m.date)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
