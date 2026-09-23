/**
 * Timezone-safe date helpers shared across every screen.
 *
 * Storage always uses local `YYYY-MM-DD` strings. Display formatting is done
 * from the *local* calendar components (never `new Date('YYYY-MM-DD')`, which
 * is parsed as UTC and can shift the day for users west of UTC). Formatting is
 * deliberately locale-independent so it is identical everywhere and testable
 * without depending on the machine's timezone.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Local (not UTC) ISO date, YYYY-MM-DD. */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse an ISO date as a **local** midnight Date (avoids UTC shifting). */
export function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True when the string is a real calendar date in YYYY-MM-DD form. */
export function isValidISODate(iso: unknown): iso is string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Primary display format: "Thu 11 Sep 2026". Falls back to the raw value. */
export function formatDisplayDate(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const dt = parseISODateLocal(iso);
  return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** Compact display format (for dense lists): "Thu 11 Sep". */
export function formatDisplayDateShort(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const dt = parseISODateLocal(iso);
  return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

/** ISO dates compare correctly as strings; used to block future selections. */
export function isFutureISO(iso: string, today: string = todayISO()): boolean {
  return isValidISODate(iso) && iso > today;
}

/**
 * Validate a raw date-input value (used by the web `<input type="date">`).
 * Returns the ISO string when valid, otherwise null.
 */
export function normalizeDateInput(raw: string): string | null {
  return isValidISODate(raw) ? raw : null;
}
