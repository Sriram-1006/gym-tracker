import { useEffect, useState } from 'react';
import { AppState, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ThemeContext } from './theme/ThemeContext';
import { getTheme } from './theme/theme';
import { useThemeStore } from './theme/themeStore';
import { useWorkoutStore, useDietStore, useCurrentDraftStore } from './stores/appStores';
import { useExerciseLibraryStore } from './stores/exerciseLibraryStore';
import { RootNavigator } from './navigation';
import { ToastHost } from './components/Toast';

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateWorkouts = useWorkoutStore((s) => s.hydrate);
  const hydrateDiet = useDietStore((s) => s.hydrate);
  const hydrateExercises = useExerciseLibraryStore((s) => s.hydrate);
  const hydrateCurrentDraft = useCurrentDraftStore((s) => s.hydrate);

  const [ready, setReady] = useState(false);
  const theme = getTheme(mode);

  useEffect(() => {
    (async () => {
      await Promise.all([hydrateTheme(), hydrateWorkouts(), hydrateDiet(), hydrateExercises(), hydrateCurrentDraft()]);
      setReady(true);
    })();
  }, [hydrateTheme, hydrateWorkouts, hydrateDiet, hydrateExercises, hydrateCurrentDraft]);

  // Diet midnight rollover: if the app stays open across midnight, re-point the
  // "today" log at the new day. A once-a-minute check plus an app-state check
  // is enough — no wasteful per-second timer.
  useEffect(() => {
    const sync = () => {
      void useDietStore.getState().syncDay();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const id = setInterval(sync, 30_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, []);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
        {/* Global toast host — shows e.g. "Workout deleted" feedback. */}
        <ToastHost />
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
