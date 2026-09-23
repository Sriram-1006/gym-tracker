import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * In-memory AsyncStorage shared by the store tests. `failOn.key` lets a test
 * force a storage write failure for one key (used for the failed-Finish case).
 */
const { storage, failOn } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const failOn: { key: string | null } = { key: null };
  return { storage, failOn };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failOn.key === key) throw new Error('simulated write failure');
      storage.set(key, value);
    },
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

import { useWorkoutStore, useCurrentDraftStore } from '../stores/appStores';
import {
  commitActiveBodyPart,
  computeStrengthSeries,
  computeStreak,
  createEmptyDraft,
  currentDraftRepository,
  draftToBodyParts,
  hasMeaningfulDraftData,
  summarizeDraft,
  todayISO,
} from '../data/repositories';
import { CurrentWorkoutDraft, DraftBodyPart, DraftExercise } from '../data/models';

const CURRENT_KEY = 'workouts.current.v1';
const SESSIONS_KEY = 'workouts.sessions.v1';

/* ------------------------------- factories ------------------------------ */

function ex(name: string, sets: Array<[string, string]>): DraftExercise {
  return { name, sets: sets.map(([weight, reps]) => ({ weight, reps })) };
}

function bp(bodyPart: string, name: string, sets: Array<[string, string]>): DraftBodyPart {
  return { bodyPart, exercises: [ex(name, sets)] };
}

function makeDraft(overrides: Partial<CurrentWorkoutDraft> = {}): CurrentWorkoutDraft {
  return { ...createEmptyDraft('2026-09-17'), ...overrides };
}

/** Simulate an app restart: drop memory, then hydrate from storage. */
async function reloadDraft(): Promise<CurrentWorkoutDraft | null> {
  useCurrentDraftStore.setState({ draft: null, hydrated: false });
  await useCurrentDraftStore.getState().hydrate();
  return useCurrentDraftStore.getState().draft;
}

beforeEach(async () => {
  storage.clear();
  failOn.key = null;
  await useCurrentDraftStore.getState().clearDraft();
  useCurrentDraftStore.setState({ draft: null, hydrated: false });
  useWorkoutStore.setState({ sessions: [], hydrated: false });
});

/* -------------------------- repository / lifecycle ---------------------- */

describe('current draft lifecycle', () => {
  it('creates an empty draft that is not yet meaningful', () => {
    const draft = createEmptyDraft('2026-09-17');
    expect(draft.id).toMatch(/^draft_/);
    expect(draft.date).toBe('2026-09-17');
    expect(draft.bodyParts).toEqual([]);
    expect(draft.activeBodyPart).toBeNull();
    expect(hasMeaningfulDraftData(draft)).toBe(false);
  });

  it('saves and reads the current draft through the repository', async () => {
    const draft = makeDraft({ activeBodyPart: 'Chest', activeExercises: [ex('Bench Press', [['20', '10']])] });
    await currentDraftRepository.save(draft);

    expect(storage.has(CURRENT_KEY)).toBe(true);
    const loaded = await currentDraftRepository.get();
    expect(loaded?.activeBodyPart).toBe('Chest');
    expect(loaded?.activeExercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
  });

  it('loads the draft after an app reload (hydrate)', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({ activeBodyPart: 'Back', activeExercises: [ex('Pull-Up', [['', '8']])] }),
    );

    const draft = await reloadDraft();
    expect(draft).not.toBeNull();
    expect(draft?.activeBodyPart).toBe('Back');
    expect(useCurrentDraftStore.getState().hasDraft()).toBe(true);
  });

  it('clears the current draft', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({ activeBodyPart: 'Chest', activeExercises: [ex('Bench Press', [['20', '10']])] }),
    );
    expect(storage.has(CURRENT_KEY)).toBe(true);

    await useCurrentDraftStore.getState().clearDraft();

    expect(storage.has(CURRENT_KEY)).toBe(false);
    expect(useCurrentDraftStore.getState().draft).toBeNull();
    expect(await reloadDraft()).toBeNull();
  });

  it('does not persist a draft with no meaningful data', async () => {
    await useCurrentDraftStore.getState().persistDraft(createEmptyDraft('2026-09-17'));
    expect(storage.has(CURRENT_KEY)).toBe(false);
  });
});

