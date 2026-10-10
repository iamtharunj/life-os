// Realistic demo data, generated relative to today so it always looks current.
// Everything is flagged `demo: true` so Settings → "Remove demo data" can strip it cleanly.
import type { Block, DB, DateStr, ExerciseEntry, Meal, Task, Workout } from './types.ts';
import { emptyDB } from './store.ts';
import { addDays, today, weekStart, weekday, monthStart, monthEnd, fmtDate } from './dates.ts';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDB(): DB {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const T = today();
  const D = (n: number) => addDays(T, n);
  const at = (date: DateStr, h: number, m = 0) => { const x = new Date(date + 'T00:00:00'); x.setHours(h, m); return x.toISOString(); };
  let n = 0;
  const id = (p: string) => `demo-${p}-${++n}`;
  const db = emptyDB();
  const demo = true;
  const HIST = 70;

  // ---- courses & timetable
  const courses = [
    { code: 'BMEE301L', name: 'Heat Transfer', faculty: 'Dr. S. Raghavan', credits: 3, type: 'Theory', color: '#4c95ee' },
    { code: 'BMEE302L', name: 'Design of Machine Elements', faculty: 'Dr. A. Menon', credits: 4, type: 'Theory', color: '#1fae7c' },
    { code: 'BMEE303P', name: 'Heat Transfer Lab', faculty: 'Prof. K. Iyer', credits: 1, type: 'Lab', color: '#c98500' },
    { code: 'BMEE207L', name: 'Kinematics & Dynamics of Machines', faculty: 'Dr. P. Nair', credits: 3, type: 'Theory', color: '#dc5a8c' },
    { code: 'BCSE306L', name: 'Artificial Intelligence', faculty: 'Dr. M. Fathima', credits: 3, type: 'Elective', color: '#9085e9' },
  ].map(c => ({ ...c, id: id('course'), demo }));
  const [HT, DME, HTL, KDM, AI] = courses;
  db.courses = courses;

  const sem = addDays(weekStart(T), -63);
  const semEnd = addDays(T, 75);
  const cls = (c: typeof HT, days: number[], s: number, e: number, loc: string, kind: Block['kind'] = 'class'): Block =>
    ({ id: id('blk'), demo, title: c.code.slice(4) + ' ' + c.name, date: sem, until: semEnd, repeat: days, start: s, end: e, kind, courseId: c.id, location: loc, done: [], missed: [] });
  const blocks: Block[] = [
    cls(HT, [1, 3, 5], 8 * 60, 8 * 60 + 50, 'SJT 304'),
    cls(DME, [1, 2, 4], 10 * 60, 10 * 60 + 50, 'GDN 118'),
    cls(DME, [3], 11 * 60, 11 * 60 + 50, 'GDN 118'),
    cls(KDM, [2, 4, 5], 9 * 60, 9 * 60 + 50, 'SJT 210'),
    cls(AI, [1, 3], 14 * 60, 14 * 60 + 50, 'TT 422'),
    cls(HTL, [4], 14 * 60, 15 * 60 + 40, 'Thermal Lab'),
    { id: id('blk'), demo, title: 'Gym', date: sem, repeat: [1, 3, 5], start: 17 * 60 + 30, end: 18 * 60 + 45, kind: 'gym', done: [] },
    { id: id('blk'), demo, title: 'Evening run', date: sem, repeat: [2], start: 17 * 60 + 45, end: 18 * 60 + 30, kind: 'running', done: [] },
    { id: id('blk'), demo, title: 'Basketball', date: sem, repeat: [6], start: 17 * 60, end: 18 * 60 + 30, kind: 'basketball', done: [] },
    { id: id('blk'), demo, title: 'RoboVITics meet', date: sem, repeat: [6], start: 10 * 60, end: 12 * 60, kind: 'club', location: 'MB Workshop', done: [] },
    { id: id('blk'), demo, title: 'Deep study', date: sem, repeat: [1, 2, 3, 4], start: 19 * 60 + 30, end: 21 * 60, kind: 'study', done: [] },
    { id: id('blk'), demo, title: 'Meditation', date: sem, repeat: [0, 1, 2, 3, 4, 5, 6], start: 22 * 60 + 30, end: 22 * 60 + 45, kind: 'mindful', done: [] },
  ];
  // attendance history on past class occurrences
  for (const b of blocks) {
    if (b.kind !== 'class') continue;
    for (let i = 1; i < HIST; i++) {
      const day = D(-i);
      if (day < sem || !b.repeat!.includes(weekday(day))) continue;
      (r() < 0.9 ? b.done! : b.missed!).push(day);
    }
  }
  db.blocks = blocks;

  // ---- projects
  const P = (x: Partial<DB['projects'][number]> & Pick<DB['projects'][number], 'name' | 'type' | 'status'>) =>
    ({ id: id('proj'), demo, priority: 2, milestones: [], links: [], updates: [], ...x } as DB['projects'][number]);
  const aml = P({
    name: 'Amazon ML Challenge', type: 'hackathon', status: 'active', priority: 1, start: D(-20), deadline: D(9),
    team: 'Tharun, Ananya, Rohit', goal: 'Top 50 on the private leaderboard',
    description: 'Predict product attributes from catalogue images and text.',
    nextAction: 'Train LightGBM baseline on full feature set',
    links: [{ label: 'Competition page', url: 'https://www.hackerearth.com/' }, { label: 'Team repo', url: 'https://github.com/' }],
    hack: { competition: 'Amazon ML Challenge 2026', regDeadline: D(-15), subDeadline: D(9), problem: 'Entity value extraction from product images', idea: 'OCR + layout-aware transformer, gradient boosting on engineered features', stack: 'Python, PyTorch, PaddleOCR, LightGBM', stage: 'Building' },
    milestones: [
      { id: id('ms'), title: 'EDA + data cleaning', done: D(-14) },
      { id: id('ms'), title: 'OCR pipeline', done: D(-6) },
      { id: id('ms'), title: 'Baseline submission', due: D(2) },
      { id: id('ms'), title: 'Final ensemble', due: D(8) },
    ],
    updates: [
      { id: id('u'), date: D(-12), text: 'Finished EDA notebook' },
      { id: id('u'), date: D(-6), text: 'OCR pipeline extracting units at 82% accuracy' },
      { id: id('u'), date: D(-2), text: 'Feature engineering for units + numeric parsing' },
      { id: id('u'), date: D(-1), text: 'Cross-validation set up, F1 0.61' },
    ],
  });
  const rover = P({
    name: 'RoboVITics · Autonomous Rover', type: 'robotics', status: 'active', priority: 1, start: D(-50), deadline: D(34),
    team: 'RoboVITics Mech + Electronics', goal: 'Rover that maps and navigates the campus lawn autonomously',
    description: 'Chassis design, suspension, ROS2 navigation stack.', nextAction: 'Finalise rocker-bogie linkage lengths in CAD',
    milestones: [
      { id: id('ms'), title: 'Chassis CAD v1', done: D(-30) },
      { id: id('ms'), title: 'Motor + driver selection', done: D(-18) },
      { id: id('ms'), title: 'Suspension prototype', due: D(10) },
      { id: id('ms'), title: 'Field test', due: D(30) },
    ],
    updates: [
      { id: id('u'), date: D(-9), text: 'Torque calcs for 6 wheel drive' },
      { id: id('u'), date: D(-3), text: 'Laser-cut test plates for bogie' },
    ],
  });
  const research = P({
    name: 'CFD study: heat-sink fin geometry', type: 'research', status: 'active', priority: 2, start: D(-40), deadline: D(55),
    team: 'with Dr. S. Raghavan', goal: 'Conference paper draft by December',
    description: 'Compare pin-fin vs plate-fin arrays under forced convection in ANSYS Fluent.',
    nextAction: 'Mesh independence study for pin-fin case',
    milestones: [{ id: id('ms'), title: 'Literature review', done: D(-25) }, { id: id('ms'), title: 'Baseline simulation', due: D(12) }],
    updates: [{ id: id('u'), date: D(-8), text: 'Geometry for 3 fin variants done' }],
  });
  const sih = P({
    name: 'Smart India Hackathon (internal round)', type: 'hackathon', status: 'planning', priority: 2, start: D(-3), deadline: D(18),
    team: 'Tharun + 5', nextAction: 'Shortlist 2 problem statements with the team',
    hack: { competition: 'SIH 2026', regDeadline: D(4), subDeadline: D(18), stage: 'Ideation', problem: 'TBD — shortlisting', stack: '' },
  });
  const portfolio = P({ name: 'Portfolio website', type: 'career', status: 'idea', priority: 3, nextAction: 'Collect project photos', description: 'Showcase CAD, robotics and ML work for internship applications.' });
  const lfb = P({ name: 'Line follower bot', type: 'robotics', status: 'completed', priority: 3, start: D(-90), deadline: D(-45), progress: 100, hack: undefined, updates: [{ id: id('u'), date: D(-46), text: 'Won 2nd place at Gravitas pre-event' }] });
  db.projects = [aml, rover, research, sih, portfolio, lfb];

  // ---- goals
  const G = (x: Partial<DB['goals'][number]> & Pick<DB['goals'][number], 'title' | 'level'>) =>
    ({ id: id('goal'), demo, status: 'active', metric: 'auto', ...x } as DB['goals'][number]);
  const vision = G({ title: 'Build robots and ML systems that solve real problems', level: 'vision', why: 'Engineering is how I want to leave a mark.' });
  const intern = G({ title: 'Land a robotics / ML internship for summer', level: 'year', parentId: vision.id, deadline: D(150), why: 'Real industry experience before final year.', nextAction: 'Ship portfolio + 2 strong projects' });
  const fit = G({ title: 'Run 150 km this semester', level: 'year', parentId: vision.id, metric: 'run_km', target: 150, start: sem, deadline: semEnd, area: 'fitness', why: 'Endurance for basketball and a clear head.' });
  const hack = G({ title: 'Place top-3 in a national hackathon', level: 'quarter', parentId: intern.id, deadline: D(60), nextAction: 'Submit a strong baseline for Amazon ML' });
  const cgpa = G({ title: 'CGPA 9+ this semester', level: 'quarter', parentId: intern.id, metric: 'study_h', target: 180, start: sem, deadline: semEnd, area: 'academics', why: 'Keeps doors open for research + internships.' });
  const sleepG = G({ title: 'Sleep ≥ 7.5h on 25 nights this month', level: 'month', parentId: fit.id, metric: 'sleep_nights', target: 25, start: monthStart(T), deadline: monthEnd(T), area: 'sleep' });
  const calm = G({ title: 'Meditate 10 hours this semester', level: 'quarter', parentId: vision.id, metric: 'manual', progress: 45, area: 'personal', why: 'Less anxiety before exams, better focus.' });
  db.goals = [vision, intern, fit, hack, cgpa, sleepG, calm];
  aml.goalId = hack.id; sih.goalId = hack.id; rover.goalId = intern.id; portfolio.goalId = intern.id; research.goalId = intern.id;

  // ---- tasks
  const tasks: Task[] = [];
  const task = (x: Partial<Task> & Pick<Task, 'title'>) => { const t: Task = { id: id('task'), demo, priority: 2, status: 'todo', createdAt: at(D(-5), 10), ...x }; tasks.push(t); return t; };
  const a1 = task({ title: 'Heat Transfer assignment 3 — fins & extended surfaces', kind: 'assignment', courseId: HT.id, due: D(1), priority: 1, status: 'doing', estMin: 150, area: 'academics' });
  task({ title: 'DME problem set: shafts & keys', kind: 'assignment', courseId: DME.id, due: D(4), priority: 2, estMin: 120, area: 'academics' });
  task({ title: 'Lab record — natural convection experiment', kind: 'lab', courseId: HTL.id, due: D(2), priority: 2, estMin: 60, area: 'academics' });
  task({ title: 'AI mini-project: A* path planner', kind: 'assignment', courseId: AI.id, due: D(11), priority: 2, estMin: 240, area: 'academics' });
  task({ title: 'KDM tutorial sheet 5', kind: 'assignment', courseId: KDM.id, due: D(-2), priority: 3, status: 'done', doneAt: at(D(-3), 21), area: 'academics' });
  const gymT = task({ title: 'Gym — push day', due: T, priority: 2, area: 'fitness', estMin: 75 });
  const ml = task({ title: 'Train LightGBM baseline on full features', projectId: aml.id, due: T, priority: 1, status: 'doing', estMin: 120, area: 'hackathons', goalId: hack.id });
  task({ title: 'Write inference script for test set', projectId: aml.id, parentId: ml.id, status: 'done', doneAt: at(D(-1), 22), priority: 2 });
  task({ title: 'Tune num_leaves / learning rate', projectId: aml.id, parentId: ml.id, priority: 2 });
  task({ title: 'Log CV score in team sheet', projectId: aml.id, parentId: ml.id, priority: 3 });
  task({ title: 'Merge OCR branch', projectId: aml.id, due: D(1), priority: 2, area: 'hackathons' });
  task({ title: 'Prepare baseline submission CSV', projectId: aml.id, due: D(2), priority: 1, area: 'hackathons' });
  task({ title: 'Update RoboVITics BOM with motor drivers', projectId: rover.id, due: D(-1), priority: 2, area: 'projects' });
  task({ title: 'Rocker-bogie linkage CAD', projectId: rover.id, due: D(3), priority: 1, status: 'doing', area: 'projects' });
  task({ title: 'Order encoders', projectId: rover.id, status: 'done', doneAt: at(D(-4), 16), priority: 2 });
  task({ title: 'Mesh independence study', projectId: research.id, due: D(5), priority: 2, area: 'projects' });
  task({ title: 'Email Dr. Raghavan about Fluent licence', projectId: research.id, due: T, priority: 2, area: 'projects' });
  task({ title: 'Shortlist SIH problem statements', projectId: sih.id, due: D(3), priority: 2, area: 'hackathons', status: 'blocked', notes: 'Waiting for the portal to publish PS list' });
  task({ title: 'Buy protein powder', due: D(2), priority: 3, area: 'personal' });
  task({ title: 'Renew bus pass', due: D(6), priority: 3, area: 'personal' });
  task({ title: 'Call home', due: D(-0), priority: 3, area: 'personal', status: 'done', doneAt: at(T, 8, 10) });
  // completed history so charts have signal
  for (let i = 1; i < 40; i++) {
    const k = Math.floor(r() * 3);
    for (let j = 0; j < k; j++) task({ title: pick(['Revise lecture notes', 'Solve tutorial problems', 'Fix CAD constraints', 'Read paper section', 'Clean dataset columns', 'Club meeting prep', 'Laundry', 'Reply to team']), status: 'done', due: D(-i), doneAt: at(D(-i), 10 + Math.floor(r() * 11)), priority: (1 + Math.floor(r() * 3)) as 1 | 2 | 3 });
  }
  db.tasks = tasks;
  db.days[T] = { top3: [a1.id, ml.id, gymT.id], water: 3, demo };

  // ---- exams
  db.exams = [
    { id: id('exam'), demo, courseId: KDM.id, type: 'Quiz', date: D(3), time: 9 * 60, syllabus: 'Gear trains, cams', prep: 60, priority: 2 },
    { id: id('exam'), demo, courseId: HT.id, type: 'CAT-2', date: D(12), time: 14 * 60, syllabus: 'Modules 3–5: fins, transient conduction, convection', prep: 35, priority: 1 },
    { id: id('exam'), demo, courseId: DME.id, type: 'CAT-2', date: D(14), time: 9 * 60, syllabus: 'Shafts, keys, couplings, springs', prep: 20, priority: 1 },
    { id: id('exam'), demo, courseId: AI.id, type: 'CAT-2', date: D(16), time: 11 * 60, syllabus: 'Search, CSPs, adversarial search', prep: 40, priority: 2 },
  ];

  // ---- daily history
  const topics: Record<string, string[]> = {
    [HT.id]: ['Fin efficiency', 'Transient conduction', 'Lumped capacitance', 'Forced convection'],
    [DME.id]: ['Shaft design', 'Keys & couplings', 'Fatigue', 'Springs'],
    [KDM.id]: ['Gear trains', 'Cam profiles', 'Balancing'],
    [AI.id]: ['A* search', 'CSPs', 'Minimax'],
  };
  const studyCourses = [HT, DME, KDM, AI];
  const push = ['Bench press', 'Overhead press', 'Incline DB press', 'Lateral raise', 'Tricep pushdown'];
  const pull = ['Deadlift', 'Pull-ups', 'Barbell row', 'Face pull', 'Bicep curl'];
  const legs = ['Squat', 'Romanian deadlift', 'Leg press', 'Calf raise'];
  const baseKg: Record<string, number> = { 'Bench press': 55, 'Overhead press': 32.5, 'Incline DB press': 20, 'Lateral raise': 8, 'Tricep pushdown': 25, Deadlift: 95, 'Pull-ups': 0, 'Barbell row': 50, 'Face pull': 20, 'Bicep curl': 12.5, Squat: 75, 'Romanian deadlift': 60, 'Leg press': 120, 'Calf raise': 60 };
  db.templates = [
    { id: id('tpl'), demo, name: 'Push', exercises: push },
    { id: id('tpl'), demo, name: 'Pull', exercises: pull },
    { id: id('tpl'), demo, name: 'Legs', exercises: legs },
  ];
  const split = [push, pull, legs];
  let splitI = 0;
  const foods = db.settings.foods;
  const meals: Meal[] = [];
  const workouts: Workout[] = [];
  const cats = ['Food', 'Food', 'Food', 'Food', 'Food', 'Transport', 'Transport', 'Shopping', 'Entertainment', 'College', 'Projects', 'Fitness'];
  const notesFor: Record<string, string[]> = {
    Food: ['Night canteen', 'Juice', 'Maggi at Enzo', 'Swiggy — biryani', 'Snacks', 'Chai + samosa'],
    Transport: ['Auto to Katpadi', 'Bus to Chennai', 'Rapido'],
    Shopping: ['Amazon — cable', 'T-shirt', 'Stationery'],
    Entertainment: ['Movie', 'Bowling'], College: ['Printouts', 'Lab coat', 'Xerox'],
    Projects: ['Arduino + sensors', 'Filament', 'Motor driver'], Fitness: ['Whey protein', 'Gym gloves'],
  };
  const journalBits = [
    'Felt scattered in the morning but the evening study block went well. Phone off helped.',
    'Good session with the team — we finally have a working OCR baseline. Tired but happy.',
    'Skipped the gym and regretted it. Tomorrow: go straight after class, no detours.',
    'CAT prep is behind. Broke it into 30 min chunks and it feels less scary now.',
    'Basketball was the best part of the day. Need more of that and less doom-scrolling.',
    'Slept late again because of the hackathon. Need to protect sleep — it wrecks the next day.',
    'Calm day. Meditation before bed actually made falling asleep easier.',
  ];
  const gratitude = ['Friends at the mess table', 'Good weather for the run', 'Mom\'s call', 'The team pulling through', 'Quiet library seat', 'Hot filter coffee', 'A helpful TA'];

  for (let i = HIST; i >= 0; i--) {
    const day = D(-i);
    const wd = weekday(day);
    const past = i > 0;
    // sleep (logged for every morning up to today)
    if (r() < 0.95) {
      const late = wd === 6 || wd === 0 ? 45 : 0;
      const bed = (23 * 60 + Math.floor(r() * 110) - 40 + late + 1440) % 1440;
      const dur = 5.9 * 60 + Math.floor(r() * 150) + (i < 7 ? 20 : 0);
      db.sleep.push({ id: id('sl'), demo, date: day, bed, wake: (bed + dur) % 1440, quality: 2 + Math.floor(r() * 4) });
    }
    if (!past) continue;
    // meals
    for (const slot of ['breakfast', 'lunch', 'snack', 'dinner'] as const) {
      if (r() < (slot === 'snack' ? 0.35 : 0.92)) {
        const opts = foods.filter(f => f.slot === slot);
        const f = pick(opts);
        meals.push({ id: id('meal'), demo, date: day, slot, food: f.name, protein: f.protein + Math.floor(r() * 5), quality: 1 + Math.floor(r() * 3) });
      }
    }
    db.days[day] = { top3: [], water: 3 + Math.floor(r() * 7), demo };
    // workouts
    if ([1, 3, 5].includes(wd) && r() < 0.8) {
      meals.push({ id: id('meal'), demo, date: day, slot: 'snack', food: 'Protein shake', protein: 24, quality: 3 });
      const ex = split[splitI++ % 3];
      const prog = (HIST - i) / HIST;
      const exercises: ExerciseEntry[] = ex.map(name => ({
        name,
        sets: Array.from({ length: 3 }, () => ({ reps: 6 + Math.floor(r() * 5), kg: Math.round((baseKg[name] * (1 + prog * 0.12)) / 2.5) * 2.5 })),
      }));
      workouts.push({ id: id('wo'), demo, date: day, type: 'gym', min: 60 + Math.floor(r() * 25), exercises, template: ['Push', 'Pull', 'Legs'][(splitI - 1) % 3], effort: 3 + Math.floor(r() * 3) });
    }
    if (wd === 2 && r() < 0.85) { const km = +(3 + r() * 3).toFixed(1); workouts.push({ id: id('wo'), demo, date: day, type: 'run', km, min: Math.round(km * (5.6 + r() * 0.9)) }); }
    if (wd === 0 && r() < 0.5) { const km = +(5 + r() * 3).toFixed(1); workouts.push({ id: id('wo'), demo, date: day, type: 'run', km, min: Math.round(km * (6 + r() * 0.6)), notes: 'Long easy run' }); }
    if (wd === 6 && r() < 0.8) workouts.push({ id: id('wo'), demo, date: day, type: 'basketball', min: 70 + Math.floor(r() * 30), notes: pick(['3v3 half court', 'Full court with hostel team', 'Shooting drills']) });
    if (wd === 4 && r() < 0.3) workouts.push({ id: id('wo'), demo, date: day, type: 'walk', km: +(2 + r() * 2).toFixed(1), min: 35 });
    // study
    if (r() < 0.75) {
      const c = pick(studyCourses);
      db.study.push({ id: id('st'), demo, date: day, courseId: c.id, topic: pick(topics[c.id]), min: 30 + Math.floor(r() * 5) * 15, type: pick(['Revision', 'Practice problems', 'Lecture review', 'Reading']) });
    }
    if (r() < 0.5) {
      const onProject = r() < 0.5;
      const p = pick([aml, rover, research]);
      const c = pick(studyCourses);
      db.focus.push({ id: id('fo'), demo, date: day, start: at(day, 20), min: pick([25, 25, 50]), ...(onProject ? { projectId: p.id, label: p.name } : { courseId: c.id, label: c.name }) });
    }
    // mindfulness
    if (r() < 0.6) {
      const before = 2 + Math.floor(r() * 3);
      db.meditations.push({ id: id('med'), demo, date: day, min: pick([5, 10, 10, 15, 20]), type: pick(['Breathing', 'Body scan', 'Guided', 'Silent']), moodBefore: before, moodAfter: Math.min(5, before + Math.floor(r() * 2) + (r() < 0.6 ? 1 : 0)) });
    }
    if (r() < 0.45) db.journal.push({ id: id('jr'), demo, date: day, body: pick(journalBits), mood: 2 + Math.floor(r() * 4), gratitude: [pick(gratitude), pick(gratitude)].filter((x, k, a) => a.indexOf(x) === k) });
    // money
    const spends = r() < 0.25 ? 0 : r() < 0.8 ? 1 : 2;
    for (let k = 0; k < spends; k++) {
      const cat = pick(cats);
      const amt = cat === 'Food' ? 30 + Math.floor(r() * 170) : cat === 'Transport' ? 40 + Math.floor(r() * 220) : cat === 'Projects' ? 200 + Math.floor(r() * 700) : cat === 'College' ? 20 + Math.floor(r() * 180) : 120 + Math.floor(r() * 380);
      db.txns.push({ id: id('tx'), demo, date: day, amount: amt, type: 'expense', category: cat, method: r() < 0.8 ? 'UPI' : 'Cash', note: pick(notesFor[cat]) });
    }
    // manual habits
    if (r() < 0.65) db.habitLogs.push({ id: id('hl'), demo, habitId: 'demo-habit-read', date: day });
    if (r() < 0.7) db.habitLogs.push({ id: id('hl'), demo, habitId: 'demo-habit-phone', date: day });
  }
  // today so far
  meals.push({ id: id('meal'), demo, date: T, slot: 'breakfast', food: 'Eggs + bread', protein: 18, quality: 3 });
  db.meals = meals;
  db.workouts = workouts;
  db.meditations.push({ id: id('med'), demo, date: T, min: 10, type: 'Breathing', moodBefore: 3, moodAfter: 4, notes: 'Box breathing before class' });

  // allowance on the 1st of each month
  for (let m = 0; m < 3; m++) {
    const ms = monthStart(addDays(monthStart(T), -m * 28));
    db.txns.push({ id: id('tx'), demo, date: ms, amount: 10000, type: 'income', category: 'Allowance', method: 'Bank', note: 'Monthly allowance' });
  }
  db.settings.openingDate = monthStart(addDays(monthStart(T), -60));
  db.settings.openingBalance = 4000;
  db.subs = [
    { id: id('sub'), demo, name: 'Spotify', amount: 119, cycle: 'monthly', next: D(5), category: 'Subscriptions', active: true },
    { id: id('sub'), demo, name: 'Gym membership', amount: 800, cycle: 'monthly', next: D(12), category: 'Fitness', active: true },
    { id: id('sub'), demo, name: 'Mobile recharge', amount: 299, cycle: 'monthly', next: D(2), category: 'Other', active: true },
    { id: id('sub'), demo, name: 'Google One', amount: 130, cycle: 'monthly', next: D(20), category: 'Subscriptions', active: true },
  ];

  // ---- habits
  db.habits = [
    { id: id('habit'), demo, name: 'Sleep ≥ 7.5h', icon: 'moon', category: 'Health', freq: 7, xp: 0, auto: 'sleep', goalId: sleepG.id },
    { id: id('habit'), demo, name: 'Train', icon: 'dumbbell', category: 'Fitness', freq: 4, xp: 0, auto: 'workout', goalId: fit.id },
    { id: id('habit'), demo, name: 'Study 30m+', icon: 'book', category: 'Academics', freq: 6, xp: 0, auto: 'study', goalId: cgpa.id },
    { id: id('habit'), demo, name: 'Water 8 glasses', icon: 'droplet', category: 'Health', freq: 7, xp: 0, auto: 'water' },
    { id: id('habit'), demo, name: 'Project progress', icon: 'rocket', category: 'Projects', freq: 5, xp: 0, auto: 'project', goalId: hack.id },
    { id: id('habit'), demo, name: 'Meditate', icon: 'leaf', category: 'Mind', freq: 5, xp: 0, auto: 'meditate', goalId: calm.id },
    { id: id('habit'), demo, name: 'Journal', icon: 'pen', category: 'Mind', freq: 4, xp: 0, auto: 'journal' },
    { id: 'demo-habit-read', demo, name: 'Read 20 pages', icon: 'bookopen', category: 'Learning', freq: 5, xp: 10 },
    { id: 'demo-habit-phone', demo, name: 'No phone in bed', icon: 'phone', category: 'Routine', freq: 7, xp: 10 },
  ];

  // ---- misc
  db.rewards = [
    { id: id('rw'), demo, name: 'Lazy Sunday', cost: 300, icon: 'sofa', claims: [] },
    { id: id('rw'), demo, name: 'Movie night', cost: 500, icon: 'film', claims: [at(D(-20), 20)] },
    { id: id('rw'), demo, name: 'Dinner out', cost: 1000, icon: 'utensils', claims: [] },
    { id: id('rw'), demo, name: 'New gear / gadget', cost: 2000, icon: 'gift', claims: [] },
  ];
  db.notes = [
    { id: id('note'), demo, date: D(-2), title: 'Rover: suspension ideas', body: 'Rocker-bogie with differential bar. Check NASA JPL open-source rover docs. Bogie pivot ~40% from front.', projectId: rover.id, pinned: true },
    { id: id('note'), demo, date: D(-5), title: 'HT formulas to memorise', body: 'Fin efficiency η = tanh(mL)/mL, m = √(hP/kA). Biot < 0.1 → lumped.', courseId: HT.id },
    { id: id('note'), demo, date: D(-1), body: 'Idea: use LiDAR + SLAM toolbox for rover mapping', inbox: true, idea: true },
    { id: id('note'), demo, date: T, body: 'Check internship openings at Ather Energy', inbox: true },
    { id: id('note'), demo, date: T, body: 'Buy a new A4 notebook for DME', inbox: true },
  ];
  const lastWs = addDays(weekStart(T), -7);
  db.reviews = [
    { id: id('rev'), demo, kind: 'week', period: lastWs, createdAt: at(addDays(lastWs, 6), 21), answers: { well: 'Hit 4 gym sessions, OCR pipeline done.', poorly: 'Slept under 7h three nights.', accomplished: 'OCR baseline, DME tutorial, 2 lab records.', avoided: 'CAT-2 revision for Heat Transfer.', attention: 'Sleep and exam prep.', stop: 'Late-night Instagram.', top1: 'Amazon ML baseline', top2: 'HT CAT-2 prep 50%', top3: 'Sleep 7.5h × 5' } },
    { id: id('rev'), demo, kind: 'day', period: D(-1), createdAt: at(D(-1), 22, 30), answers: { wins: 'CV pipeline works', improve: 'Started gym late', tomorrow: 'HT assignment first thing' }, rating: 4 },
  ];
  db.weekTop3[weekStart(T)] = ['Submit Amazon ML baseline', 'Heat Transfer assignment + CAT prep', 'Sleep ≥ 7.5h five nights'];
  db.missions = [{ key: `${addDays(weekStart(T), -14)}:athlete`, date: addDays(weekStart(T), -8), xp: 100 }];

  // a late hackathon sprint later this week, so the sleep-protection warning is visible in the planner
  const fri = addDays(weekStart(T), 4) >= T ? addDays(weekStart(T), 4) : addDays(weekStart(T), 11);
  db.blocks.push(
    { id: id('blk'), demo, title: 'ML Challenge sprint', date: fri, start: 21 * 60, end: 24 * 60, kind: 'hackathon', projectId: aml.id },
    { id: id('blk'), demo, title: 'ML Challenge sprint', date: addDays(fri, 1), start: 0, end: 60, kind: 'hackathon', projectId: aml.id },
    { id: id('blk'), demo, title: 'Heat Transfer assignment', date: T, start: 15 * 60 + 30, end: 17 * 60, kind: 'study', courseId: HT.id, taskId: a1.id },
    { id: id('blk'), demo, title: 'Amazon ML: baseline training', date: T, start: 21 * 60, end: 22 * 60 + 15, kind: 'hackathon', projectId: aml.id, taskId: ml.id },
  );
  db.savedAt = fmtDate(new Date(0));
  return db;
}

