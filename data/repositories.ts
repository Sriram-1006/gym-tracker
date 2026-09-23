import {
  DietLog,
  DietTargets,
  StrengthPoint,
  StreakInfo,
  WorkoutSession,
  CurrentWorkoutDraft,
  DraftSet,
  DraftExercise,
  DraftBodyPart,
} from './models';
import { storageService } from './services/storageService';
import { createEmptyDraft } from './draft';
import { isValidISODate, todayISO } from './dateUtils';

// Re-export the pure draft/date helpers so screens/tests import from one module.
export {
  createEmptyDraft,
  hasMeaningfulDraftData,
  cleanDraftExercises,
  mergeDraftExercises,
  commitActiveBodyPart,
  draftToBodyParts,
  summarizeDraft,
  parseDraftNumber,
  hasSetData,
} from './draft';
export type { DraftSummary } from './draft';
export {
  todayISO,
  parseISODateLocal,
  isValidISODate,
  formatDisplayDate,
  formatDisplayDateShort,
  isFutureISO,
  normalizeDateInput,
} from './dateUtils';
export { MACRO_KEYS, dietLogHasData, normalizeDietLogs, selectHistoricalLogs } from './dietUtils';

const WORKOUTS_KEY = 'workouts.sessions.v1';
const DIET_TARGETS_KEY = 'diet.targets.v1';
const DIET_LOGS_KEY = 'diet.logs.v1';
const CUSTOM_EXERCISES_KEY = 'exercises.custom.v1';
const THEME_MODE_KEY = 'theme.mode';
const CURRENT_DRAFT_KEY = 'workouts.current.v1';

/* ------------------------------ Backup types --------------------------- */

export interface BackupPayload {
  exportVersion: 1;
  exportedAt: string;
  data: {
    workouts: WorkoutSession[];
    dietTargets: DietTargets;
    dietLogs: DietLog[];
    customExercises: Record<string, string[]>;
    themeMode: 'light' | 'dark';
  };
}

export async function exportAllData(): Promise<BackupPayload> {
  const [workouts, dietTargets, dietLogs, customExercises, themeMode] = await Promise.all([
    storageService.getItem<WorkoutSession[]>(WORKOUTS_KEY),
    storageService.getItem<DietTargets>(DIET_TARGETS_KEY),
    storageService.getItem<DietLog[]>(DIET_LOGS_KEY),
    storageService.getItem<Record<string, string[]>>(CUSTOM_EXERCISES_KEY),
    storageService.getItem<'light' | 'dark'>(THEME_MODE_KEY),
  ]);

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      workouts: workouts ?? [],
      dietTargets: dietTargets ?? { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
      dietLogs: dietLogs ?? [],
      customExercises: customExercises ?? {},
      themeMode: themeMode ?? 'light',
    },
  };
}

/* --------------------------- backup validation ------------------------- */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNonNegativeNumber(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0;
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}
function invalid(message: string): never {
  throw new Error(message);
}

const MACRO_KEYS = ['protein', 'carbs', 'fats', 'fiber'] as const;

/** Validates one workout session, down to every nested set. */
function validateWorkout(value: unknown, index: number): void {
  const label = `Workout ${index + 1}`;
  if (!isPlainObject(value)) invalid(`${label} is malformed.`);
  if (!isNonEmptyString(value.id)) invalid(`${label} is missing an id.`);
  if (!isValidISODate(value.date)) invalid(`${label} has an invalid date.`);
  if (typeof value.restDay !== 'boolean') invalid(`${label} is missing its rest-day flag.`);
  if (!isNonNegativeNumber(value.createdAt)) invalid(`${label} has an invalid createdAt.`);
  if (!Array.isArray(value.bodyParts)) invalid(`${label} has malformed body parts.`);

  value.bodyParts.forEach((bp: unknown, j: number) => {
    const bpLabel = `${label}, body part ${j + 1}`;
    if (!isPlainObject(bp)) invalid(`${bpLabel} is malformed.`);
    if (!isNonEmptyString(bp.bodyPart)) invalid(`${bpLabel} is missing a name.`);
    if (!Array.isArray(bp.exercises)) invalid(`${bpLabel} has malformed exercises.`);

    bp.exercises.forEach((ex: unknown, k: number) => {
      const exLabel = `${bpLabel}, exercise ${k + 1}`;
      if (!isPlainObject(ex)) invalid(`${exLabel} is malformed.`);
      if (!isNonEmptyString(ex.name)) invalid(`${exLabel} is missing a name.`);
      if (!Array.isArray(ex.sets)) invalid(`${exLabel} has malformed sets.`);

      ex.sets.forEach((s: unknown, l: number) => {
        const setLabel = `${exLabel}, set ${l + 1}`;
        if (!isPlainObject(s)) invalid(`${setLabel} is malformed.`);
        if (!isNonNegativeNumber(s.weight)) invalid(`${setLabel} has an invalid weight.`);
        if (!isNonNegativeNumber(s.reps)) invalid(`${setLabel} has invalid reps.`);
      });
    });
  });
}