/* -------------------------------- autosave ------------------------------- */

describe('autosave', () => {
  it('preserves the workout date', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({ date: '2026-09-17', activeBodyPart: 'Chest', activeExercises: [ex('Bench Press', [['20', '10']])] }),
    );
    expect((await reloadDraft())?.date).toBe('2026-09-17');
  });

  it('preserves the active body part', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({ activeBodyPart: 'Shoulders', activeExercises: [ex('Overhead Press', [['40', '5']])] }),
    );
    expect((await reloadDraft())?.activeBodyPart).toBe('Shoulders');
  });

  it('preserves exercises and their sets', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({
        bodyParts: [bp('Chest', 'Bench Press', [['20', '10'], ['22.5', '8']])],
        activeBodyPart: 'Back',
        activeExercises: [ex('Pull-Up', [['', '8']])],
      }),
    );

    const draft = await reloadDraft();
    expect(draft?.bodyParts[0].exercises[0].name).toBe('Bench Press');
    expect(draft?.bodyParts[0].exercises[0].sets).toEqual([
      { weight: '20', reps: '10' },
      { weight: '22.5', reps: '8' },
    ]);
    expect(draft?.activeExercises[0].sets[0]).toEqual({ weight: '', reps: '8' });
  });

  it('preserves partially typed numeric values exactly (no forced 0)', async () => {
    await useCurrentDraftStore.getState().persistDraft(
      makeDraft({
        activeBodyPart: 'Chest',
        activeExercises: [ex('Bench Press', [['17.', ''], ['', '']])],
      }),
    );

    const draft = await reloadDraft();
    expect(draft?.activeExercises[0].sets[0]).toEqual({ weight: '17.', reps: '' });
    expect(draft?.activeExercises[0].sets[1]).toEqual({ weight: '', reps: '' });
  });

  it('debounces typing but flushDraft writes the latest input immediately', async () => {
    const draft = makeDraft({ activeBodyPart: 'Chest', activeExercises: [ex('Bench Press', [['20', '10']])] });

    useCurrentDraftStore.getState().autoSaveDraft(draft);
    // Memory updated immediately, storage not yet…
    expect(useCurrentDraftStore.getState().draft?.activeBodyPart).toBe('Chest');
    expect(storage.has(CURRENT_KEY)).toBe(false);

    // …but leaving the screen flushes it synchronously.
    await useCurrentDraftStore.getState().flushDraft();
    expect(storage.has(CURRENT_KEY)).toBe(true);
    expect((await reloadDraft())?.activeExercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
  });

  it('Back (flush) preserves the workout without completing it', async () => {
    useCurrentDraftStore.getState().autoSaveDraft(
      makeDraft({ activeBodyPart: 'Back', activeExercises: [ex('Pull-Up', [['', '8']])] }),
    );
    await useCurrentDraftStore.getState().flushDraft();

    expect(await reloadDraft()).not.toBeNull();
    // Nothing was promoted to a completed session.
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
    expect(storage.has(SESSIONS_KEY)).toBe(false);
  });
});

/* -------------------------- P0: adding body parts ----------------------- */