const DEMO_WEEK_TOP3 = ['Submit Amazon ML baseline', 'Heat Transfer assignment + CAT prep', 'Sleep ≥ 7.5h five nights'];
const RECORD_LABELS: Record<string, string> = {
  courses: 'course', tasks: 'task', blocks: 'time block', exams: 'exam', study: 'study session', workouts: 'workout', templates: 'workout template',
  meals: 'meal', txns: 'transaction', subs: 'subscription', sleep: 'sleep log', habits: 'habit', habitLogs: 'habit check-in', projects: 'project',
  goals: 'goal', notes: 'note', reviews: 'review', focus: 'focus session', meditations: 'meditation', journal: 'journal entry', rewards: 'reward',
};

/**
 * Strip every demo record and keep everything the user created: their records, the days they touched,
 * week priorities they typed and missions they claimed. References to removed demo items are cleared.
 */
export function withoutDemo(d: DB): DB {
  const out: any = { ...d };
  for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) out[k] = v.filter((x: any) => !x?.demo);

  // links from your records to sample items that no longer exist
  const alive = new Set<string>(['projects', 'courses', 'goals', 'tasks', 'habits'].flatMap(k => out[k].map((x: any) => x.id)));
  const REFS = ['projectId', 'courseId', 'goalId', 'taskId', 'parentId'];
  for (const [k, v] of Object.entries(out)) {
    if (!Array.isArray(v)) continue;
    out[k] = v.map((x: any) => (REFS.some(f => x?.[f] && !alive.has(x[f])) ? { ...x, ...Object.fromEntries(REFS.filter(f => x[f] && !alive.has(x[f])).map(f => [f, undefined])) } : x));
  }
  out.habitLogs = out.habitLogs.filter((l: any) => alive.has(l.habitId));

  out.days = Object.fromEntries(Object.entries(d.days).filter(([, v]) => !v.demo).map(([k, v]) => [k, { ...v, top3: v.top3.filter(id => alive.has(id)) }]));
  // week priorities: blank the sample lines, keep any line you typed
  out.weekTop3 = Object.fromEntries(Object.entries(d.weekTop3).map(([k, v]) => [k, v.map(x => (DEMO_WEEK_TOP3.includes(x) ? '' : x))] as const).filter(([, v]) => v.some(Boolean)));
  // The sample history includes one claimed mission from before you started; yours came after your first own record.
  const firstOwn = Object.values(out).flatMap(v => (Array.isArray(v) ? v : [])).map((x: any) => x?.createdAt?.slice(0, 10)).filter(Boolean).sort()[0];
  out.missions = firstOwn ? d.missions.filter(m => m.date >= firstOwn) : [];
  return out;
}

const plural = (n: number, w: string) => (n === 1 ? w : w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's');

/** What "Remove demo data" would do, for the confirmation dialog. */
export function demoSummary(d: DB) {
  const after = withoutDemo(d);
  let removed = 0;
  const kept: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (!Array.isArray(v) || k === 'missions') continue;
    const n = ((after as any)[k] as unknown[]).length;
    removed += v.length - n;
    if (n && RECORD_LABELS[k]) kept.push(`${n} ${plural(n, RECORD_LABELS[k])}`);
  }
  return { removed, kept };
}