function validateDietTargets(value: unknown): void {
  if (!isPlainObject(value)) invalid('Backup is missing diet targets.');
  for (const key of MACRO_KEYS) {
    if (!isNonNegativeNumber(value[key])) invalid(`Diet target "${key}" is invalid.`);
  }
  if (typeof value.isSetup !== 'boolean') invalid('Diet targets are missing their setup flag.');
}

function validateDietLogs(value: unknown): void {
  if (!Array.isArray(value)) invalid('Backup is missing diet logs.');
  value.forEach((log: unknown, i: number) => {
    if (!isPlainObject(log)) invalid(`Diet log ${i + 1} is malformed.`);
    if (!isValidISODate(log.date)) invalid(`Diet log ${i + 1} has an invalid date.`);
    for (const key of MACRO_KEYS) {
      if (!isNonNegativeNumber(log[key])) invalid(`Diet log ${i + 1} has an invalid "${key}" value.`);
    }
  });
}

function validateCustomExercises(value: unknown): void {
  if (!isPlainObject(value)) invalid('Backup is missing custom exercises.');
  for (const [bodyPart, exercises] of Object.entries(value)) {
    if (!Array.isArray(exercises)) invalid(`Custom exercises for "${bodyPart}" must be a list.`);
    if (!exercises.every((name) => typeof name === 'string')) {
      invalid(`Custom exercises for "${bodyPart}" must be text names.`);
    }
  }
}

/**
 * Deep structural validation of a backup payload. Throws a user-readable
 * error on the first problem found, before anything is written to storage.
 */
export function validateBackupPayload(payload: unknown): asserts payload is BackupPayload {
  if (!isPlainObject(payload)) {
    invalid('This does not look like a valid Gym Tracker backup file.');
  }
  if (payload.exportVersion !== 1) {
    invalid('Unrecognized backup version. This file cannot be imported.');
  }
  if (typeof payload.exportedAt !== 'string' || Number.isNaN(Date.parse(payload.exportedAt))) {
    invalid('Backup is missing a valid export timestamp.');
  }
  if (!isPlainObject(payload.data)) {
    invalid('Backup is missing its data object.');
  }
  const d = payload.data;
  if (!Array.isArray(d.workouts)) invalid('Backup is missing workout data.');
  d.workouts.forEach((w, i) => validateWorkout(w, i));
  validateDietTargets(d.dietTargets);
  validateDietLogs(d.dietLogs);
  validateCustomExercises(d.customExercises);
  if (d.themeMode !== 'light' && d.themeMode !== 'dark') {
    invalid('Backup is missing a valid theme mode.');
  }
}

/**
 * Replace all persisted data with a validated backup.
 *
 * Order matters for data safety:
 *  1. validate deeply (throws before any write),
 *  2. snapshot the current data,
 *  3. write the replacement,
 *  4. on failure, roll the snapshot back (best effort) so the app is never
 *     left half-imported,
 *  5. verify the writes landed before reporting success.
 */
