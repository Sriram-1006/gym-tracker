import { create } from 'zustand';
import { customExerciseRepository } from '../data/repositories';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

interface ExerciseLibraryState {
  custom: Record<string, string[]>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addCustomExercise: (bodyPart: string, name: string) => void;
}

function normalizeName(name: string): string {
  return name.trim();
}

function nameExists(library: string[], custom: string[], name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    library.some((n) => n.toLowerCase() === normalized) ||
    custom.some((n) => n.toLowerCase() === normalized)
  );
}

export const useExerciseLibraryStore = create<ExerciseLibraryState>((set, get) => ({
  custom: {},
  hydrated: false,

  hydrate: async () => {
    const custom = await customExerciseRepository.getAll();
    set({ custom, hydrated: true });
  },

  addCustomExercise: (bodyPart: string, name: string) => {
    const normalized = normalizeName(name);
    if (!normalized) return;

    const preset = EXERCISE_LIBRARY[bodyPart] ?? [];
    const currentCustom = get().custom[bodyPart] ?? [];

    if (nameExists(preset, currentCustom, normalized)) return;

    const nextCustom = { ...get().custom, [bodyPart]: [...currentCustom, normalized] };
    set({ custom: nextCustom });
    customExerciseRepository.saveAll(nextCustom);
  },
}));