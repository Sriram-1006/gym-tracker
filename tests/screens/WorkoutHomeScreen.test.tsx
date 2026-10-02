// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';

const { storage, currentDay } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  currentDay: { value: '2026-09-11' },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

// Controllable clock: `todayISO()` returns `currentDay.value` while still
// supporting explicit Date arguments (used by shiftISODate).
vi.mock('../../data/dateUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/dateUtils')>();
  return {
    ...actual,
    todayISO: (d?: Date) => (d ? actual.todayISO(d) : currentDay.value),
  };
});

// The strength chart pulls in Skia/Victory, which are native-only.
vi.mock('victory-native', () => ({
  CartesianChart: () => null,
  Line: () => null,
  Area: () => null,
}));
vi.mock('@shopify/react-native-skia', () => ({ matchFont: () => undefined }));

import { renderThemed, fakeNavigation } from '../helpers/render';
import { WorkoutHomeScreen } from '../../screens/WorkoutHomeScreen';
import { useCurrentDraftStore, useWorkoutStore } from '../../stores/appStores';
import { createEmptyDraft } from '../../data/repositories';
import type { WorkoutSession } from '../../data/models';

const SESSIONS: WorkoutSession[] = [
  {
    id: 'w_2',
    date: '2026-09-11',
    restDay: false,
    createdAt: 2,
    bodyParts: [
      { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] }] },
    ],
  },
  {
    id: 'w_1',
    date: '2026-09-10',
    restDay: false,
    createdAt: 1,
    bodyParts: [
      { bodyPart: 'Back', exercises: [{ name: 'Deadlift', sets: [{ weight: 100, reps: 5 }] }] },
    ],
  },
];

beforeEach(async () => {
  storage.clear();
  currentDay.value = '2026-09-11';
  await useCurrentDraftStore.getState().clearDraft();
  useCurrentDraftStore.setState({ draft: null, hydrated: false });
  useWorkoutStore.setState({ sessions: SESSIONS, hydrated: true });
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(<WorkoutHomeScreen navigation={navigation} />);
  return { navigation };
}

describe('WorkoutHomeScreen', () => {
  it('lists previous workouts with formatted dates', () => {
    setup();
    expect(screen.getByText('Fri 11 Sep 2026')).toBeTruthy();
    expect(screen.getByText('Thu 10 Sep 2026')).toBeTruthy();
    expect(screen.getByText('+ Add workout')).toBeTruthy();
  });

  it('opens a workout detail when a history row is tapped', () => {
    const { navigation } = setup();
    fireEvent.click(screen.getByLabelText('View workout from 2026-09-11'));
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: 'w_2' });
  });

  it('hides the current-workout card when there is no draft', () => {
    setup();
    expect(screen.queryByText('Current workout')).toBeNull();
    expect(screen.queryByText('In progress')).toBeNull();
  });

  it('shows the current workout above history and resumes into AddWorkout', () => {
    useCurrentDraftStore.setState({
      draft: {
        ...createEmptyDraft('2026-09-17'),
        bodyParts: [
          { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: '20', reps: '10' }] }] },
        ],
        activeBodyPart: 'Back',
        activeExercises: [{ name: 'Pull-Up', sets: [{ weight: '', reps: '8' }] }],
      },
      hydrated: true,
    });

    const { navigation } = setup();

    expect(screen.getByText('Current workout')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Chest, Back')).toBeTruthy();
    expect(screen.getByText('2 exercises · 2 sets')).toBeTruthy();
    expect(screen.getByText('Thu 17 Sep 2026')).toBeTruthy();

    // The CTA switches and both entry points resume (never EditWorkout).
    expect(screen.getByText('Resume current workout')).toBeTruthy();
    fireEvent.click(screen.getByText('Resume workout'));
    expect(navigation.navigate).toHaveBeenCalledWith('AddWorkout');
  });

  it('shows the current workout after leaving and coming back (hydrated from storage)', async () => {
    // Simulate: start a workout, leave the screen (draft persisted), return Home.
    await useCurrentDraftStore.getState().persistDraft({
      ...createEmptyDraft('2026-09-17'),
      activeBodyPart: 'Chest',
      activeExercises: [{ name: 'Bench Press', sets: [{ weight: '20', reps: '10' }] }],
    });
    useCurrentDraftStore.setState({ draft: null, hydrated: false });
    await useCurrentDraftStore.getState().hydrate();

    setup();

    expect(screen.getByText('Current workout')).toBeTruthy();
    expect(screen.getByText('Resume current workout')).toBeTruthy();
  });

  it('never lists the current draft as a completed workout', () => {
    useCurrentDraftStore.setState({
      draft: {
        ...createEmptyDraft('2026-09-17'),
        activeBodyPart: 'Chest',
        activeExercises: [{ name: 'Bench Press', sets: [{ weight: '20', reps: '10' }] }],
      },
      hydrated: true,
    });
    setup();
    // Only the two completed sessions have "View workout" rows.
    expect(screen.getAllByLabelText(/^View workout from /)).toHaveLength(2);
  });

  it('re-reads "today" while the screen stays mounted past midnight', () => {
    // Trained 10 and 11 Sep; it is now 11 Sep → streak 2 and "trained today".
    useWorkoutStore.setState({
      sessions: [
        {
          id: 'w_11',
          date: '2026-09-11',
          restDay: false,
          createdAt: 2,
          bodyParts: [
            { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] }] },
          ],
        },
        {
          id: 'w_10',
          date: '2026-09-10',
          restDay: false,
          createdAt: 1,
          bodyParts: [
            { bodyPart: 'Back', exercises: [{ name: 'Deadlift', sets: [{ weight: 100, reps: 5 }] }] },
          ],
        },
      ],
      hydrated: true,
    });

    vi.useFakeTimers();
    try {
      setup();
      expect(screen.getByText('2 days')).toBeTruthy();
      expect(screen.getByText('Trained today — keep it going!')).toBeTruthy();

      // Two days pass while Home stays on screen: the streak must be
      // recomputed against the new "today" instead of staying frozen.
      currentDay.value = '2026-09-13';
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.getByText('0 days')).toBeTruthy();
      expect(screen.getByText('Rest days don’t break your streak.')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes "today" when the app returns to the foreground', () => {
    // Default SESSIONS: trained 10 + 11 Sep, today is 11 Sep → streak 2.
    // Simulating visibilitychange exercises the AppState 'active' path that
    // mirrors App.tsx's diet rollover — no timer involved.
    let visibility: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });

    setup();
    expect(screen.getByText('2 days')).toBeTruthy();

    // The clock rolls over while the app is in the background: no refresh yet.
    currentDay.value = '2026-09-13';
    visibility = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText('2 days')).toBeTruthy();

    // Back to the foreground: Home recomputes against the new day.
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText('0 days')).toBeTruthy();
    expect(screen.getByText('Rest days don’t break your streak.')).toBeTruthy();
  });
});