export async function importAllData(payload: unknown): Promise<{ workouts: number; dietLogs: number }> {
  validateBackupPayload(payload);
  const { data } = payload;

  const replacement: Array<[string, unknown]> = [
    [WORKOUTS_KEY, data.workouts],
    [DIET_TARGETS_KEY, data.dietTargets],
    [DIET_LOGS_KEY, data.dietLogs],
    [CUSTOM_EXERCISES_KEY, data.customExercises],
    [THEME_MODE_KEY, data.themeMode],
  ];

  // Snapshot what is currently stored so a mid-write failure can be undone.
  const previous: Array<[string, unknown | null]> = [];
  for (const [key] of replacement) {
    previous.push([key, await storageService.getItem<unknown>(key)]);
  }

  try {
    for (const [key, value] of replacement) {
      await storageService.setItem(key, value);
    }
  } catch (e) {
    for (const [key, value] of previous) {
      try {
        if (value === null) await storageService.removeItem(key);
        else await storageService.setItem(key, value);
      } catch {
        // Best effort — nothing more we can do on this platform.
      }
    }
    throw new Error('Import failed while writing data. Your previous data was kept.');
  }

  // Verify every key round-trips before declaring success.
  for (const [key, value] of replacement) {
    const readBack = await storageService.getItem<unknown>(key);
    if (JSON.stringify(readBack) !== JSON.stringify(value)) {
      throw new Error('Import could not be verified. Your data may be unchanged — please try again.');
    }
  }

  return { workouts: data.workouts.length, dietLogs: data.dietLogs.length };
}

/* -------------------------- current draft repo ------------------------- */

/**
 * Coerce a persisted set to the string representation the editor expects.
 * Defensive migration so older numeric drafts (if any) can still be resumed.
 */
function normalizeDraftSet(set: Partial<DraftSet> | undefined): DraftSet {
  const raw = set ?? {};
  const weight = raw.weight;
  const reps = raw.reps;
  return {
    weight: typeof weight === 'string' ? weight : weight == null ? '' : String(weight),
    reps: typeof reps === 'string' ? reps : reps == null ? '' : String(reps),
  };
}

function normalizeDraftExercise(ex: Partial<DraftExercise> | undefined): DraftExercise {
  return {
    name: typeof ex?.name === 'string' ? ex.name : '',
    sets: (ex?.sets ?? []).map(normalizeDraftSet),
  };
}

function normalizeDraftBodyPart(bp: Partial<DraftBodyPart> | undefined): DraftBodyPart {
  return {
    bodyPart: typeof bp?.bodyPart === 'string' ? bp.bodyPart : '',
    exercises: (bp?.exercises ?? []).map(normalizeDraftExercise),
  };
}

/**
 * The single persisted slot for the in-progress workout. Because there is only
 * one key, at most one current draft can ever exist — saving a new draft simply
 * replaces the previous one.
 */
export const currentDraftRepository = {
  async get(): Promise<CurrentWorkoutDraft | null> {
    const raw = await storageService.getItem<Partial<CurrentWorkoutDraft>>(CURRENT_DRAFT_KEY);
    if (!raw) return null;
    return {
      ...createEmptyDraft(),
      ...raw,
      bodyParts: (raw.bodyParts ?? []).map(normalizeDraftBodyPart),
      activeExercises: (raw.activeExercises ?? []).map(normalizeDraftExercise),
    } as CurrentWorkoutDraft;
  },

  async save(draft: CurrentWorkoutDraft): Promise<void> {
    await storageService.setItem(CURRENT_DRAFT_KEY, { ...draft, updatedAt: Date.now() });
  },

  async clear(): Promise<void> {
    await storageService.removeItem(CURRENT_DRAFT_KEY);
  },
};

/* ------------------------------ helpers ------------------------------ */

export function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/* --------------------------- workout repo ---------------------------- */

/**
 * Workout repository. Persisted as a plain JSON array under one AsyncStorage
 * key — simple and fast for the data volumes a personal tracker produces.
 * The UI never imports this directly; it uses the Zustand stores.
 */
export const workoutRepository = {
  async getAll(): Promise<WorkoutSession[]> {
    return (await storageService.getItem<WorkoutSession[]>(WORKOUTS_KEY)) ?? [];
  },

  async saveAll(sessions: WorkoutSession[]): Promise<void> {
    await storageService.setItem(WORKOUTS_KEY, sessions);
  },

  async updateSession(
    sessionId: string,
    updated: Partial<WorkoutSession>,
  ): Promise<void> {
    const sessions = await this.getAll();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) throw new Error('Session not found');
    sessions[idx] = { ...sessions[idx], ...updated } as WorkoutSession;
    await storageService.setItem(WORKOUTS_KEY, sessions);
  },
};

