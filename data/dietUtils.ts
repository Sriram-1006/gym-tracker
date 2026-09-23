import { DietLog } from './models';
import { todayISO } from './dateUtils';

/** Canonical macro order shared by the store, screen and tests. */
export const MACRO_KEYS = ['protein', 'carbs', 'fats', 'fiber'] as const;

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
