// @vitest-environment jsdom
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
import { EditWorkoutScreen } from '../../screens/EditWorkoutScreen';
import { useWorkoutStore } from '../../stores/appStores';
import { useExerciseLibraryStore } from '../../stores/exerciseLibraryStore';
import { computeSessionStrength } from '../../data/repositories';
import type { WorkoutSession } from '../../data/models';

const SESSION: WorkoutSession = {
  id: 'w_1',
  date: '2026-09-17',
  restDay: false,
  createdAt: 1,
  bodyParts: [
    { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: 15, reps: 20 }] }] },
    { bodyPart: 'Back', exercises: [{ name: 'Pull-Up', sets: [{ weight: 20, reps: 12 }] }] },
  ],
};

beforeEach(() => {
  storage.clear();
  useWorkoutStore.setState({ sessions: [{ ...SESSION, bodyParts: SESSION.bodyParts.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })) })) }], hydrated: true });
  useExerciseLibraryStore.setState({ custom: {}, hydrated: false });
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(<EditWorkoutScreen navigation={navigation} route={{ params: { sessionId: 'w_1' } }} />);
  return { navigation };
}

function expandBodyPart(name: string) {
  const rows = screen.getAllByText(name);
  fireEvent.click(rows[rows.length - 1]);
}

function confirmSave() {
  fireEvent.click(screen.getByText('Save Changes'));
  expect(screen.getByText('Save changes to this workout?')).toBeTruthy();
  fireEvent.click(screen.getByText('Save'));
}

const currentSession = () => useWorkoutStore.getState().sessions.find((s) => s.id === 'w_1')!;

describe('EditWorkoutScreen', () => {
  it('loads an existing workout with a formatted date', () => {
    setup();
    expect(screen.getByText('Edit workout')).toBeTruthy();
    // On web the shared DatePickerField renders a real date input, keeping the
    // same YYYY-MM-DD value even though the display differs from native.
    const dateInput = screen.getByLabelText('Workout date') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-09-17');
    expect(dateInput.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByText('Body parts in this session')).toBeTruthy();
    expect(screen.getAllByText('Chest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Back').length).toBeGreaterThan(0);
    // Both body parts are collapsed summaries: "1 exercise · 1 set" each.
    expect(screen.getAllByText('1 exercise · 1 set')).toHaveLength(2);
  });

  it('asks for confirmation before saving, and Cancel changes nothing', () => {
    setup();
    expandBodyPart('Chest');
    fireEvent.change(screen.getAllByPlaceholderText('kg')[0], { target: { value: '99' } });

    fireEvent.click(screen.getByText('Save Changes'));
    expect(screen.getByText('Save changes to this workout?')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));

    // Nothing persisted, nothing navigated.
    expect(currentSession().bodyParts[0].exercises[0].sets[0].weight).toBe(15);
  });

  // THE regression this phase must protect: editing one body part previously
  // wiped the rest (2 sets / 540 volume → 0 sets / 0 volume).
  it('editing one body part keeps every other exercise, set and value', async () => {
    const { navigation } = setup();
    expect(computeSessionStrength(currentSession())).toBe(540);

    expandBodyPart('Chest');
    fireEvent.change(screen.getAllByPlaceholderText('kg')[0], { target: { value: '25' } });
    confirmSave();

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

    const session = currentSession();
    expect(session.id).toBe('w_1');
    expect(session.bodyParts.map((b) => b.bodyPart)).toEqual(['Chest', 'Back']);

    const chest = session.bodyParts[0];
    const back = session.bodyParts[1];
    expect(chest.exercises[0].name).toBe('Bench Press');
    expect(chest.exercises[0].sets).toEqual([{ weight: 25, reps: 20 }]);
    // Back is completely untouched.
    expect(back.exercises[0].name).toBe('Pull-Up');
    expect(back.exercises[0].sets).toEqual([{ weight: 20, reps: 12 }]);
    // 25*20 + 20*12 = 740, and no exercise vanished.
    expect(computeSessionStrength(session)).toBe(740);
  });

  it('saves by updating the existing session — never a duplicate', async () => {
    setup();
    expandBodyPart('Chest');
    fireEvent.change(screen.getAllByPlaceholderText('reps')[0], { target: { value: '5' } });
    confirmSave();

    await waitFor(() => expect(currentSession().bodyParts[0].exercises[0].sets[0].reps).toBe(5));
    expect(useWorkoutStore.getState().sessions).toHaveLength(1);
    expect(useWorkoutStore.getState().sessions[0].id).toBe('w_1');
  });

  it('adds another body part with sets and keeps the original data', async () => {
    setup();

    fireEvent.click(screen.getByText('Add body part'));
    fireEvent.click(screen.getByText('Legs'));
    fireEvent.click(screen.getByText('Add'));

    expect(screen.getByText('Exercise entry')).toBeTruthy();
    fireEvent.click(screen.getByText('Add exercise (pick or type free text)…'));
    fireEvent.click(screen.getByText('Squat'));
    fireEvent.click(screen.getByText('Add exercise'));

    fireEvent.change(screen.getAllByPlaceholderText('kg')[0], { target: { value: '60' } });
    fireEvent.change(screen.getAllByPlaceholderText('reps')[0], { target: { value: '10' } });

    confirmSave();

    await waitFor(() =>
      expect(currentSession().bodyParts.map((b) => b.bodyPart)).toEqual(['Chest', 'Back', 'Legs']),
    );
    const session = currentSession();
    expect(session.bodyParts[0].exercises[0].sets).toEqual([{ weight: 15, reps: 20 }]);
    expect(session.bodyParts[1].exercises[0].sets).toEqual([{ weight: 20, reps: 12 }]);
    expect(session.bodyParts[2].exercises[0].sets).toEqual([{ weight: 60, reps: 10 }]);
  });

  it('deletes a set through the confirmation dialog', async () => {
    // Chest with two sets so removing one keeps the exercise and the Back part.
    useWorkoutStore.setState({
      sessions: [
        {
          ...SESSION,
          bodyParts: [
            {
              bodyPart: 'Chest',
              exercises: [{ name: 'Bench Press', sets: [{ weight: 15, reps: 20 }, { weight: 20, reps: 10 }] }],
            },
            SESSION.bodyParts[1],
          ],
        },
      ],
      hydrated: true,
    });

    setup();
    expandBodyPart('Chest');
    fireEvent.click(screen.getByLabelText('Remove set 2'));
    expect(screen.getByText('Delete this set?')).toBeTruthy();
    fireEvent.click(screen.getByText('Delete'));

    confirmSave();

    await waitFor(() =>
      expect(currentSession().bodyParts[0].exercises[0].sets).toEqual([{ weight: 15, reps: 20 }]),
    );
    // The untouched body part is still there.
    expect(currentSession().bodyParts[1].exercises[0].sets).toEqual([{ weight: 20, reps: 12 }]);
  });
});
