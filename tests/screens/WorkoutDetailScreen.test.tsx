// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

import { renderThemed, fakeNavigation } from '../helpers/render';
import { WorkoutDetailScreen } from '../../screens/WorkoutDetailScreen';
import { useWorkoutStore } from '../../stores/appStores';
import type { WorkoutSession } from '../../data/models';

const SESSION: WorkoutSession = {
  id: 'w_9',
  date: '2026-09-11',
  restDay: false,
  createdAt: 1,
  bodyParts: [
    { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] }] },
  ],
};

beforeEach(() => {
  storage.clear();
  useWorkoutStore.setState({ sessions: [SESSION], hydrated: true });
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(
    <WorkoutDetailScreen navigation={navigation} route={{ params: { sessionId: 'w_9' } }} />,
  );
  return { navigation };
}

describe('WorkoutDetailScreen', () => {
  it('shows the session with a shared formatted date', () => {
    setup();
    expect(screen.getAllByText('Fri 11 Sep 2026').length).toBeGreaterThan(0);
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('Set 1: 60 kg × 8 reps')).toBeTruthy();
  });

  it('opens the correct session in the editor', () => {
    const { navigation } = setup();
    fireEvent.click(screen.getByLabelText('Edit this workout'));
    expect(navigation.navigate).toHaveBeenCalledWith('EditWorkout', { sessionId: 'w_9' });
  });

  it('cancel in the delete dialog keeps the workout', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Delete this workout'));
    expect(screen.getByText('Delete this workout?')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(useWorkoutStore.getState().sessions).toHaveLength(1);
  });

  it('confirming delete removes the workout and returns', async () => {
    const { navigation } = setup();
    fireEvent.click(screen.getByLabelText('Delete this workout'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(useWorkoutStore.getState().sessions).toHaveLength(0));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('shows a not-found state for an unknown session', () => {
    const navigation = fakeNavigation();
    renderThemed(
      <WorkoutDetailScreen navigation={navigation} route={{ params: { sessionId: 'missing' } }} />,
    );
    expect(screen.getByText('This workout could not be found.')).toBeTruthy();
  });
});
