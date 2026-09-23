import { describe, expect, it } from 'vitest';

import {
  formatDisplayDate,
  formatDisplayDateShort,
  isFutureISO,
  isValidISODate,
  normalizeDateInput,
  parseISODateLocal,
  shiftISODate,
  todayISO,
} from '../../data/repositories';

describe('todayISO', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(todayISO(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(todayISO(new Date(2026, 8, 11))).toBe('2026-09-11');
    expect(todayISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('parseISODateLocal', () => {
  it('builds a local date without UTC shifting', () => {
    const d = parseISODateLocal('2026-01-01');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe('formatDisplayDate', () => {
  it('formats a weekday + day + month + year, locale-independently', () => {
    expect(formatDisplayDate('2026-09-11')).toBe('Fri 11 Sep 2026');
    expect(formatDisplayDate('2026-01-01')).toBe('Thu 1 Jan 2026');
    expect(formatDisplayDate('2026-12-31')).toBe('Thu 31 Dec 2026');
  });

  it('never shifts the day for any input (timezone-safe display)', () => {
    for (const iso of ['2026-01-01', '2026-03-08', '2026-06-15', '2026-11-01', '2026-12-31']) {
      const day = Number(iso.slice(8, 10));
      expect(formatDisplayDate(iso)).toContain(` ${day} `);
    }
  });

  it('falls back to the raw value for invalid input', () => {
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDisplayDateShort', () => {
  it('omits the year for compact lists', () => {
    expect(formatDisplayDateShort('2026-09-23')).toBe('Wed 23 Sep');
  });
});

describe('isValidISODate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false); // not a leap year
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-00-10')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('2026-4-1')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate(20260101)).toBe(false);
  });
});

describe('isFutureISO / normalizeDateInput', () => {
  it('flags dates after today and allows today/past', () => {
    expect(isFutureISO('2026-09-24', '2026-09-23')).toBe(true);
    expect(isFutureISO('2026-09-23', '2026-09-23')).toBe(false);
    expect(isFutureISO('2026-09-22', '2026-09-23')).toBe(false);
  });

  it('normalizes a raw date input value', () => {
    expect(normalizeDateInput('2026-09-23')).toBe('2026-09-23');
    expect(normalizeDateInput('')).toBeNull();
    expect(normalizeDateInput('2026-02-30')).toBeNull();
  });
});

describe('shiftISODate boundaries', () => {
  it('crosses month, year and leap boundaries deterministically', () => {
    expect(shiftISODate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftISODate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftISODate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftISODate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is correct across a DST transition (date math is DST-independent)', () => {
    // US DST spring-forward 2026-03-08, fall-back 2026-11-01.
    expect(shiftISODate('2026-03-08', 1)).toBe('2026-03-09');
    expect(shiftISODate('2026-03-08', -1)).toBe('2026-03-07');
    expect(shiftISODate('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftISODate('2026-11-01', -1)).toBe('2026-10-31');
  });
});
