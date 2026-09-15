import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ThemeContext } from './theme/ThemeContext';
import { getTheme } from './theme/theme';
import { useThemeStore } from './theme/themeStore';
import { useWorkoutStore, useDietStore } from './stores/appStores';
import { RootNavigator } from './navigation';
import { ToastHost } from './components/Toast';

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateWorkouts = useWorkoutStore((s) => s.hydrate);
  const hydrateDiet = useDietStore((s) => s.hydrate);

  const [ready, setReady] = useState(false);
  const theme = getTheme(mode);

  useEffect(() => {
    (async () => {
      await Promise.all([hydrateTheme(), hydrateWorkouts(), hydrateDiet()]);
      setReady(true);
    })();
  }, [hydrateTheme, hydrateWorkouts, hydrateDiet]);

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
