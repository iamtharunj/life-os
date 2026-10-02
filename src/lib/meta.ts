import type { Area, BlockKind, GoalLevel, HabitAuto, MealSlot, MetricKind, ProjectStatus, ProjectType, TaskStatus, WorkoutType } from './types.ts';

// Area palette validated for CVD separation on the dark surface (dataviz validator, adjacent order).
export const AREAS: Record<Area, { label: string; color: string }> = {
  academics: { label: 'Academics', color: '#4c95ee' },
  fitness: { label: 'Fitness', color: '#d95926' },
  personal: { label: 'Personal', color: '#1fae7c' },
  finance: { label: 'Finance', color: '#c98500' },
  hackathons: { label: 'Hackathons', color: '#dc5a8c' },
  projects: { label: 'Projects', color: '#9085e9' },
  club: { label: 'Club', color: '#e66767' },
};
export const SLEEP_COLOR = '#7f8fd6';

export const BLOCK_KINDS: Record<BlockKind, { label: string; area: Area | 'sleep' }> = {
  class: { label: 'Class', area: 'academics' },
  study: { label: 'Study', area: 'academics' },
  gym: { label: 'Gym', area: 'fitness' },
  running: { label: 'Running', area: 'fitness' },
  basketball: { label: 'Basketball', area: 'fitness' },
  meal: { label: 'Meal', area: 'personal' },
  sleep: { label: 'Sleep', area: 'sleep' },
  hackathon: { label: 'Hackathon', area: 'hackathons' },
  project: { label: 'Project', area: 'projects' },
  club: { label: 'Club', area: 'club' },
  personal: { label: 'Personal', area: 'personal' },
  mindful: { label: 'Mindfulness', area: 'personal' },
  other: { label: 'Other', area: 'personal' },
};
export const areaColor = (a: Area | 'sleep' | undefined) => (a === 'sleep' ? SLEEP_COLOR : a ? AREAS[a].color : '#8a9185');
export const kindColor = (k: BlockKind) => areaColor(BLOCK_KINDS[k].area);

export const TASK_STATUS: Record<TaskStatus, string> = { todo: 'Not started', doing: 'In progress', blocked: 'Blocked', done: 'Done' };
export const PRIORITY: Record<number, { label: string; short: string }> = {
  1: { label: 'High', short: 'P1' }, 2: { label: 'Medium', short: 'P2' }, 3: { label: 'Low', short: 'P3' },
};

export const WORKOUT_TYPES: Record<WorkoutType, { label: string; distance: boolean }> = {
  gym: { label: 'Gym', distance: false },
  run: { label: 'Run', distance: true },
  basketball: { label: 'Basketball', distance: false },
  walk: { label: 'Walk', distance: true },
  cardio: { label: 'Cardio', distance: false },
  rest: { label: 'Rest / Recovery', distance: false },
};

export const CARDIO_KINDS = ['Cycling', 'Skipping', 'HIIT', 'Stairs', 'Swimming', 'Elliptical', 'Rowing'];

export const MEAL_SLOTS: { k: MealSlot; label: string; time: number }[] = [
  { k: 'breakfast', label: 'Breakfast', time: 7 * 60 + 30 },
  { k: 'lunch', label: 'Lunch', time: 12 * 60 + 30 },
  { k: 'snack', label: 'Snack', time: 17 * 60 },
  { k: 'dinner', label: 'Dinner', time: 20 * 60 },
];

export const PROJECT_TYPES: Record<ProjectType, { label: string; area: Area }> = {
  hackathon: { label: 'Hackathon', area: 'hackathons' },
  robotics: { label: 'Robotics', area: 'projects' },
  ml: { label: 'ML / AI', area: 'projects' },
  research: { label: 'Research', area: 'projects' },
  club: { label: 'Club', area: 'club' },
  personal: { label: 'Personal', area: 'personal' },
  career: { label: 'Career', area: 'personal' },
};
export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  idea: 'Idea', planning: 'Planning', active: 'Active', blocked: 'Blocked',
  submitted: 'Submitted', completed: 'Completed', archived: 'Archived',
};
export const OPEN_STATUSES: ProjectStatus[] = ['planning', 'active', 'blocked'];
export const HACK_STAGES = ['Registered', 'Ideation', 'Building', 'Polishing', 'Submitted', 'Results'];

export const GOAL_LEVELS: Record<GoalLevel, string> = { vision: 'Vision', year: 'Year', quarter: 'Quarter', month: 'Month', week: 'Week' };
export const GOAL_METRICS: Record<MetricKind, { label: string; unit: string }> = {
  auto: { label: 'Auto (from linked items)', unit: '%' },
  manual: { label: 'Manual %', unit: '%' },
  run_km: { label: 'Running distance', unit: 'km' },
  workouts: { label: 'Workouts logged', unit: 'workouts' },
  study_h: { label: 'Study hours', unit: 'h' },
  focus_h: { label: 'Focus hours', unit: 'h' },
  sleep_nights: { label: 'Nights ≥ sleep target', unit: 'nights' },
  saved: { label: 'Money saved', unit: '' },
};
export const HABIT_AUTO: Record<HabitAuto, string> = {
  sleep: 'Sleep ≥ target (from sleep log)',
  workout: 'Any workout logged',
  study: '≥ 30 min study/focus on a course',
  water: 'Water target reached',
  project: 'Any project progress logged',
  protein: 'Protein target reached',
  meditate: 'Any meditation logged',
  journal: 'Journal entry written',
};
export const MEDITATION_TYPES = ['Breathing', 'Body scan', 'Guided', 'Silent', 'Walking', 'Yoga nidra'];
export const MOODS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
export const JOURNAL_PROMPTS = [
  'What is on my mind right now?',
  'What gave me energy today, and what drained it?',
  'What would make tomorrow a good day?',
  'What am I avoiding, and why?',
  'What did I learn about myself this week?',
  'Where did I spend my attention today?',
  'What am I proud of today, however small?',
  'What is one thing I can let go of?',
];
export const STUDY_TYPES = ['Revision', 'Practice problems', 'Lecture review', 'Assignment', 'Reading', 'Lab prep', 'Focus'];
export const EXAM_TYPES = ['CAT-1', 'CAT-2', 'FAT', 'Quiz', 'Lab exam', 'Viva', 'Other'];
export const COURSE_TYPES = ['Theory', 'Lab', 'Theory + Lab', 'Project', 'Elective'];
export const COURSE_COLORS = ['#4c95ee', '#1fae7c', '#c98500', '#dc5a8c', '#9085e9', '#e66767', '#d95926', '#3fb7c9'];
export const ACCENTS = ['#7dff6a', '#4fe3c1', '#62b6ff', '#b69cff', '#ff8fc7', '#ffc44d'];