describe('adding another body part', () => {
  it('commitActiveBodyPart folds the active part in and clears the entry', () => {
    const draft = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [ex('Bench Press', [['20', '10']])],
    });

    const committed = commitActiveBodyPart(draft);

    expect(committed.bodyParts.map((b) => b.bodyPart)).toEqual(['Chest']);
    expect(committed.bodyParts[0].exercises[0].name).toBe('Bench Press');
    expect(committed.activeBodyPart).toBeNull();
    expect(committed.activeExercises).toEqual([]);
  });

  it('does not lose the previous active body part when switching to a new one', async () => {
    // Step 1 — logging Chest (active).
    let draft = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [ex('Bench Press', [['20', '10'], ['22.5', '8']])],
    });

    // Step 2 — "Add another body part": commit + persist BEFORE the picker opens.
    draft = commitActiveBodyPart(draft);
    await useCurrentDraftStore.getState().persistDraft(draft);

    // Step 3 — user picks Back and continues logging.
    draft = { ...draft, activeBodyPart: 'Back', activeExercises: [ex('Pull-Up', [['', '8']])] };
    await useCurrentDraftStore.getState().persistDraft(draft);

    const reloaded = await reloadDraft();
    expect(reloaded?.bodyParts.map((b) => b.bodyPart)).toEqual(['Chest']);
    expect(reloaded?.bodyParts[0].exercises[0].sets).toEqual([
      { weight: '20', reps: '10' },
      { weight: '22.5', reps: '8' },
    ]);
    expect(reloaded?.activeBodyPart).toBe('Back');
    expect(reloaded?.activeExercises[0].name).toBe('Pull-Up');
  });
});

/* --------------------------------- finish -------------------------------- */

describe('finishDraft', () => {
  const draft = makeDraft({
    date: '2026-09-17',
    bodyParts: [bp('Chest', 'Bench Press', [['20', '10'], ['22.5', '8']])],
    activeBodyPart: 'Back',
    activeExercises: [ex('Pull-Up', [['', '8']])],
  });

  it('creates a completed WorkoutSession including the still-active body part', async () => {
    await useCurrentDraftStore.getState().persistDraft(draft);

    const session = await useCurrentDraftStore.getState().finishDraft(draft);

    expect(session).not.toBeNull();
    expect(session?.date).toBe('2026-09-17');
    expect(session?.bodyParts.map((b) => b.bodyPart)).toEqual(['Chest', 'Back']);
    expect(session?.bodyParts[0].exercises[0].sets).toEqual([
      { weight: 20, reps: 10 },
      { weight: 22.5, reps: 8 },
    ]);
    // Bodyweight set: weight 0 is meaningful here, reps are kept.
    expect(session?.bodyParts[1].exercises[0].sets).toEqual([{ weight: 0, reps: 8 }]);

    expect(useWorkoutStore.getState().sessions).toHaveLength(1);
    expect(JSON.parse(storage.get(SESSIONS_KEY)!) as unknown[]).toHaveLength(1);
  });

  it('removes the current draft only after the session is persisted', async () => {
    await useCurrentDraftStore.getState().persistDraft(draft);

    await useCurrentDraftStore.getState().finishDraft(draft);

    expect(storage.has(CURRENT_KEY)).toBe(false);
    expect(useCurrentDraftStore.getState().draft).toBeNull();
    expect(await currentDraftRepository.get()).toBeNull();
    expect(useCurrentDraftStore.getState().hasDraft()).toBe(false);
  });

  it('keeps the current draft intact when the completed-session write fails', async () => {
    await useCurrentDraftStore.getState().persistDraft(draft);
    failOn.key = SESSIONS_KEY;

    await expect(useCurrentDraftStore.getState().finishDraft(draft)).rejects.toThrow();

    failOn.key = null;
    // The draft survived because it is cleared only on success.
    expect(await currentDraftRepository.get()).not.toBeNull();
    expect(useCurrentDraftStore.getState().draft).not.toBeNull();

    // And the failed session was not persisted either.
    useWorkoutStore.setState({ sessions: [], hydrated: false });
    await useWorkoutStore.getState().hydrate();
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('returns null (and keeps the draft) when there is nothing valid to complete', async () => {
    const blank = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [ex('Bench Press', [['', '']])],
    });
    await useCurrentDraftStore.getState().persistDraft(blank);

    const session = await useCurrentDraftStore.getState().finishDraft(blank);

    expect(session).toBeNull();
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
    expect(await currentDraftRepository.get()).not.toBeNull();
  });
});

