/**
 * Pure sanitizers for numeric `TextInput` values.
 *
 * They run on every keystroke so the raw string the user sees is always the
 * value that will be parsed later: no minus signs, no letters and at most one
 * decimal separator. Partial input (`"17."`, `""`) is preserved so typing is
 * never interrupted.
 */

/** Digits and at most one `.`, `,` treated as `.`, max 7 characters. */
export function sanitizeDecimalInput(text: string): string {
  const normalized = String(text ?? '').replace(/,/g, '.');
  let out = '';
  let seenSeparator = false;
  for (const ch of normalized) {
    if (ch === '.') {
      if (seenSeparator) continue;
      seenSeparator = true;
      out += '.';
    } else if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }
  return out.slice(0, 7);
}

/** Digits only, max 4 characters. */
export function sanitizeIntegerInput(text: string): string {
  return String(text ?? '').replace(/\D/g, '').slice(0, 4);
}
