// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const { rejectHydrate } = vi.hoisted(() => ({ rejectHydrate: { current: false } }));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-provider', () => ({
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/Toast', () => ({ ToastHost: () => null }));
vi.mock('../navigation', () => ({ RootNavigator: () => <div>App ready</div> }));

vi.mock('../theme/themeStore', () => {
  const state = { mode: 'light', hydrate: async () => {} };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { useThemeStore: hook };
});

vi.mock('../stores/appStores', () => {
  const hydrate = async () => {
    if (rejectHydrate.current) throw new Error('corrupt storage');
  };
  const makeStore = <T extends object>(extra: T) => {
    const state = { hydrate, ...extra };
    const hook = (selector: (s: typeof state) => unknown) => selector(state);
    hook.getState = () => state;
    return hook;
  };
  return {
    useWorkoutStore: makeStore({ sessions: [] }),
    useDietStore: makeStore({
      targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
      todayLog: { date: '', protein: 0, carbs: 0, fats: 0, fiber: 0 },
      history: [],
    }),
    useCurrentDraftStore: makeStore({ draft: null }),
  };
});

vi.mock('../stores/exerciseLibraryStore', () => {
  const state = { custom: {}, hydrate: async () => {} };
  const hook = (selector: (s: typeof state) => unknown) => selector(state);
  hook.getState = () => state;
  return { useExerciseLibraryStore: hook };
});

import App from '../App';

beforeEach(() => {
  rejectHydrate.current = false;
});

/** Flush the async hydrate IIFE started by App's mount effect. */
async function flushHydration() {
  await act(async () => {});
}

describe('App startup gate', () => {
  it('leaves the loading gate once every store has hydrated', async () => {
    render(<App />);
    expect(screen.queryByText('App ready')).toBeNull();

    await flushHydration();

    expect(screen.getByText('App ready')).toBeTruthy();
  });

  it('still leaves the loading gate when a store hydrate rejects', async () => {
    rejectHydrate.current = true;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<App />);
    await flushHydration();

    // Without the finally, the rejected hydrate skipped setReady(true) and the
    // app sat on the startup spinner forever.
    expect(screen.getByText('App ready')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('hydrate failed'), expect.any(Error));
    warnSpy.mockRestore();
  });
});
