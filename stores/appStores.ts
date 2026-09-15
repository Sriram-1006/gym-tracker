import { create } from 'zustand';

import {
  computeSessionStrength,
  dietRepository,
  shiftISODate,
  todayISO,
  workoutRepository,
} from '../data/repositories';
import {
  DietLog,
  DietTargets,
  MacroKey,
  WorkoutSession,
} from '../data/models';

export const DEFAULT_TARGETS: Omit<DietTargets, 'isSetup'> = {
  protein: 140,
  carbs: 250,
  fats: 70,
  fiber: 30,
};

interface WorkoutState {
  sessions: WorkoutSession[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addSession: (input: {
    bodyParts: BodyPartInput[];
    restDay?: boolean;
    dateISO?: string;
  }) => Promise<WorkoutSession>;
  /**
   * Mark/unmark a date as a rest day. Returns an error string instead of
   * mutating state when the operation is not allowed: marking a day that
   * already has a real workout logged, or marking a day that is already
   * marked as rest (idempotency guard).
   */
  toggleRestDay: (dateISO: string) => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export interface BodyPartInput {
  bodyPart: string;
  exercises: { name: string; sets: { weight: number; reps: number }[] }[];
}

interface DietState {
  targets: DietTargets;
  todayLog: DietLog;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setupTargets: (grams: Omit<DietTargets, 'isSetup'>) => Promise<void>;
  updateTargets: (grams: Omit<DietTargets, 'isSetup'>) => Promise<void>;
  addToLog: (grams: Partial<Record<MacroKey, number>>) => Promise<void>;
  resetTodayLog: () => Promise<void>;
}

const emptyLog = (date: string): DietLog => ({
  date,
  protein: 0,
  carbs: 0,
  fats: 0,
  fiber: 0,
});

/**
 * Workout store — the UI's single access point to workout data. Screens read
 * `sessions` and call actions; actions write through the repository. This is
 * the seam where a backend-backed repository can later be swapped in.
 */
export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  sessions: [],
  hydrated: false,

  hydrate: async () => {
    const sessions = await workoutRepository.getAll();
    // Most recent first (newest date, then newest created within a day).
    sessions.sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    );
    set({ sessions, hydrated: true });
  },

  addSession: async ({ bodyParts, restDay = false, dateISO }) => {
    const date = dateISO ?? todayISO();
    const session: WorkoutSession = {
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date,
      restDay,
      bodyParts,
      createdAt: Date.now(),
    };
    const sessions = [session, ...get().sessions].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    );
    set({ sessions });
    await workoutRepository.saveAll(sessions);
    return session;
  },

  /**
   * Mark/unmark a calendar day as a rest day. The day is always "today" in
   * the current UI. Guards:
   *  - a day with a logged workout can never also be a rest day;
   *  - an already-marked day is rejected (the UI's "Unmark" path clears the
   *    marker via deleteSession, so re-marking twice cannot duplicate it).
   * Returns an error message string when rejected, null on success.
   */
  toggleRestDay: async (dateISO: string) => {
    const existing = get().sessions.find((s) => s.date === dateISO && s.restDay);
    if (existing) {
      return 'Today is already marked as a rest day.';
    }
    if (get().sessions.some((s) => s.date === dateISO && !s.restDay)) {
      return 'You already logged a workout today. A day cannot be both.';
    }
    const sessions = [
      {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: dateISO,
        restDay: true,
        bodyParts: [],
        createdAt: Date.now(),
      },
      ...get().sessions,
    ];
    sessions.sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    );
    set({ sessions });
    await workoutRepository.saveAll(sessions);
    return null;
  },

  /**
   * Remove a workout (or rest-day marker) by id and persist. Analytics
   * (strength series, streak) are derived from `sessions` on every render,
   * so deleting automatically drops the day from the graph and recomputes
   * the streak from scratch — no cached counters to decrement.
   */
  deleteSession: async (sessionId: string) => {
    const sessions = get().sessions.filter((s) => s.id !== sessionId);
    set({ sessions });
    await workoutRepository.saveAll(sessions);
  },
}));

/**
 * Diet store — targets (one-time setup) plus today's logged intake.
 * A real backend later means reimplementing the repository calls only.
 */
export const useDietStore = create<DietState>((set, get) => ({
  targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
  todayLog: emptyLog(todayISO()),
  hydrated: false,

  hydrate: async () => {
    const [targets, logs] = await Promise.all([
      dietRepository.getTargets(),
      dietRepository.getLogs(),
    ]);
    const today = todayISO();
    const log = logs.find((l) => l.date === today);
    set({ targets, todayLog: log ? { ...log } : emptyLog(today), hydrated: true });
  },

  setupTargets: async (grams) => {
    const targets: DietTargets = { ...grams, isSetup: true };
    set({ targets });
    await dietRepository.saveTargets(targets);
  },

  // Spec: one-time setup; afterwards an Edit option changes targets anytime.
  updateTargets: async (grams) => {
    return get().setupTargets(grams);
  },

  addToLog: async (grams) => {
    const today = todayISO();
    const logs = await dietRepository.getLogs();
    const existing = logs.find((l: DietLog) => l.date === today);
    const next: DietLog = existing
      ? {
          ...existing,
          protein: existing.protein + (grams.protein ?? 0),
          carbs: existing.carbs + (grams.carbs ?? 0),
          fats: existing.fats + (grams.fats ?? 0),
          fiber: existing.fiber + (grams.fiber ?? 0),
        }
      : { ...emptyLog(today), ...grams };
    const merged = [next, ...logs.filter((l) => l.date !== today)];
    set({ todayLog: { ...next } });
    await dietRepository.saveLogs(merged);
  },

  resetTodayLog: async () => {
    const today = todayISO();
    const logs = await dietRepository.getLogs();
    const merged = [...logs.filter((l) => l.date !== today), emptyLog(today)];
    set({ todayLog: emptyLog(today) });
    await dietRepository.saveLogs(merged);
  },
}));

// Re-export shared helpers so screens import from a single module.
export { computeSessionStrength, shiftISODate };
