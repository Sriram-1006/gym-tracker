import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { WorkoutHomeScreen } from '../screens/WorkoutHomeScreen';
import { DietScreen } from '../screens/DietScreen';
import { AddWorkoutScreen } from '../screens/AddWorkoutScreen';
import { WorkoutDetailScreen } from '../screens/WorkoutDetailScreen';
import { EditWorkoutScreen } from '../screens/EditWorkoutScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type RootStackParamList = {
  WorkoutTabs: undefined;
  AddWorkout: undefined;
  WorkoutDetail: { sessionId: string };
  EditWorkout: { sessionId: string };
  Settings: undefined;
};

export type RootTabParamList = {
  Workout: undefined;
  Diet: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function WorkoutTabIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="barbell-outline" size={size} color={color} />;
}

function DietTabIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="nutrition-outline" size={size} color={color} />;
}

/** Bottom tab bar — Workout | Diet — visible on both main screens (spec). */
function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tab.Screen name="Workout" component={WorkoutHomeScreen} options={{ tabBarIcon: WorkoutTabIcon }} />
      <Tab.Screen name="Diet" component={DietScreen} options={{ tabBarIcon: DietTabIcon }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const theme = useTheme();
  const { colors } = theme;

  const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="WorkoutTabs" component={MainTabs} />
        <Stack.Screen
          name="AddWorkout"
          component={AddWorkoutScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="EditWorkout"
          component={EditWorkoutScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
