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

import { renderThemed } from '../helpers/render';
import { DietScreen } from '../../screens/DietScreen';
import { useDietStore } from '../../stores/appStores';
import { formatDisplayDateShort, shiftISODate, todayISO } from '../../data/repositories';
import type { DietLog } from '../../data/models';

const TARGETS = { protein: 140, carbs: 250, fats: 70, fiber: 30, isSetup: true };
const emptyLog = (date: string): DietLog => ({ date, protein: 0, carbs: 0, fats: 0, fiber: 0 });

beforeEach(() => {
  storage.clear();
  useDietStore.setState({
    targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
    todayLog: emptyLog(todayISO()),
    history: [],
    hydrated: false,
  });
});

function setup() {
  renderThemed(<DietScreen />);
}

describe('DietScreen — setup', () => {
  it('shows the first-time empty state', () => {
    setup();
    expect(screen.getByText('Add diet')).toBeTruthy();
    expect(screen.getByText('Get started')).toBeTruthy();
  });

  it('saves targets and switches to the intake view', async () => {
    setup();
    fireEvent.click(screen.getByText('Add diet'));

    // The form is pre-filled with the default targets.
    fireEvent.change(screen.getByDisplayValue('140'), { target: { value: '160' } });
    fireEvent.click(screen.getByText('Save targets'));

    await waitFor(() => expect(useDietStore.getState().targets.protein).toBe(160));
    expect(useDietStore.getState().targets.isSetup).toBe(true);
    await waitFor(() => expect(screen.getByText('Today’s intake')).toBeTruthy());
  });

  it('rejects an all-zero target form', () => {
    setup();
    fireEvent.click(screen.getByText('Add diet'));
    ['140', '250', '70', '30'].forEach((v) => {
      fireEvent.change(screen.getByDisplayValue(v), { target: { value: '0' } });
    });
    fireEvent.click(screen.getByText('Save targets'));
    expect(screen.getByText('Enter a target for at least one macro.')).toBeTruthy();
  });
});

describe('DietScreen — today’s intake', () => {
  beforeEach(() => {
    useDietStore.setState({ targets: TARGETS, hydrated: true });
  });

  it('renders consumed / target and the percentage', () => {
    useDietStore.setState({ todayLog: { date: todayISO(), protein: 70, carbs: 125, fats: 35, fiber: 15 } });
    setup();
    expect(screen.getByText('70g / 140G')).toBeTruthy();
    expect(screen.getByText('125g / 250G')).toBeTruthy();
    // Every macro is at exactly 50% of its target here.
    expect(screen.getAllByText('50%')).toHaveLength(4);
  });

  it('logs intake for a macro', async () => {
    setup();
    fireEvent.click(screen.getByLabelText('Log Protein intake'));
    fireEvent.change(screen.getByPlaceholderText('Grams of protein…'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(useDietStore.getState().todayLog.protein).toBe(80));
    expect(screen.getByText('80g / 140G')).toBeTruthy();
  });

  it('resets today’s log', async () => {
    useDietStore.setState({ todayLog: { date: todayISO(), protein: 80, carbs: 0, fats: 0, fiber: 0 } });
    setup();
    fireEvent.click(screen.getByText('Reset today’s log'));
    await waitFor(() => expect(useDietStore.getState().todayLog.protein).toBe(0));
  });
});

describe('DietScreen — history', () => {
  const yesterday = shiftISODate(todayISO(), -1);
  const older = shiftISODate(todayISO(), -2);

  beforeEach(() => {
    useDietStore.setState({ targets: TARGETS, hydrated: true });
  });

  it('shows previous days newest first, with consumed / target and %', () => {
    useDietStore.setState({
      history: [
        { date: older, protein: 50, carbs: 50, fats: 10, fiber: 5 },
        { date: yesterday, protein: 80, carbs: 100, fats: 20, fiber: 10 },
      ],
    });
    setup();

    expect(screen.getByText('Diet history')).toBeTruthy();
    expect(screen.getByText('80 / 140g · 57%')).toBeTruthy();
    expect(screen.getByText('100 / 250g · 40%')).toBeTruthy();
    expect(screen.getByText('20 / 70g · 29%')).toBeTruthy();
    expect(screen.getByText('10 / 30g · 33%')).toBeTruthy();
    expect(screen.getByText('50 / 140g · 36%')).toBeTruthy();
  });

  it('never duplicates today’s log in history', () => {
    useDietStore.setState({
      todayLog: { date: todayISO(), protein: 999, carbs: 0, fats: 0, fiber: 0 },
      history: [
        { date: todayISO(), protein: 999, carbs: 0, fats: 0, fiber: 0 },
        { date: yesterday, protein: 80, carbs: 0, fats: 0, fiber: 0 },
      ],
    });
    setup();

    // Today's 999 only appears once (as today's intake), never in history.
    expect(screen.queryByText('999 / 140g · 100%')).toBeNull();
    expect(screen.getByText('80 / 140g · 57%')).toBeTruthy();
  });

  it('shows an empty state when there are no previous logs', () => {
    useDietStore.setState({ history: [{ date: todayISO(), ...{ protein: 0, carbs: 0, fats: 0, fiber: 0 } }] });
    setup();
    expect(screen.getByText('No previous diet logs yet.')).toBeTruthy();
  });

  it('renders a single previous day with all four macros', () => {
    useDietStore.setState({
      history: [{ date: yesterday, protein: 132, carbs: 190, fats: 60, fiber: 21 }],
    });
    setup();

    expect(screen.queryByText('No previous diet logs yet.')).toBeNull();
    expect(screen.getByText(formatDisplayDateShort(yesterday))).toBeTruthy();
    expect(screen.getByText('132 / 140g · 94%')).toBeTruthy();
    expect(screen.getByText('190 / 250g · 76%')).toBeTruthy();
    expect(screen.getByText('60 / 70g · 86%')).toBeTruthy();
    expect(screen.getByText('21 / 30g · 70%')).toBeTruthy();
  });

  it('orders history newest → oldest in the DOM', () => {
    useDietStore.setState({
      history: [
        { date: older, protein: 50, carbs: 50, fats: 10, fiber: 5 },
        { date: yesterday, protein: 80, carbs: 100, fats: 20, fiber: 10 },
      ],
    });
    setup();

    // Only history cards render a bare date heading, so the matches are the
    // history entries, in document order.
    const dateHeadings = screen
      .getAllByText(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/)
      .map((el) => el.textContent);
    expect(dateHeadings).toEqual([
      formatDisplayDateShort(yesterday),
      formatDisplayDateShort(older),
    ]);
  });
});
