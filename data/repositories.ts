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
