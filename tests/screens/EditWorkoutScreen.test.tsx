// @vitest-environment jsdom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

// Toast is a side effect, not state: spy on it so tests can assert how often
// it fires (StrictMode re-runs state updaters, so an updater must stay pure).
vi.mock('../../components/Toast', () => ({ showToast: vi.fn() }));

import { renderThemed, fakeNavigation } from '../helpers/render';
import { EditWorkoutScreen } from '../../screens/EditWorkoutScreen';
import { showToast } from '../../components/Toast';
import { useWorkoutStore } from '../../stores/appStores';
import { useExerciseLibraryStore } from '../../stores/exerciseLibraryStore';
import { computeSessionStrength } from '../../data/repositories';
import { ThemeContext } from '../../theme/ThemeContext';
import { getTheme } from '../../theme/theme';
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
  vi.mocked(showToast).mockClear();
  useWorkoutStore.setState({ sessions: [{ ...SESSION, bodyParts: SESSION.bodyParts.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })) })) }], hydrated: true });
  useExerciseLibraryStore.setState({ custom: {}, hydrated: false });
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(<EditWorkoutScreen navigation={navigation} route={{ params: { sessionId: 'w_1' } }} />);
  return { navigation };
}

/** Same screen wrapped in StrictMode, which re-runs state updater functions. */
function setupStrict() {
  const navigation = fakeNavigation();
  render(
    <StrictMode>
      <ThemeContext.Provider value={getTheme('light')}>
        <EditWorkoutScreen navigation={navigation} route={{ params: { sessionId: 'w_1' } }} />
      </ThemeContext.Provider>
    </StrictMode>,
  );
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

  it('keeps an in-progress body part when "Add another body part" is used', async () => {
    setup();
    fireEvent.click(screen.getByText('Add body part'));
    fireEvent.click(screen.getByText('Legs'));
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Add exercise (pick or type free text)…'));
    fireEvent.click(screen.getByText('Squat'));
    fireEvent.click(screen.getByText('Add exercise'));
    fireEvent.change(screen.getAllByPlaceholderText('kg')[0], { target: { value: '60' } });
    fireEvent.change(screen.getAllByPlaceholderText('reps')[0], { target: { value: '10' } });

    // Move on to another body part WITHOUT saving first.
    fireEvent.click(screen.getByText('Add another body part'));
    fireEvent.click(screen.getByText('Shoulders'));
    fireEvent.click(screen.getByText('Add'));

    confirmSave();
    await waitFor(() =>
      expect(currentSession().bodyParts.map((b) => b.bodyPart)).toContain('Legs'),
    );
    const legs = currentSession().bodyParts.find((b) => b.bodyPart === 'Legs')!;
    expect(legs.exercises[0].name).toBe('Squat');
    expect(legs.exercises[0].sets).toEqual([{ weight: 60, reps: 10 }]);
    // The original Chest/Back data must still be there.
    expect(currentSession().bodyParts.map((b) => b.bodyPart)).toContain('Chest');
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

  // Toasts are side effects: firing them from inside a state updater means
  // React's StrictMode re-run of that updater shows the message twice.
  // (Test B below is the red test; this one pins the behaviour itself.)
  it('toasts once when the same exercise is added twice from the active entry', () => {
    setup();

    fireEvent.click(screen.getByText('Add body part'));
    fireEvent.click(screen.getByText('Legs'));
    fireEvent.click(screen.getByText('Add'));

    const typeName = (name: string) => {
      fireEvent.click(screen.getByText('Add exercise (pick or type free text)…'));
      fireEvent.change(screen.getByPlaceholderText('Custom exercise name…'), { target: { value: name } });
      fireEvent.click(screen.getByText('Use this name'));
    };

    typeName('Zzyzx Curl');
    fireEvent.click(screen.getByText('Add exercise'));
    expect(showToast).not.toHaveBeenCalled();

    typeName('Zzyzx Curl');
    fireEvent.click(screen.getByText('Add exercise'));

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      'Zzyzx Curl is already in this workout — added another set to it.',
    );
  });

  it('toasts once when picking an exercise that already exists in the body part', () => {
    setupStrict();

    expandBodyPart('Chest');
    fireEvent.click(screen.getByText('Add exercise'));

    // The exercise name is visible in the expanded card too; the picker modal
    // renders later in the tree, so its entry is the last match.
    const matches = screen.getAllByText('Bench Press');
    fireEvent.click(matches[matches.length - 1]);

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      'Bench Press is already in this workout — added another set to it.',
    );
  });
});
