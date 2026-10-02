import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { getCustomExercises, getPresetExercises } from '../data/exerciseLibrary';

beforeEach(() => {
  storage.clear();
  useExerciseLibraryStore.setState({ custom: {}, hydrated: false });
});

describe('getPresetExercises', () => {
  it('returns the preset list for a known body part', () => {
    expect(getPresetExercises('Chest')).toContain('Bench Press');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'returns [] for %s instead of an inherited Object member',
    (name) => {
      expect(getPresetExercises(name)).toEqual([]);
    },
  );
});

describe('getCustomExercises', () => {
  it('returns the custom list for a known body part', () => {
    expect(getCustomExercises({ Chest: ['Custom Fly'] }, 'Chest')).toEqual(['Custom Fly']);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'returns [] for %s instead of an inherited Object member',
    (name) => {
      expect(getCustomExercises({}, name)).toEqual([]);
    },
  );
});

describe('addCustomExercise with prototype-colliding body part names', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'stores %s without throwing and without duplicating it',
    (name) => {
      expect(() => useExerciseLibraryStore.getState().addCustomExercise(name, 'Foo')).not.toThrow();
      expect(getCustomExercises(useExerciseLibraryStore.getState().custom, name)).toEqual(['Foo']);

      expect(() => useExerciseLibraryStore.getState().addCustomExercise(name, 'Foo')).not.toThrow();
      expect(getCustomExercises(useExerciseLibraryStore.getState().custom, name)).toEqual(['Foo']);
    },
  );
});