/* ----------------------- custom exercise repo -------------------------- */

export const customExerciseRepository = {
  async getAll(): Promise<Record<string, string[]>> {
    return (await storageService.getItem<Record<string, string[]>>(CUSTOM_EXERCISES_KEY)) ?? {};
  },

  async saveAll(byBodyPart: Record<string, string[]>): Promise<void> {
    await storageService.setItem(CUSTOM_EXERCISES_KEY, byBodyPart);
  },
};

/* ---------------------------- diet repo ------------------------------ */

export const dietRepository = {
  async getTargets(): Promise<DietTargets> {
    return (
      (await storageService.getItem<DietTargets>(DIET_TARGETS_KEY)) ?? {
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        isSetup: false,
      }
    );
  },

  async saveTargets(targets: DietTargets): Promise<void> {
    await storageService.setItem(DIET_TARGETS_KEY, targets);
  },

  async getLogs(): Promise<DietLog[]> {
    return (await storageService.getItem<DietLog[]>(DIET_LOGS_KEY)) ?? [];
  },

  async saveLogs(logs: DietLog[]): Promise<void> {
    await storageService.setItem(DIET_LOGS_KEY, logs);
  },
};

/* ------------------------- analytics functions ------------------------ */

/**
 * Strength score for one session = total training volume = Σ (weight × reps)
 * across every set of every exercise of every body part.
 * (Chosen over average estimated 1RM because it is simple, deterministic and
 * meaningful even for bodyweight/low-weight high-rep work. Documented in
 * the README.)
 */
export function computeSessionStrength(session: WorkoutSession): number {
  let total = 0;
  for (const bp of session.bodyParts) {
    for (const ex of bp.exercises) {
      for (const set of ex.sets) {
        total += (set.weight || 0) * (set.reps || 0);
      }
    }
  }
  return total;
}

/** One point per workout day (sessions on the same day are summed). */
export function computeStrengthSeries(sessions: WorkoutSession[]): StrengthPoint[] {
  const nonRest = sessions.filter((s) => !s.restDay);
  const byDate = new Map<string, number>();
  for (const s of nonRest) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + computeSessionStrength(s));
  }
  return [...byDate.entries()]
    .map(([date, score]) => ({ date, score }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Streak of consecutive calendar days where the user trained, where a marked
 * rest day is neutral (neither extends nor breaks the streak) and only a day
 * with neither a workout nor a rest mark breaks it.
 *
 * Rules:
 *  - rest marks only count up to today; future rest days don't extend a live
 *    streak (they haven't "happened" yet).
 *  - if the latest streak-ending event (workout or rest mark) is in the past,
 *    a streak survives only if today itself is a rest day (rest keeps a stale
 *    streak alive but does not extend it); otherwise it is broken.
 */
export function computeStreak(
  sessions: WorkoutSession[],
  today: string = todayISO(),
): StreakInfo {
  const workoutDays = new Set<string>();
  const restDays = new Set<string>();
  for (const s of sessions) {
    if (s.restDay) {
      restDays.add(s.date);
    } else {
      workoutDays.add(s.date);
    }
  }

  let cursor = today;
  let streak = 0;
  let activeToday = false;

  const isWorkout = (d: string) => workoutDays.has(d);
  const isRest = (d: string) => restDays.has(d);

  // Walk backwards from today.
  while (true) {
    if (isWorkout(cursor)) {
      streak += 1;
      if (cursor === today) activeToday = true;
      cursor = shiftISODate(cursor, -1);
      continue;
    }
    if (isRest(cursor) && cursor <= today) {
      if (cursor === today) {
        // Rest day keeps an existing streak alive but adds nothing.
        activeToday = streak > 0;
        cursor = shiftISODate(cursor, -1);
        // Continue scanning past the rest mark.
        continue;
      }
      cursor = shiftISODate(cursor, -1);
      continue;
    }
    break;
  }

  // If the backwards walk stopped before today (today is neither a workout
  // nor a rest mark), the streak belongs to the past and is broken: it does
  // not carry into today uninvited. A marked rest day "today" is the one
  // exception — it keeps the existing streak alive without extending it.
  return { current: streak, activeToday };
}
