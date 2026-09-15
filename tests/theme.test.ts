import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useThemeStore } from '../theme/themeStore';
import { getTheme } from '../theme/theme';

beforeEach(() => {
  storage.clear();
  useThemeStore.setState({ mode: 'light', hydrated: false });
});

describe('useThemeStore', () => {
  it('defaults to light mode when nothing is saved', async () => {
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().mode).toBe('light');
    expect(useThemeStore.getState().hydrated).toBe(true);
  });

  it('hydrate restores a persisted dark mode', async () => {
    storage.set('theme.mode', JSON.stringify('dark'));

    await useThemeStore.getState().hydrate();

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(getTheme(useThemeStore.getState().mode).mode).toBe('dark');
  });

  it('toggleMode flips light → dark and persists the choice', async () => {
    useThemeStore.getState().toggleMode();

    expect(useThemeStore.getState().mode).toBe('dark');
    expect(JSON.parse(storage.get('theme.mode')!)).toBe('dark');
  });

  it('toggleMode is symmetric (dark → light)', async () => {
    useThemeStore.getState().toggleMode(); // dark
    useThemeStore.getState().toggleMode(); // light again

    expect(useThemeStore.getState().mode).toBe('light');
    expect(JSON.parse(storage.get('theme.mode')!)).toBe('light');
  });
});
