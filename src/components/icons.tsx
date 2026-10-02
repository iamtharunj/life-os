import {
  Activity, Bed, Book, BookOpen, Brain, Briefcase, Code, Coffee, Dumbbell, Droplet, Film, Flame, Footprints, Gift, GlassWater,
  GraduationCap, Heart, Leaf, Moon, Music, Pen, Rocket, Smartphone, Sofa, Star, Sun, Target, Utensils, Wallet, Wind, Zap, Bot,
  Users, Sparkles, Timer, Trophy, type LucideIcon,
} from 'lucide-react';
import type { BlockKind, ProjectType, WorkoutType } from '../lib/types.ts';
import { CalendarDays } from 'lucide-react';

// String keys let habits/rewards store their icon choice in the JSON database.
export const ICONS: Record<string, LucideIcon> = {
  moon: Moon, dumbbell: Dumbbell, book: Book, bookopen: BookOpen, droplet: Droplet, rocket: Rocket, leaf: Leaf, pen: Pen,
  phone: Smartphone, sofa: Sofa, film: Film, utensils: Utensils, gift: Gift, brain: Brain, heart: Heart, star: Star, sun: Sun,
  flame: Flame, target: Target, coffee: Coffee, code: Code, music: Music, wind: Wind, zap: Zap, footprints: Footprints,
  glass: GlassWater, wallet: Wallet, cap: GraduationCap, briefcase: Briefcase, trophy: Trophy, sparkles: Sparkles,
};
export const IconOf = ({ name, size = 16 }: { name?: string; size?: number }) => {
  const I = (name && ICONS[name]) || Star;
  return <I size={size} />;
};

export const BLOCK_ICON: Record<BlockKind, LucideIcon> = {
  class: GraduationCap, study: BookOpen, gym: Dumbbell, running: Footprints, basketball: Activity, meal: Utensils,
  sleep: Bed, hackathon: Zap, project: Rocket, club: Users, personal: Heart, mindful: Leaf, other: CalendarDays,
};
export const WORKOUT_ICON: Record<WorkoutType, LucideIcon> = {
  gym: Dumbbell, run: Footprints, basketball: Activity, walk: Footprints, cardio: Heart, rest: Bed,
};
export const PROJECT_ICON: Record<ProjectType, LucideIcon> = {
  hackathon: Zap, robotics: Bot, ml: Brain, research: BookOpen, club: Users, personal: Heart, career: Briefcase,
};
export const TimerIcon = Timer;
