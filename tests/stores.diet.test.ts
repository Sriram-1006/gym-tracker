import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage, currentDay } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  currentDay: { value: '2026-09-23' },
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
vi.mock('../data/dateUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/dateUtils')>();
  return {
    ...actual,
    todayISO: (d?: Date) => (d ? actual.todayISO(d) : currentDay.value),
  };
});

import { useDietStore } from '../stores/appStores';
import { selectHistoricalLogs, normalizeDietLogs } from '../data/repositories';
import type { DietLog } from '../data/models';

const LOGS_KEY = 'diet.logs.v1';
const log = (date: string, protein: number, carbs = 0, fats = 0, fiber = 0): DietLog => ({
  date,
  protein,
  carbs,
  fats,
  fiber,
});

function seed(logs: DietLog[]) {
  storage.set(LOGS_KEY, JSON.stringify(logs));
}

beforeEach(() => {
  storage.clear();
  currentDay.value = '2026-09-23';
  useDietStore.setState({
    targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
    todayLog: log('2026-09-23', 0),
    history: [],
    hydrated: false,
  });
});

describe('diet midnight rollover', () => {
  it('hydrates today’s log for the current calendar day', async () => {
    seed([log('2026-09-23', 50), log('2026-09-22', 80)]);
    await useDietStore.getState().hydrate();

    expect(useDietStore.getState().todayLog.date).toBe('2026-09-23');
    expect(useDietStore.getState().todayLog.protein).toBe(50);
  });

  it('re-points today’s log after the day changes, keeping yesterday in history', async () => {
    seed([log('2026-09-23', 50), log('2026-09-24', 10, 20)]);
    await useDietStore.getState().hydrate();
    expect(useDietStore.getState().todayLog.protein).toBe(50);

    // 23:59 → 00:01
    currentDay.value = '2026-09-24';
    await useDietStore.getState().syncDay();

    const state = useDietStore.getState();
    expect(state.todayLog.date).toBe('2026-09-24');
    expect(state.todayLog.protein).toBe(10);
    // Yesterday is untouched in storage and history.
    expect(state.history.find((l) => l.date === '2026-09-23')?.protein).toBe(50);
    const persisted = JSON.parse(storage.get(LOGS_KEY)!) as DietLog[];
    expect(persisted.find((l) => l.date === '2026-09-23')?.protein).toBe(50);
  });

  it('starts a clean log for the new day when none exists yet', async () => {
    seed([log('2026-09-23', 50)]);
    await useDietStore.getState().hydrate();

    currentDay.value = '2026-09-24';
    await useDietStore.getState().syncDay();

    expect(useDietStore.getState().todayLog).toEqual(log('2026-09-24', 0));
    expect(useDietStore.getState().history.find((l) => l.date === '2026-09-23')?.protein).toBe(50);
  });

  it('is a no-op while the day has not changed', async () => {
    seed([log('2026-09-23', 50)]);
    await useDietStore.getState().hydrate();

    await useDietStore.getState().syncDay();
    expect(useDietStore.getState().todayLog.protein).toBe(50);
  });

  it('logs new intake against the rolled-over day', async () => {
    seed([log('2026-09-23', 50)]);
    await useDietStore.getState().hydrate();

    currentDay.value = '2026-09-24';
    await useDietStore.getState().syncDay();
    await useDietStore.getState().addToLog({ protein: 30 });

    expect(useDietStore.getState().todayLog.date).toBe('2026-09-24');
    expect(useDietStore.getState().todayLog.protein).toBe(30);
    const persisted = JSON.parse(storage.get(LOGS_KEY)!) as DietLog[];
    expect(persisted.find((l) => l.date === '2026-09-23')?.protein).toBe(50);
    expect(persisted.find((l) => l.date === '2026-09-24')?.protein).toBe(30);
  });
});

describe('diet history access', () => {
  it('normalizeDietLogs de-duplicates by date and sorts newest first', () => {
    const normalized = normalizeDietLogs([
      log('2026-09-20', 10),
      log('2026-09-22', 30),
      log('2026-09-20', 99),
    ]);
    expect(normalized.map((l) => l.date)).toEqual(['2026-09-22', '2026-09-20']);
    expect(normalized.find((l) => l.date === '2026-09-20')?.protein).toBe(99);
  });

  it('selectHistoricalLogs returns previous non-empty days, newest first', () => {
    const result = selectHistoricalLogs(
      [
        log('2026-09-23', 50), // today — excluded
        log('2026-09-22', 80),
        log('2026-09-21', 0), // empty — excluded
        log('2026-09-20', 12),
      ],
      '2026-09-23',
    );
    expect(result.map((l) => l.date)).toEqual(['2026-09-22', '2026-09-20']);
  });

  it('exposes history through the store without raw storage access', async () => {
    seed([log('2026-09-22', 80), log('2026-09-23', 50)]);
    await useDietStore.getState().hydrate();

    expect(useDietStore.getState().getHistoricalLogs().map((l) => l.date)).toEqual(['2026-09-22']);
  });

  it('reads a specific date via getLogForDate and every log via getDietLogs', async () => {
    seed([log('2026-09-22', 80, 190, 60, 21), log('2026-09-23', 50, 210, 65, 24)]);
    await useDietStore.getState().hydrate();

    const state = useDietStore.getState();
    expect(state.getLogForDate('2026-09-22')).toMatchObject({
      protein: 80,
      carbs: 190,
      fats: 60,
      fiber: 21,
    });
    // Today is reachable by date too; it is only *history* that excludes it.
    expect(state.getLogForDate('2026-09-23')?.protein).toBe(50);
    expect(state.getLogForDate('2026-01-01')).toBeUndefined();
    expect(state.getDietLogs().map((l) => l.date)).toEqual(['2026-09-23', '2026-09-22']);
  });

  it('survives a reload, including a persisted midnight rollover', async () => {
    // Log today, then let the day roll over — today's entry becomes yesterday.
    await useDietStore.getState().addToLog({ protein: 40, carbs: 60 });
    currentDay.value = '2026-09-24';
    await useDietStore.getState().syncDay();

    // Simulate an app restart: drop memory, hydrate from storage.
    useDietStore.setState({
      targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
      todayLog: log('2026-09-24', 0),
      history: [],
      hydrated: false,
    });
    await useDietStore.getState().hydrate();

    const history = useDietStore.getState().getHistoricalLogs();
    expect(history.map((l) => l.date)).toEqual(['2026-09-23']);
    expect(history[0].protein).toBe(40);
    expect(history[0].carbs).toBe(60);
    expect(useDietStore.getState().todayLog.date).toBe('2026-09-24');
  });
});
