import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  exportAllData,
  importAllData,
  validateBackupPayload,
  type BackupPayload,
} from '../../data/repositories';
import { WorkoutSession } from '../../data/models';

const WORKOUTS_KEY = 'workouts.sessions.v1';
const DIET_LOGS_KEY = 'diet.logs.v1';

function validBackup(): BackupPayload {
  return {
    exportVersion: 1,
    exportedAt: '2026-09-20T10:00:00.000Z',
    data: {
      workouts: [
        {
          id: 'w_1',
          date: '2026-09-11',
          restDay: false,
          createdAt: 1,
          bodyParts: [
            {
              bodyPart: 'Chest',
              exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] }],
            },
          ],
        },
      ],
      dietTargets: { protein: 140, carbs: 250, fats: 70, fiber: 30, isSetup: true },
      dietLogs: [{ date: '2026-09-10', protein: 80, carbs: 100, fats: 20, fiber: 10 }],
      customExercises: { Chest: ['Custom Fly'] },
      themeMode: 'dark',
    },
  };
}

beforeEach(() => {
  storage.clear();
  failOn.key = null;
});

/* ------------------------------- export -------------------------------- */

describe('exportAllData', () => {
  it('produces a versioned payload with every category', async () => {
    const payload = await exportAllData();
    expect(payload.exportVersion).toBe(1);
    expect(Number.isNaN(Date.parse(payload.exportedAt))).toBe(false);
    expect(Array.isArray(payload.data.workouts)).toBe(true);
    expect(payload.data.dietTargets).toMatchObject({ protein: 0, isSetup: false });
    expect(Array.isArray(payload.data.dietLogs)).toBe(true);
    expect(payload.data.customExercises).toEqual({});
    expect(payload.data.themeMode).toBe('light');
  });

  it('includes stored data', async () => {
    const workouts: WorkoutSession[] = validBackup().data.workouts;
    storage.set(WORKOUTS_KEY, JSON.stringify(workouts));
    const payload = await exportAllData();
    expect(payload.data.workouts).toHaveLength(1);
    expect(payload.data.workouts[0].bodyParts[0].exercises[0].name).toBe('Bench Press');
  });
});

/* ----------------------------- validation ------------------------------- */

describe('validateBackupPayload', () => {
  it('accepts a complete, well-formed backup', () => {
    expect(() => validateBackupPayload(validBackup())).not.toThrow();
  });

  it.each([
    ['null payload', null],
    ['array payload', []],
    ['wrong version', { ...validBackup(), exportVersion: 2 }],
    ['missing data', { exportVersion: 1, exportedAt: 'x', data: null }],
    ['bad timestamp', { ...validBackup(), exportedAt: 'not-a-date' }],
  ])('rejects a %s', (_label, payload) => {
    expect(() => validateBackupPayload(payload)).toThrow();
  });

  it('rejects a malformed nested workout', () => {
    const bad = validBackup();
    // deliberately corrupt
    bad.data.workouts[0].bodyParts[0].exercises[0].sets[0].weight = -5;
    expect(() => validateBackupPayload(bad)).toThrow(/invalid weight/);
  });

  it('rejects an invalid workout date', () => {
    const bad = validBackup();
    // deliberately corrupt
    bad.data.workouts[0].date = '2026-02-30';
    expect(() => validateBackupPayload(bad)).toThrow(/invalid date/);
  });

  it('rejects a NaN-like set value', () => {
    const bad = validBackup();
    // deliberately corrupt
    bad.data.workouts[0].bodyParts[0].exercises[0].sets[0].reps = Number.NaN;
    expect(() => validateBackupPayload(bad)).toThrow(/invalid reps/);
  });

  it('rejects a malformed diet log', () => {
    const bad = validBackup();
    // @ts-expect-error deliberately corrupt
    bad.data.dietLogs[0].protein = 'lots';
    expect(() => validateBackupPayload(bad)).toThrow(/diet log/i);
  });

  it('rejects an invalid diet target', () => {
    const bad = validBackup();
    // deliberately corrupt
    bad.data.dietTargets.fiber = -1;
    expect(() => validateBackupPayload(bad)).toThrow(/fiber/);
  });

  it('rejects malformed custom exercises', () => {
    const bad = validBackup();
    // @ts-expect-error deliberately corrupt
    bad.data.customExercises = { Chest: 'not an array' };
    expect(() => validateBackupPayload(bad)).toThrow(/custom exercises/i);
  });

  it('rejects an invalid theme mode', () => {
    const bad = validBackup();
    // @ts-expect-error deliberately corrupt
    bad.data.themeMode = 'neon';
    expect(() => validateBackupPayload(bad)).toThrow(/theme/i);
  });
});

/* ------------------------------- import --------------------------------- */

describe('importAllData', () => {
  it('restores every category', async () => {
    await importAllData(validBackup());

    expect(JSON.parse(storage.get(WORKOUTS_KEY)!) as WorkoutSession[]).toHaveLength(1);
    expect(JSON.parse(storage.get('diet.targets.v1')!).protein).toBe(140);
    expect(JSON.parse(storage.get(DIET_LOGS_KEY)!)).toHaveLength(1);
    expect(JSON.parse(storage.get('exercises.custom.v1')!).Chest).toEqual(['Custom Fly']);
    expect(JSON.parse(storage.get('theme.mode')!)).toBe('dark');
  });

  it('does not modify existing data when validation fails', async () => {
    const existing: WorkoutSession[] = [
      { id: 'keep', date: '2026-01-01', restDay: false, createdAt: 1, bodyParts: [] },
    ];
    storage.set(WORKOUTS_KEY, JSON.stringify(existing));

    await expect(importAllData({ exportVersion: 1, exportedAt: 'x', data: { workouts: 'nope' } })).rejects.toThrow();
    expect(JSON.parse(storage.get(WORKOUTS_KEY)!)).toEqual(existing);
  });

  it('rolls back to the previous data when a write fails mid-import', async () => {
    const existing: WorkoutSession[] = [
      { id: 'keep', date: '2026-01-01', restDay: false, createdAt: 1, bodyParts: [] },
    ];
    storage.set(WORKOUTS_KEY, JSON.stringify(existing));

    failOn.key = DIET_LOGS_KEY;
    await expect(importAllData(validBackup())).rejects.toThrow(/previous data was kept/);
    failOn.key = null;

    // The workout key was written first, then rolled back to the original.
    expect(JSON.parse(storage.get(WORKOUTS_KEY)!)).toEqual(existing);
  });
});
