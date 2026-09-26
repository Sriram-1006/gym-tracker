// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';

import { renderThemed } from '../helpers/render';
import { WorkoutDraftEditor } from '../../components/workoutDraftEditor';
import { lightTheme } from '../../theme/theme';
import type { DraftBodyPart } from '../../data/models';

const themeProps = {
  colors: lightTheme.colors,
  spacing: lightTheme.spacing,
  fontSize: lightTheme.fontSize,
  radius: lightTheme.radius,
  touchTarget: lightTheme.touchTarget,
};

const draft: DraftBodyPart[] = [
  {
    bodyPart: 'Chest',
    exercises: [
      { name: 'Bench Press', sets: [{ weight: '20', reps: '10' }, { weight: '', reps: '' }] },
    ],
  },
];

function setup(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onToggleExpansion: vi.fn(),
    onRemoveBodyPart: vi.fn(),
    onRemoveExercise: vi.fn(),
    onRemoveSet: vi.fn(),
    onAddSet: vi.fn(),
    onUpdateSet: vi.fn(),
    onAddExercise: vi.fn(),
    openExercisePicker: vi.fn(),
  };
  const utils = renderThemed(
    <WorkoutDraftEditor
      draft={draft}
      expandedParts={new Set(['Chest'])}
      {...themeProps}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, ...utils };
}

describe('WorkoutDraftEditor', () => {
  it('renders body parts, exercises and their set values', () => {
    setup();
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByDisplayValue('20')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
  });

  it('keeps a blank set blank (no forced zero)', () => {
    setup();
    const blanks = screen.getAllByPlaceholderText('kg') as HTMLInputElement[];
    expect(blanks.some((input) => input.value === '')).toBe(true);
    const repBlanks = screen.getAllByPlaceholderText('reps') as HTMLInputElement[];
    expect(repBlanks.some((input) => input.value === '')).toBe(true);
  });

  it('reports weight edits with the exact typed string', () => {
    const { onUpdateSet } = setup();
    const kgInputs = screen.getAllByPlaceholderText('kg');
    fireEvent.change(kgInputs[0], { target: { value: '22.5' } });
    expect(onUpdateSet).toHaveBeenCalledWith('Chest', 0, 0, { weight: '22.5' });
  });

  it('reports reps edits', () => {
    const { onUpdateSet } = setup();
    fireEvent.change(screen.getAllByPlaceholderText('reps')[0], { target: { value: '8' } });
    expect(onUpdateSet).toHaveBeenCalledWith('Chest', 0, 0, { reps: '8' });
  });

  it('adds a set', () => {
    const { onAddSet } = setup();
    fireEvent.click(screen.getByText('Add set'));
    expect(onAddSet).toHaveBeenCalledWith('Chest', 0);
  });

  it('removes the second set', () => {
    const { onRemoveSet } = setup();
    fireEvent.click(screen.getByLabelText('Remove set 2'));
    expect(onRemoveSet).toHaveBeenCalledWith('Chest', 0, 1);
  });

  it('removes an exercise', () => {
    const { onRemoveExercise } = setup();
    fireEvent.click(screen.getByText('Remove'));
    expect(onRemoveExercise).toHaveBeenCalledWith('Chest', 0);
  });

  it('removes a whole body part', () => {
    const { onRemoveBodyPart } = setup();
    fireEvent.click(screen.getByLabelText('Remove Chest'));
    expect(onRemoveBodyPart).toHaveBeenCalledWith('Chest');
  });

  it('collapses a body part to a summary and requests expansion on press', () => {
    const { onToggleExpansion } = setup({ expandedParts: new Set<string>() });
    expect(screen.getByText('1 exercise · 2 sets')).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();

    fireEvent.click(screen.getByText('Chest'));
    expect(onToggleExpansion).toHaveBeenCalledWith('Chest');
  });

  it('renders nothing for an empty draft', () => {
    const { container } = setup({ draft: [] });
    expect(container.textContent).toBe('');
  });
});
