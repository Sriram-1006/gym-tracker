import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * In-memory AsyncStorage shared by all store tests. `vi.hoisted` runs before
 * the module mocks/imports below, so the same Map instance is captured by the
 * mock factory and readable/writable from the tests.
 */
const { storage } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return { storage };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

import { useWorkoutStore, useDietStore, BodyPartInput } from '../stores/appStores';
import { todayISO, shiftISODate, computeStreak } from '../data/repositories';
import { WorkoutSession, DietLog } from '../data/models';

/** Reset zustand modules to a pristine state and clear fake storage. */
function resetStores() {
  useWorkoutStore.setState({ sessions: [], hydrated: false });
  useDietStore.setState({
    targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
    todayLog: { date: todayISO(), protein: 0, carbs: 0, fats: 0, fiber: 0 },
    hydrated: false,
  });
}

beforeEach(() => {
  storage.clear();
  resetStores();
});

/* ----------------------------- workout store ----------------------------- */

describe('useWorkoutStore', () => {
  const pushUps: BodyPartInput = {
    bodyPart: 'Chest',
    exercises: [{ name: 'Push-Up', sets: [{ weight: 0, reps: 20 }] }],
  };

  it('addSession persists the session and sorts newest first', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-10' });
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-11' });

    const { sessions } = useWorkoutStore.getState();
    expect(sessions.map((s) => s.date)).toEqual(['2026-09-11', '2026-09-10']);
    // Written through to storage, not just held in memory:
    const persisted = JSON.parse(storage.get('workouts.sessions.v1')!) as WorkoutSession[];
    expect(persisted).toHaveLength(2);
  });

  it('hydrate restores sessions from storage', async () => {
    const saved: WorkoutSession[] = [
      {
        id: 'w_1',
        date: '2026-09-09',
        restDay: false,
        createdAt: 1,
        bodyParts: [
          { bodyPart: 'Back', exercises: [{ name: 'Deadlift', sets: [{ weight: 100, reps: 5 }] }] },
        ],
      },
    ];
    storage.set('workouts.sessions.v1', JSON.stringify(saved));

    await useWorkoutStore.getState().hydrate();

    const state = useWorkoutStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].bodyParts[0].exercises[0].name).toBe('Deadlift');
  });

  it('toggleRestDay marks today as rest without touching workouts', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-10' });

    const err = await useWorkoutStore.getState().toggleRestDay('2026-09-11');
    expect(err).toBeNull();

    const { sessions } = useWorkoutStore.getState();
    expect(sessions).toHaveLength(2);
    const rest = sessions.find((s) => s.restDay);
    expect(rest?.date).toBe('2026-09-11');
    expect(rest?.bodyParts).toEqual([]);
    // The real workout survived.
    expect(sessions.some((s) => s.date === '2026-09-10' && !s.restDay)).toBe(true);
  });

  it('toggleRestDay rejects a day that is already marked as rest (no duplicates)', async () => {
    await useWorkoutStore.getState().toggleRestDay('2026-09-11');
    expect(useWorkoutStore.getState().sessions).toHaveLength(1);

    const err = await useWorkoutStore.getState().toggleRestDay('2026-09-11');
    expect(err).toMatch(/already marked as a rest day/);
    // Still exactly one marker session — nothing was duplicated.
    expect(useWorkoutStore.getState().sessions).toHaveLength(1);
  });

  it('toggleRestDay rejects a day that already has a logged workout', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-11' });

    const err = await useWorkoutStore.getState().toggleRestDay('2026-09-11');
    expect(err).toMatch(/already logged a workout/);
    // No rest marker was created alongside the workout.
    expect(useWorkoutStore.getState().sessions.filter((s) => s.restDay)).toHaveLength(0);
    expect(useWorkoutStore.getState().sessions).toHaveLength(1);
  });

  it('deleteSession removes only the targeted session and persists the change', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-10' });
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-11' });
    const targetId = useWorkoutStore.getState().sessions.find((s) => s.date === '2026-09-10')!.id;

    await useWorkoutStore.getState().deleteSession(targetId);

    const { sessions } = useWorkoutStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].date).toBe('2026-09-11');

    const persisted = JSON.parse(storage.get('workouts.sessions.v1')!) as WorkoutSession[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].date).toBe('2026-09-11');
  });

  it('deleteSession drops the day from the streak (recomputed from scratch, not decremented)', async () => {
    const today = todayISO();
    const yesterday = shiftISODate(today, -1);
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: yesterday });
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: today });
    expect(computeStreak(useWorkoutStore.getState().sessions, today).current).toBe(2);

    // Delete today's session: the streak must be rebuilt from the remaining
    // data (yesterday alone does not carry into today), not go 2 → 1.
    const todayId = useWorkoutStore.getState().sessions.find((s) => s.date === today)!.id;
    await useWorkoutStore.getState().deleteSession(todayId);

    expect(computeStreak(useWorkoutStore.getState().sessions, today)).toEqual({
      current: 0,
      activeToday: false,
    });
  });

  it('deleteSession removes a rest-day marker', async () => {
    await useWorkoutStore.getState().toggleRestDay('2026-09-11');
    const restId = useWorkoutStore.getState().sessions.find((s) => s.restDay)!.id;

    await useWorkoutStore.getState().deleteSession(restId);

    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('deleteSession persists the removal — the workout stays gone after a reload', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-11' });
    const targetId = useWorkoutStore.getState().sessions[0].id;

    await useWorkoutStore.getState().deleteSession(targetId);
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);

    // Simulate an app restart: wipe in-memory state, then hydrate from storage.
    useWorkoutStore.setState({ sessions: [], hydrated: false });
    await useWorkoutStore.getState().hydrate();
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('deleteSession keeps other days intact across a reload', async () => {
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-10' });
    await useWorkoutStore.getState().addSession({ bodyParts: [pushUps], dateISO: '2026-09-11' });
    const targetId = useWorkoutStore.getState().sessions.find((s) => s.date === '2026-09-11')!.id;

    await useWorkoutStore.getState().deleteSession(targetId);

    useWorkoutStore.setState({ sessions: [], hydrated: false });
    await useWorkoutStore.getState().hydrate();
    const dates = useWorkoutStore.getState().sessions.map((s) => s.date);
    expect(dates).toEqual(['2026-09-10']);
  });
});

