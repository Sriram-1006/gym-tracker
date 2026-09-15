/**
 * Domain models. The UI only talks to these types plus the repository
 * interfaces, so a future backend (Node/Express + MongoDB) can replace
 * AsyncStorage behind the repositories without touching any screen.
 */

export type MacroKey = 'protein' | 'carbs' | 'fats' | 'fiber';

export interface SetEntry {
  weight: number; // kg
  reps: number;
}

export interface ExerciseEntry {
  name: string;
  sets: SetEntry[];
}

export interface BodyPartEntry {
  bodyPart: string;
  exercises: ExerciseEntry[];
}

export interface WorkoutSession {
  id: string;
  /** ISO date (YYYY-MM-DD) this session belongs to. */
  date: string;
  restDay: boolean;
  bodyParts: BodyPartEntry[];
  /** Epoch ms; used for ordering sessions within the same day. */
  createdAt: number;
}

/** One-time daily gram targets for the four tracked macros. */
export interface DietTargets {
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  isSetup: boolean;
}

/** Daily logged intake in grams, compared against DietTargets. */
export interface DietLog {
  /** ISO date (YYYY-MM-DD) this log belongs to. */
  date: string;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

/** A single point on the strength graph. */
export interface StrengthPoint {
  date: string;
  score: number;
}

export interface StreakInfo {
  current: number;
  /** True when the last workout/rest was today. */
  activeToday: boolean;
}
