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
import { AddWorkoutScreen } from '../../screens/AddWorkoutScreen';
import { useCurrentDraftStore, useWorkoutStore } from '../../stores/appStores';
import { useExerciseLibraryStore } from '../../stores/exerciseLibraryStore';
import { createEmptyDraft } from '../../data/repositories';

const CURRENT_KEY = 'workouts.current.v1';

beforeEach(async () => {
  storage.clear();
  await useCurrentDraftStore.getState().clearDraft();
  useCurrentDraftStore.setState({ draft: null, hydrated: false });
  useWorkoutStore.setState({ sessions: [], hydrated: false });
  useExerciseLibraryStore.setState({ custom: {}, hydrated: false });
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(<AddWorkoutScreen navigation={navigation} />);
  return { navigation };
}

function selectBodyPart(name: string) {
  fireEvent.click(screen.getByText('Select body part…'));
  fireEvent.click(screen.getByText(name));
  fireEvent.click(screen.getByText('Add'));
}

function addExercise(name: string) {
  fireEvent.click(screen.getByText('Add exercise (pick or type free text)…'));
  fireEvent.click(screen.getByText(name));
  fireEvent.click(screen.getByText('Add exercise'));
}

function enterFirstSet(weight: string, reps: string) {
  fireEvent.change(screen.getAllByPlaceholderText('kg')[0], { target: { value: weight } });
  fireEvent.change(screen.getAllByPlaceholderText('reps')[0], { target: { value: reps } });
}

const draftState = () => useCurrentDraftStore.getState().draft;

describe('AddWorkoutScreen', () => {
  it('opens with the date and body-part step', () => {
    setup();
    expect(screen.getByText('Add workout')).toBeTruthy();
    expect(screen.getByText('Workout date')).toBeTruthy();
    expect(screen.getByText('Select body part…')).toBeTruthy();
  });

  it('opens the body-part picker', () => {
    setup();
    fireEvent.click(screen.getByText('Select body part…'));
    expect(screen.getByText('Select body part')).toBeTruthy();
  });

  it('selects a body part and reveals the exercise step', () => {
    setup();
    selectBodyPart('Chest');

    expect(screen.getByText('2 · Exercises')).toBeTruthy();
    expect(draftState()?.activeBodyPart).toBe('Chest');
  });

  it('adds an exercise to the active body part', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');

    expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(0);
    expect(draftState()?.activeExercises[0].name).toBe('Bench Press');
  });

  it('adds sets and keeps new ones blank', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');

    fireEvent.click(screen.getByText('Add set'));

    expect(draftState()?.activeExercises[0].sets).toEqual([
      { weight: '', reps: '' },
      { weight: '', reps: '' },
    ]);
  });

  it('records weight and reps edits', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    expect(draftState()?.activeExercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
  });

  // P0 — the historical bug: adding another body part must not lose the
  // currently active one.
  it('preserves the active body part when adding another body part', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    fireEvent.click(screen.getByText('Add another body part'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Add'));

    const draft = draftState()!;
    expect(draft.bodyParts.map((b) => b.bodyPart)).toEqual(['Chest']);
    expect(draft.bodyParts[0].exercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
    expect(draft.activeBodyPart).toBe('Back');
  });

  it('restores the active entry when the picker is dismissed (no data loss)', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    fireEvent.click(screen.getByText('Add another body part'));
    fireEvent.click(screen.getByText('Exit'));

    const draft = draftState()!;
    expect(draft.bodyParts).toHaveLength(0); // commit rolled back
    expect(draft.activeBodyPart).toBe('Chest'); // entry restored
    expect(draft.activeExercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
  });

  it('keeps earlier body parts accessible and editable after switching', () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    fireEvent.click(screen.getByText('Add another body part'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Add'));

    // Chest is collapsed in the summary; expanding shows its exercise.
    const chestRows = screen.getAllByText('Chest');
    fireEvent.click(chestRows[chestRows.length - 1]);
    expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(0);
  });

  it('flushes the current workout to storage when Back is pressed', async () => {
    const { navigation } = setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    fireEvent.click(screen.getByText('‹ Back'));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(storage.has(CURRENT_KEY)).toBe(true));
    const persisted = JSON.parse(storage.get(CURRENT_KEY)!);
    expect(persisted.activeBodyPart).toBe('Chest');
    expect(persisted.activeExercises[0].sets[0]).toEqual({ weight: '20', reps: '10' });
  });

  it('resumes a persisted draft with all data restored', async () => {
    const draft = {
      ...createEmptyDraft('2026-09-17'),
      bodyParts: [
        { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: '20', reps: '10' }] }] },
      ],
      activeBodyPart: 'Back',
      activeExercises: [{ name: 'Pull-Up', sets: [{ weight: '', reps: '8' }] }],
    };
    await useCurrentDraftStore.getState().persistDraft(draft);

    setup();

    expect(screen.getByText('Current workout')).toBeTruthy();
    expect(screen.getAllByText('Chest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Back').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pull-Up').length).toBeGreaterThan(0);
  });

  it('Finish turns the draft into a completed workout and clears it', async () => {
    const { navigation } = setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');

    fireEvent.click(screen.getByText('Finish workout'));

    await waitFor(() => expect(useWorkoutStore.getState().sessions).toHaveLength(1));
    const session = useWorkoutStore.getState().sessions[0];
    expect(session.bodyParts[0].exercises[0].sets).toEqual([{ weight: 20, reps: 10 }]);
    expect(session.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(draftState()).toBeNull();
    expect(storage.has(CURRENT_KEY)).toBe(false);
    expect(navigation.popToTop).toHaveBeenCalled();
  });

  it('does not create fake zero-value sets from blank input on Finish', async () => {
    setup();
    selectBodyPart('Chest');
    addExercise('Bench Press');
    enterFirstSet('20', '10');
    // A second, deliberately left-blank set.
    fireEvent.click(screen.getByText('Add set'));
    expect(draftState()?.activeExercises[0].sets).toHaveLength(2);

    fireEvent.click(screen.getByText('Finish workout'));

    await waitFor(() => expect(useWorkoutStore.getState().sessions).toHaveLength(1));
    // Only the entered set is persisted — no 0 kg / 0 reps set is fabricated.
    expect(useWorkoutStore.getState().sessions[0].bodyParts[0].exercises[0].sets).toEqual([
      { weight: 20, reps: 10 },
    ]);
  });
});
