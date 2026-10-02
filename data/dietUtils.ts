import { DietLog } from './models';
import { todayISO } from './dateUtils';

/** Canonical macro order shared by the store, screen and tests. */
export const MACRO_KEYS = ['protein', 'carbs', 'fats', 'fiber'] as const;

/** Round a gram total to one decimal so `10.1 + 20.2` shows 30.3, not 30.299999999999997. */
export const roundGrams = (n: number): number => Math.round(n * 10) / 10;

/** Display form of a gram total (one decimal, no float noise). */
export const formatGrams = (n: number): string => String(roundGrams(n));

/** True when a log has any non-zero intake. */
export function dietLogHasData(log: DietLog): boolean {
  return log.protein > 0 || log.carbs > 0 || log.fats > 0 || log.fiber > 0;
}

/**
 * De-duplicate logs by date (last write wins) and sort newest first. This keeps
 * exactly one entry per calendar day even if older versions wrote duplicates.
 */
export function normalizeDietLogs(logs: DietLog[]): DietLog[] {
  const byDate = new Map<string, DietLog>();
  for (const log of logs) byDate.set(log.date, log);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Previous days only, newest first, with empty days removed. Today is shown by
 * the dedicated "Today's intake" UI, so it must never be duplicated here.
 */
export function selectHistoricalLogs(logs: DietLog[], today: string = todayISO()): DietLog[] {
  return normalizeDietLogs(logs)
    .filter((log) => log.date < today)
    .filter(dietLogHasData);
}
