import {
  BarChart3, CalendarDays, CalendarRange, CheckSquare, ClipboardCheck, Dumbbell, Flame, GraduationCap, Home, Inbox, Leaf, Moon,
  Rocket, Settings, Sun, Target, Timer, Utensils, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; group: 'main' | 'life' | 'review' | 'system' }
export const NAV: NavItem[] = [
  { to: '/home', label: 'Home', icon: Home, group: 'main' },
  { to: '/today', label: 'Today', icon: Sun, group: 'main' },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, group: 'main' },
  { to: '/week', label: 'Week', icon: CalendarRange, group: 'main' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, group: 'main' },
  { to: '/focus', label: 'Focus', icon: Timer, group: 'main' },
  { to: '/academics', label: 'Academics', icon: GraduationCap, group: 'life' },
  { to: '/fitness', label: 'Fitness', icon: Dumbbell, group: 'life' },
  { to: '/sleep', label: 'Sleep', icon: Moon, group: 'life' },
  { to: '/diet', label: 'Diet', icon: Utensils, group: 'life' },
  { to: '/mind', label: 'Mindfulness', icon: Leaf, group: 'life' },
  { to: '/finance', label: 'Finance', icon: Wallet, group: 'life' },
  { to: '/projects', label: 'Projects', icon: Rocket, group: 'life' },
  { to: '/habits', label: 'Habits', icon: Flame, group: 'life' },
  { to: '/goals', label: 'Goals', icon: Target, group: 'review' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, group: 'review' },
  { to: '/reviews', label: 'Reviews', icon: ClipboardCheck, group: 'review' },
  { to: '/inbox', label: 'Inbox & Notes', icon: Inbox, group: 'system' },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'system' },
];
