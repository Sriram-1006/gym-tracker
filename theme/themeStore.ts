import { create } from 'zustand';

import { storageService } from '../data/services/storageService';
import { defaultThemeMode, ThemeMode } from './theme';

interface ThemeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  hydrate: () => Promise<void>;
}

/**
 * Theme store. The user's choice is persisted to AsyncStorage so the app
 * opens with the same theme next launch (spec: persist theme toggle).
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: defaultThemeMode,
  hydrated: false,
  setMode: (mode) => {
    set({ mode });
    void storageService.setItem('theme.mode', mode);
  },
  toggleMode: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
  hydrate: async () => {
    const saved = await storageService.getItem<ThemeMode>('theme.mode');
    set({ mode: saved ?? defaultThemeMode, hydrated: true });
  },
}));
