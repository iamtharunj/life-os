// Life OS data model. One JSON document, relational by id.
// Dates are local 'YYYY-MM-DD' strings; times of day are minutes from midnight.

export type ID = string;
export type DateStr = string;

export type Area = 'academics' | 'fitness' | 'projects' | 'hackathons' | 'club' | 'personal' | 'finance';
export type Priority = 1 | 2 | 3; // 1 = high
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';

interface Base { id: ID; createdAt?: string; demo?: boolean }

export interface Task extends Base {
  title: string;
  notes?: string;
  due?: DateStr;
  priority: Priority;
  status: TaskStatus;
  kind?: 'task' | 'assignment' | 'lab';
  area?: Area;
  projectId?: ID;
  courseId?: ID;
  goalId?: ID;
  parentId?: ID; // subtask of
  estMin?: number;
  actMin?: number;
  doneAt?: string; // ISO timestamp
}

export type BlockKind =
  | 'class' | 'study' | 'gym' | 'running' | 'basketball' | 'meal' | 'sleep'
  | 'hackathon' | 'project' | 'club' | 'personal' | 'mindful' | 'other';

export interface Block extends Base {
  title: string;
  date: DateStr; // first occurrence
  start: number;
  end: number;
  kind: BlockKind;
  repeat?: number[]; // weekdays 0=Sun..6=Sat
  until?: DateStr;
  skip?: DateStr[]; // cancelled / moved occurrences
  done?: DateStr[]; // completed (attended) occurrences
  missed?: DateStr[]; // explicitly missed (attendance)
  taskId?: ID;
  projectId?: ID;
  courseId?: ID;
  goalId?: ID;
  location?: string;
  notes?: string;
}

export type HabitAuto = 'sleep' | 'workout' | 'study' | 'water' | 'project' | 'protein' | 'meditate' | 'journal';
export interface Habit extends Base {
  name: string;
  icon: string;
  category: string;
  freq: number; // target days per week
  xp: number;
  auto?: HabitAuto; // completion derived from real data
  goalId?: ID;
  notes?: string;
  archived?: boolean;
}
export interface HabitLog extends Base { habitId: ID; date: DateStr }

