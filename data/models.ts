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

/**
 * Draft set — weight/reps are kept as raw strings while the user is editing so
 * that a field can stay genuinely blank or partially typed (e.g. "17.") without
 * being coerced to 0. Conversion to numbers happens only at the commit boundary
 * (see `draftToBodyParts`), so completed WorkoutSessions keep numeric values.
 */
export interface DraftSet {
  weight: string;
  reps: string;
}

/** An exercise inside an in-progress draft (string-valued sets). */
export interface DraftExercise {
  name: string;
  sets: DraftSet[];
}

/** A body part inside an in-progress draft (string-valued sets). */
export interface DraftBodyPart {
  bodyPart: string;
  exercises: DraftExercise[];
}

/**
 * In-progress workout draft — persisted separately from completed sessions
 * under `workouts.current.v1`. A draft is NOT a WorkoutSession: it never shows
 * up in history, streak or strength analytics until it is finished.
 *
 * Only state required to resume the Add Workout screen exactly is persisted;
 * purely visual state (open modals, transient text fields) is left out.
 */
export interface CurrentWorkoutDraft {
  id: string;
  /** ISO date (YYYY-MM-DD) this draft workout belongs to. */
  date: string;
  /** Body parts that have been committed to the draft. */
  bodyParts: DraftBodyPart[];
  /** Currently active body part being edited (not yet committed). */
  activeBodyPart: string | null;
  /** Exercises for the active body part (in progress, string-valued sets). */
  activeExercises: DraftExercise[];
  /** Name being typed for a new exercise. */
  activeExerciseName: string;
  /** Updated timestamp (ms) — useful for debugging/conflict checks. */
  updatedAt: number;
}
