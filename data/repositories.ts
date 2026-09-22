import {
  DietLog,
  DietTargets,
  StrengthPoint,
  StreakInfo,
  WorkoutSession,
} from './models';
import { storageService } from './services/storageService';

const WORKOUTS_KEY = 'workouts.sessions.v1';
const DIET_TARGETS_KEY = 'diet.targets.v1';
const DIET_LOGS_KEY = 'diet.logs.v1';
const CUSTOM_EXERCISES_KEY = 'exercises.custom.v1';
const THEME_MODE_KEY = 'theme.mode';

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

function validateBackupPayload(payload: unknown): asserts payload is BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('This does not look like a valid Gym Tracker backup file.');
  }
  const p = payload as { exportVersion?: unknown; data?: unknown };
  if (p.exportVersion !== 1) {
    throw new Error('Unrecognized backup version. This file cannot be imported.');
  }
  if (!p.data || typeof p.data !== 'object') {
    throw new Error('Backup is missing data object.');
  }
  const d = p.data as Record<string, unknown>;
  if (!Array.isArray(d.workouts)) {
    throw new Error('Backup is missing workout data.');
  }
  if (!d.dietTargets || typeof d.dietTargets !== 'object') {
    throw new Error('Backup is missing diet targets.');
  }
  if (!Array.isArray(d.dietLogs)) {
    throw new Error('Backup is missing diet logs.');
  }
  if (!d.customExercises || typeof d.customExercises !== 'object') {
    throw new Error('Backup is missing custom exercises.');
  }
  if (d.themeMode !== 'light' && d.themeMode !== 'dark') {
    throw new Error('Backup is missing theme mode.');
  }
}

export async function importAllData(payload: unknown): Promise<{ workouts: number; dietLogs: number }> {
  validateBackupPayload(payload);

  const { data } = payload;

  await Promise.all([
    storageService.setItem(WORKOUTS_KEY, data.workouts),
    storageService.setItem(DIET_TARGETS_KEY, data.dietTargets),
    storageService.setItem(DIET_LOGS_KEY, data.dietLogs),
    storageService.setItem(CUSTOM_EXERCISES_KEY, data.customExercises),
    storageService.setItem(THEME_MODE_KEY, data.themeMode),
  ]);

  return { workouts: data.workouts.length, dietLogs: data.dietLogs.length };
}

/* ------------------------------ helpers ------------------------------ */

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