/* ------------------------------- diet store ------------------------------ */

describe('useDietStore', () => {
  it('setupTargets marks the diet as set up and persists it', async () => {
    await useDietStore.getState().setupTargets({ protein: 140, carbs: 250, fats: 70, fiber: 30 });

    const { targets } = useDietStore.getState();
    expect(targets.isSetup).toBe(true);
    expect(JSON.parse(storage.get('diet.targets.v1')!).isSetup).toBe(true);
  });

  it('hydrate restores targets and today log from storage', async () => {
    storage.set(
      'diet.targets.v1',
      JSON.stringify({ protein: 120, carbs: 200, fats: 50, fiber: 25, isSetup: true }),
    );
    const log: DietLog = { date: todayISO(), protein: 30, carbs: 0, fats: 10, fiber: 5 };
    storage.set('diet.logs.v1', JSON.stringify([log]));

    await useDietStore.getState().hydrate();

    const state = useDietStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.targets.protein).toBe(120);
    expect(state.todayLog.protein).toBe(30);
  });

  it('hydrate falls back to an empty log when nothing is logged today', async () => {
    const yesterday = shiftISODate(todayISO(), -1);
    storage.set(
      'diet.logs.v1',
      JSON.stringify([{ date: yesterday, protein: 99, carbs: 0, fats: 0, fiber: 0 }]),
    );
    await useDietStore.getState().hydrate();
    expect(useDietStore.getState().todayLog).toEqual({
      date: todayISO(),
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    });
  });

  it('addToLog accumulates into the existing log for today', async () => {
    await useDietStore.getState().addToLog({ protein: 30 });
    await useDietStore.getState().addToLog({ protein: 20, fiber: 5 });

    const { todayLog } = useDietStore.getState();
    expect(todayLog.protein).toBe(50);
    expect(todayLog.fiber).toBe(5);
    expect(todayLog.carbs).toBe(0);

    const persisted = JSON.parse(storage.get('diet.logs.v1')!) as DietLog[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].protein).toBe(50);
  });

  it('resetTodayLog zeroes the log while keeping other days intact', async () => {
    const yesterday: DietLog = {
      date: shiftISODate(todayISO(), -1),
      protein: 80,
      carbs: 0,
      fats: 0,
      fiber: 0,
    };
    storage.set('diet.logs.v1', JSON.stringify([yesterday]));

    await useDietStore.getState().addToLog({ protein: 30 });
    await useDietStore.getState().resetTodayLog();

    const persisted = JSON.parse(storage.get('diet.logs.v1')!) as DietLog[];
    expect(persisted).toHaveLength(2);
    expect(persisted.find((l) => l.date === shiftISODate(todayISO(), -1))?.protein).toBe(80);
    expect(useDietStore.getState().todayLog.protein).toBe(0);
  });
});