/* ------------------------------- analytics ------------------------------- */

describe('analytics exclude the current draft', () => {
  const today = todayISO();
  const draft = makeDraft({
    date: today,
    bodyParts: [bp('Chest', 'Bench Press', [['100', '10']])],
  });

  it('does not appear in strength, streak or completed history before Finish', async () => {
    await useCurrentDraftStore.getState().persistDraft(draft);
    await useWorkoutStore.getState().hydrate();

    const sessions = useWorkoutStore.getState().sessions;
    expect(sessions).toHaveLength(0);
    expect(computeStrengthSeries(sessions)).toEqual([]);
    expect(computeStreak(sessions, today)).toEqual({ current: 0, activeToday: false });
  });

  it('appears in completed analytics only after Finish', async () => {
    await useCurrentDraftStore.getState().persistDraft(draft);
    await useCurrentDraftStore.getState().finishDraft(draft);

    const sessions = useWorkoutStore.getState().sessions;
    expect(computeStrengthSeries(sessions)).toEqual([{ date: today, score: 1000 }]);
    expect(computeStreak(sessions, today)).toEqual({ current: 1, activeToday: true });
  });
});

/* --------------------------- single-draft invariant --------------------- */

describe('only one current workout can exist', () => {
  it('a second save replaces the first instead of creating another draft', async () => {
    const first = makeDraft({ id: 'draft_first', activeBodyPart: 'Chest', activeExercises: [ex('Bench Press', [['20', '10']])] });
    const second = makeDraft({ id: 'draft_second', activeBodyPart: 'Back', activeExercises: [ex('Pull-Up', [['', '8']])] });

    await useCurrentDraftStore.getState().persistDraft(first);
    await useCurrentDraftStore.getState().persistDraft(second);

    expect([...storage.keys()].filter((k) => k === CURRENT_KEY)).toHaveLength(1);
    const stored = await currentDraftRepository.get();
    expect(stored?.id).toBe('draft_second');
  });
});

/* ----------------------------- numeric input ---------------------------- */

describe('numeric input handling', () => {
  it('drops blank sets instead of creating zero-value completed sets', () => {
    const draft = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [
        ex('Bench Press', [
          ['', ''], // fully blank -> dropped
          ['20', ''], // weight only -> kept (0 reps)
          ['', '12'], // reps only -> kept (0 weight)
        ]),
      ],
    });

    const parts = draftToBodyParts(draft);
    expect(parts[0].exercises[0].sets).toEqual([
      { weight: 20, reps: 0 },
      { weight: 0, reps: 12 },
    ]);
  });

  it('produces no body parts when every set is blank', () => {
    const draft = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [ex('Bench Press', [['', ''], ['', '']])],
    });
    expect(draftToBodyParts(draft)).toEqual([]);
  });

  it('parses partial/invalid numeric strings safely at the commit boundary', () => {
    const draft = makeDraft({
      activeBodyPart: 'Chest',
      activeExercises: [ex('Bench Press', [['17.', '5'], ['1,5', 'x']])],
    });
    expect(draftToBodyParts(draft)[0].exercises[0].sets).toEqual([
      { weight: 17, reps: 5 },
      { weight: 1.5, reps: 0 },
    ]);
  });
});

/* -------------------------------- summary -------------------------------- */

describe('summarizeDraft', () => {
  it('counts committed and active work for the Home card', () => {
    const draft = makeDraft({
      bodyParts: [bp('Chest', 'Bench Press', [['20', '10'], ['22.5', '8']])],
      activeBodyPart: 'Back',
      activeExercises: [ex('Pull-Up', [['', '8']]), ex('Row', [['', '']])],
    });

    expect(summarizeDraft(draft)).toEqual({ parts: ['Chest', 'Back'], exercises: 2, sets: 3 });
  });
});