export interface SleepLog extends Base {
  date: DateStr; // the morning you woke up
  bed: number;
  wake: number;
  quality?: number; // 1-5
  notes?: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export interface Meal extends Base {
  date: DateStr;
  slot: MealSlot;
  food: string;
  protein?: number;
  kcal?: number;
  quality?: number; // 1 poor, 2 ok, 3 good
  notes?: string;
  skipped?: boolean;
}

export interface Txn extends Base {
  date: DateStr;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  method?: string;
  note?: string;
  recurring?: boolean;
}

export interface Subscription extends Base {
  name: string;
  amount: number;
  cycle: 'weekly' | 'monthly' | 'yearly';
  next: DateStr;
  category: string;
  active: boolean;
}

export interface Course extends Base {
  name: string;
  code: string;
  faculty?: string;
  credits?: number;
  type?: string;
  color?: string;
  notes?: string;
}

export interface Exam extends Base {
  courseId?: ID;
  type: string;
  date: DateStr;
  time?: number;
  syllabus?: string;
  prep: number; // 0-100
  priority: Priority;
  notes?: string;
}

export interface StudySession extends Base {
  date: DateStr;
  courseId?: ID;
  topic?: string;
  min: number;
  type: string;
  notes?: string;
}

export type WorkoutType = 'gym' | 'run' | 'basketball' | 'walk' | 'cardio' | 'rest';
export interface SetEntry { reps: number; kg: number }
export interface ExerciseEntry { name: string; sets: SetEntry[] }
export interface Workout extends Base {
  date: DateStr;
  type: WorkoutType;
  min: number;
  km?: number;
  activity?: string; // cardio kind: Cycling, Skipping, HIIT...
  exercises?: ExerciseEntry[];
  template?: string;
  effort?: number; // 1-5
  notes?: string;
}
export interface WorkoutTemplate extends Base { name: string; exercises: string[] }

export type ProjectType = 'hackathon' | 'robotics' | 'ml' | 'research' | 'club' | 'personal' | 'career';
export type ProjectStatus = 'idea' | 'planning' | 'active' | 'blocked' | 'submitted' | 'completed' | 'archived';
export interface Milestone { id: ID; title: string; due?: DateStr; done?: DateStr }
export interface LinkItem { label: string; url: string }
export interface ProjectUpdate { id: ID; date: DateStr; text: string }
export interface HackInfo {
  competition?: string;
  regDeadline?: DateStr;
  subDeadline?: DateStr;
  problem?: string;
  idea?: string;
  stack?: string;
  stage?: string;
  submissionLink?: string;
  result?: string;
}
export interface Project extends Base {
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  start?: DateStr;
  deadline?: DateStr;
  team?: string;
  goal?: string;
  description?: string;
  nextAction?: string;
  progress?: number; // manual fallback when no tasks/milestones
  milestones: Milestone[];
  links: LinkItem[];
  updates: ProjectUpdate[];
  resources?: string;
  notes?: string;
  goalId?: ID;
  hack?: HackInfo;
}

export type GoalLevel = 'vision' | 'year' | 'quarter' | 'month' | 'week';
export type MetricKind = 'auto' | 'manual' | 'run_km' | 'workouts' | 'study_h' | 'focus_h' | 'sleep_nights' | 'saved';
export interface Goal extends Base {
  title: string;
  level: GoalLevel;
  parentId?: ID;
  area?: string;
  description?: string;
  why?: string;
  start?: DateStr;
  deadline?: DateStr;
  status: 'active' | 'done' | 'paused' | 'dropped';
  nextAction?: string;
  metric: MetricKind;
  target?: number;
  progress?: number; // manual
}

export interface Note extends Base {
  title?: string;
  body: string;
  date: DateStr;
  inbox?: boolean;
  idea?: boolean;
  pinned?: boolean;
  courseId?: ID;
  projectId?: ID;
}

// Mindfulness
export interface Meditation extends Base {
  date: DateStr;
  min: number;
  type: string; // Breathing, Body scan, Guided, Walking, Silent
  moodBefore?: number; // 1-5
  moodAfter?: number;
  notes?: string;
}
export interface Journal extends Base {
  date: DateStr;
  body: string;
  mood?: number; // 1-5
  gratitude?: string[];
  prompt?: string;
}

export interface Reward extends Base { name: string; cost: number; icon: string; claims: string[] }

export interface Review extends Base {
  kind: 'day' | 'week' | 'month';
  period: string; // date | week-start date | 'YYYY-MM'
  answers: Record<string, string>;
  rating?: number;
  updatedAt?: string;
}

export interface FocusSession extends Base {
  date: DateStr;
  start: string; // ISO
  min: number;
  courseId?: ID;
  projectId?: ID;
  taskId?: ID;
  label?: string;
  late?: boolean; // done inside protected sleep window, earns no XP
}

export interface MissionClaim { key: string; date: DateStr; xp: number }
export interface DayLog { top3: ID[]; water: number; demo?: boolean }
export interface FoodPreset { name: string; protein: number; kcal?: number; slot?: MealSlot }

export type WarningKind = 'sleep' | 'deadline' | 'tasks' | 'schedule' | 'project' | 'budget' | 'overdue' | 'logsleep';

export interface Settings {
  name: string;
  accent: string;
  theme: 'dark' | 'black';
  banner: boolean;
  motion: boolean;
  sleepTarget: number; // hours
  bedtime: number;
  wake: number;
  waterTarget: number; // glasses
  proteinTarget: number;
  kcalTarget: number;
  currency: string;
  monthlyBudget: number;
  openingBalance: number;
  openingDate: DateStr;
  savingsGoal: number;
  expenseCategories: string[];
  paymentMethods: string[];
  foods: FoodPreset[];
  weekly: { studyHours: number; workouts: number; runKm: number; mindfulMin: number; muscleSets: number };
  muscleOf?: Record<string, string>; // exercise name (lowercase) -> primary muscle override
  xp: {
    task: number; taskHigh: number; sleep: number; workout: number; study30: number;
    focus: number; dayReview: number; weekReview: number; monthReview: number;
    projectUpdate: number; milestone: number; meditation: number; journal: number;
  };
  warnings: Record<WarningKind, boolean>;
  gridStart: number; // hour the planner scrolls to
}

export interface DB {
  version: number;
  savedAt: string;
  settings: Settings;
  tasks: Task[];
  blocks: Block[];
  habits: Habit[];
  habitLogs: HabitLog[];
  sleep: SleepLog[];
  meals: Meal[];
  txns: Txn[];
  subs: Subscription[];
  courses: Course[];
  exams: Exam[];
  study: StudySession[];
  workouts: Workout[];
  templates: WorkoutTemplate[];
  projects: Project[];
  goals: Goal[];
  notes: Note[];
  rewards: Reward[];
  reviews: Review[];
  focus: FocusSession[];
  meditations: Meditation[];
  journal: Journal[];
  missions: MissionClaim[];
  days: Record<DateStr, DayLog>;
  weekTop3: Record<DateStr, string[]>;
}

export type Coll = {
  [K in keyof DB]: DB[K] extends Array<{ id: ID }> ? K : never
}[keyof DB];
