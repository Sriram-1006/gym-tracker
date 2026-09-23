import { create } from 'zustand';

import {
  computeSessionStrength,
  currentDraftRepository,
  dietRepository,
  draftToBodyParts,
  hasMeaningfulDraftData,
  normalizeDietLogs,
  selectHistoricalLogs,
  shiftISODate,
  todayISO,
  workoutRepository,
} from '../data/repositories';
import {
  CurrentWorkoutDraft,
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

export interface BodyPartInput {
  bodyPart: string;
  exercises: { name: string; sets: { weight: number; reps: number }[] }[];
}

/* --------------------------- Current Draft State -------------------------- */

/**
 * Debounce window for high-frequency edits (typing a weight/reps/name). A
 * navigation-away always calls `flushDraft()` first, so this delay can never
 * lose the user's latest input — it only avoids a write per keystroke.
 */
const AUTOSAVE_DEBOUNCE_MS = 400;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

interface CurrentDraftState {
  draft: CurrentWorkoutDraft | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** True when a meaningful, resumable draft exists. */
  hasDraft: () => boolean;
  /** Immediate authoritative write (structural changes / navigation flush). */
  persistDraft: (draft: CurrentWorkoutDraft) => Promise<boolean>;
  /** Update memory now, persist shortly (for text input). Resolves no promise. */
  autoSaveDraft: (draft: CurrentWorkoutDraft) => void;
  /** Cancel any pending debounce and write the latest memory state now. */
  flushDraft: () => Promise<boolean>;
  /** Discard the persisted draft (only after a Finish has succeeded). */
  clearDraft: () => Promise<void>;
  /**
   * Convert the draft into a completed WorkoutSession. The completed session is
   * persisted FIRST; the current draft is cleared only after that succeeds, so
   * a failed finish keeps the draft intact for a retry.
   */
  finishDraft: (draft: CurrentWorkoutDraft) => Promise<WorkoutSession | null>;
}

function cancelPendingAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/** Write a draft to storage (or clear it when nothing meaningful remains). */
async function writeDraft(draft: CurrentWorkoutDraft | null): Promise<boolean> {
  try {
    if (draft && hasMeaningfulDraftData(draft)) {
      await currentDraftRepository.save(draft);
    } else {
      await currentDraftRepository.clear();
    }
    return true;
  } catch (e) {
    console.warn('[currentDraftStore] Failed to persist current draft:', e);
    return false;
  }
}

export const useCurrentDraftStore = create<CurrentDraftState>((set, get) => ({
  draft: null,
  hydrated: false,

  hydrate: async () => {
    const saved = await currentDraftRepository.get();
    set({ draft: saved && hasMeaningfulDraftData(saved) ? saved : null, hydrated: true });
  },

  hasDraft: () => hasMeaningfulDraftData(get().draft),

  persistDraft: async (draft) => {
    cancelPendingAutoSave();
    set({ draft });
    return writeDraft(draft);
  },

  autoSaveDraft: (draft) => {
    // Reflect the edit in memory immediately (Home/Finish read this), then
    // debounce the storage write for typing bursts.
    set({ draft });
    cancelPendingAutoSave();
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      void writeDraft(draft);
    }, AUTOSAVE_DEBOUNCE_MS);
  },

  flushDraft: async () => {
    cancelPendingAutoSave();
    return writeDraft(get().draft);
  },

  clearDraft: async () => {
    cancelPendingAutoSave();
    set({ draft: null });
    try {
      await currentDraftRepository.clear();
    } catch (e) {
      console.warn('[currentDraftStore] Failed to clear current draft:', e);
    }
  },

  finishDraft: async (draft) => {
    cancelPendingAutoSave();
    if (!hasMeaningfulDraftData(draft)) return null;
    const bodyParts = draftToBodyParts(draft);
    if (bodyParts.length === 0) return null;

    // 1. Persist the completed session FIRST. If this throws, the draft is left
    //    untouched so the user can retry without losing anything.
    const session = await useWorkoutStore.getState().addSession({
      bodyParts,
      dateISO: draft.date,
    });

    // 2. Only once the session is safely stored do we discard the draft.
    await get().clearDraft();
    return session;
  },
}));

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
  updateSession: (sessionId: string, updates: Partial<WorkoutSession>) => Promise<void>;
}

interface DietState {
  targets: DietTargets;
  todayLog: DietLog;
  /** All stored logs, newest first, one entry per date. */
  history: DietLog[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setupTargets: (grams: Omit<DietTargets, 'isSetup'>) => Promise<void>;
  updateTargets: (grams: Omit<DietTargets, 'isSetup'>) => Promise<void>;
  addToLog: (grams: Partial<Record<MacroKey, number>>) => Promise<void>;
  resetTodayLog: () => Promise<void>;
  /**
   * Keep `todayLog` pointed at the real current day. Cheap no-op unless the
   * calendar day has changed while the app stayed open (midnight rollover).
   */
  syncDay: () => Promise<void>;
  /** Previous days only, newest first (today is excluded). */
  getHistoricalLogs: () => DietLog[];
  /** Every stored log (today included), newest first, one per date. */
  getDietLogs: () => DietLog[];
  /** The single log for a calendar date, or undefined if nothing is stored. */
  getLogForDate: (date: string) => DietLog | undefined;
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
    // Persist first, then reflect in memory: a failed write must not leave a
    // phantom session that would double up on a Finish retry.
    await workoutRepository.saveAll(sessions);
    set({ sessions });
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

  /**
   * Update an existing workout session by ID.
   * Keeps the same workout ID and only modifies the provided fields.
   */
  updateSession: async (sessionId: string, updates: Partial<WorkoutSession>) => {
    const sessions = get().sessions.map((s) =>
      s.id === sessionId ? { ...s, ...updates } : s,
    );
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
  history: [],
  hydrated: false,

  hydrate: async () => {
    const [targets, logs] = await Promise.all([
      dietRepository.getTargets(),
      dietRepository.getLogs(),
    ]);
    const today = todayISO();
    const normalized = normalizeDietLogs(logs);
    const log = normalized.find((l) => l.date === today);
    set({
      targets,
      history: normalized,
      todayLog: log ? { ...log } : emptyLog(today),
      hydrated: true,
    });
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
    const merged = normalizeDietLogs([next, ...logs.filter((l) => l.date !== today)]);
    set({ todayLog: { ...next }, history: merged });
    await dietRepository.saveLogs(merged);
  },

  resetTodayLog: async () => {
    const today = todayISO();
    const logs = await dietRepository.getLogs();
    const merged = normalizeDietLogs([...logs.filter((l) => l.date !== today), emptyLog(today)]);
    set({ todayLog: emptyLog(today), history: merged });
    await dietRepository.saveLogs(merged);
  },

  syncDay: async () => {
    const today = todayISO();
    if (get().todayLog.date === today) return;
    // The calendar day changed while the app was open — re-point today at the
    // new day. Yesterday's entry stays untouched in history/storage.
    const normalized = normalizeDietLogs(await dietRepository.getLogs());
    const log = normalized.find((l) => l.date === today);
    set({ history: normalized, todayLog: log ? { ...log } : emptyLog(today) });
  },

  getHistoricalLogs: () => selectHistoricalLogs(get().history),
  getDietLogs: () => get().history,
  // `history` holds one normalized entry per date, so this cannot return
  // duplicates even if storage ever contained them.
  getLogForDate: (date) => get().history.find((l) => l.date === date),
}));

// Re-export shared helpers so screens import from a single module.
export { computeSessionStrength, shiftISODate };