import { describe, it, expect } from 'vitest';

import {
  todayISO,
  shiftISODate,
  daysBetweenISO,
  computeSessionStrength,
  computeStrengthSeries,
  computeStreak,
} from '../data/repositories';
import { WorkoutSession } from '../data/models';

/* ------------------------------ factories ------------------------------- */

const id = (() => {
  let n = 0;
  return (prefix = 'w') => `${prefix}_${++n}`;
})();

/** Build a plain (non-rest) workout session with the given per-exercise sets. */
function workout(
  date: string,
  setsByExercise: Record<string, Array<[number, number]>>,
): WorkoutSession {
  return {
    id: id(),
    date,
    restDay: false,
    createdAt: Date.now(),
    bodyParts: [
      {
        bodyPart: 'Chest',
        exercises: Object.entries(setsByExercise).map(([name, sets]) => ({
          name,
          sets: sets.map(([weight, reps]) => ({ weight, reps })),
        })),
      },
    ],
  };
}

function restDay(date: string): WorkoutSession {
  return {
    id: id('r'),
    date,
    restDay: true,
    createdAt: Date.now(),
    bodyParts: [],
  };
}

/* ----------------------------- date helpers ----------------------------- */

describe('date helpers', () => {
  it('todayISO formats the current date as YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 8, 11))).toBe('2026-09-11');
  });

  it('todayISO zero-pads month and day', () => {
    expect(todayISO(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('shiftISODate moves days forward and backward across month boundaries', () => {
    expect(shiftISODate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftISODate('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftISODate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('shiftISODate handles leap years', () => {
    expect(shiftISODate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('daysBetweenISO is signed and DST-independent (UTC math)', () => {
    expect(daysBetweenISO('2026-09-01', '2026-09-11')).toBe(10);
    expect(daysBetweenISO('2026-09-11', '2026-09-01')).toBe(-10);
    expect(daysBetweenISO('2026-02-28', '2026-03-01')).toBe(1); // non-leap Feb end
  });
});

/* --------------------------- strength analytics -------------------------- */

describe('computeSessionStrength', () => {
  it('sums weight × reps over all exercises and sets', () => {
    const s = workout('2026-09-11', {
      'Bench Press': [[60, 8], [60, 8]],
      'Cable Fly': [[20, 12]],
    });
    // 60*8 + 60*8 + 20*12 = 1200
    expect(computeSessionStrength(s)).toBe(1200);
  });

  it('treats missing weight or reps in a set as 0, not NaN', () => {
    const s: WorkoutSession = {
      id: 'w_x',
      date: '2026-09-11',
      restDay: false,
      createdAt: 0,
      bodyParts: [
        {
          bodyPart: 'Core',
          exercises: [
            { name: 'Plank (timed)', sets: [{ weight: 0, reps: 0 }] },
          ],
        },
      ],
    };
    expect(computeSessionStrength(s)).toBe(0);
  });

  it('is 0 for a session with no exercises', () => {
    const s = workout('2026-09-11', {});
    expect(computeSessionStrength(s)).toBe(0);
  });
});

describe('computeStrengthSeries', () => {
  it('plots one point per day and sums same-day sessions', () => {
    const sessions = [
      workout('2026-09-10', { A: [[50, 10]] }), // 500
      workout('2026-09-11', { B: [[100, 2]] }), // 200
      workout('2026-09-11', { C: [[200, 1]] }), // 200
    ];
    expect(computeStrengthSeries(sessions)).toEqual([
      { date: '2026-09-10', score: 500 },
      { date: '2026-09-11', score: 400 },
    ]);
  });

  it('returns points sorted chronologically regardless of input order', () => {
    const sessions = [
      workout('2026-09-11', { A: [[10, 1]] }),
      workout('2026-09-01', { A: [[10, 1]] }),
      workout('2026-09-05', { A: [[10, 1]] }),
    ];
    const dates = computeStrengthSeries(sessions).map((p) => p.date);
    expect(dates).toEqual(['2026-09-01', '2026-09-05', '2026-09-11']);
  });

  it('excludes rest days from the graph', () => {
    const sessions = [workout('2026-09-10', { A: [[10, 1]] }), restDay('2026-09-11')];
    expect(computeStrengthSeries(sessions)).toEqual([
      { date: '2026-09-10', score: 10 },
    ]);
  });
});

/* --------------------------------- streak -------------------------------- */
/*
 * Pinned behaviour (confirmed with the user): marking a day as rest from the
 * app must keep an ongoing streak alive — the streak "continues" through a
 * rest mark. Only a day with neither a workout nor a rest mark breaks it.
 */

describe('computeStreak', () => {
  it('counts consecutive workout days including today', () => {
    const today = '2026-09-11';
    const sessions = [workout('2026-09-10', { A: [[1, 1]] }), workout(today, { A: [[1, 1]] })];
    expect(computeStreak(sessions, today)).toEqual({ current: 2, activeToday: true });
  });

  it('a marked rest day continues the streak (bridges the chain, adds nothing to the count)', () => {
    const today = '2026-09-11';
    const sessions = [
      workout('2026-09-09', { A: [[1, 1]] }), // Tue
      restDay('2026-09-10'), // Wed: opened the app and marked rest
      workout(today, { A: [[1, 1]] }), // Thu
    ];
    // The Wed rest mark does not break the chain — the two workout days stay
    // connected — but only workout days are counted (mirrors the README
    // example: Mon+Tue+Thu = 3, Wednesday "doesn't count against you").
    expect(computeStreak(sessions, today)).toEqual({ current: 2, activeToday: true });
  });

  it('marking today as rest keeps yesterday’s streak visible instead of resetting it', () => {
    const today = '2026-09-11';
    const sessions = [workout('2026-09-10', { A: [[1, 1]] }), restDay(today)];
    // Without the rest mark this would be 0; marking rest keeps it alive.
    expect(computeStreak(sessions, today)).toEqual({ current: 1, activeToday: false });
  });

  it('a rest day today keeps a stale streak alive without extending it', () => {
    const today = '2026-09-11';
    const sessions = [
      workout('2026-09-09', { A: [[1, 1]] }),
      workout('2026-09-10', { A: [[1, 1]] }),
      restDay(today), // no training today, but marked as rest
    ];
    expect(computeStreak(sessions, today)).toEqual({ current: 2, activeToday: false });
  });

  it('an untrained, unmarked day breaks the streak', () => {
    const today = '2026-09-11';
    const sessions = [workout('2026-09-09', { A: [[1, 1]] })];
    // 09-10 has neither workout nor rest mark → chain stops there.
    expect(computeStreak(sessions, today)).toEqual({ current: 0, activeToday: false });
  });

  it('yesterday-only training does not carry into today uninvited', () => {
    const today = '2026-09-11';
    const sessions = [workout('2026-09-10', { A: [[1, 1]] })];
    expect(computeStreak(sessions, today)).toEqual({ current: 0, activeToday: false });
  });

  it('an unmarked today after a rest-marked yesterday still breaks the chain', () => {
    const today = '2026-09-11';
    const sessions = [
      workout('2026-09-08', { A: [[1, 1]] }),
      restDay('2026-09-09'),
      restDay('2026-09-10'),
    ];
    // Rest marks bridge 09-08 → 09-10, but today (09-11) is neither workout
    // nor rest, so nothing anchors the streak to the present.
    expect(computeStreak(sessions, today)).toEqual({ current: 0, activeToday: false });
  });

  it('multiple consecutive rest marks bridge workouts across a long pause', () => {
    const today = '2026-09-11';
    const sessions = [
      workout('2026-09-05', { A: [[1, 1]] }),
      restDay('2026-09-06'),
      restDay('2026-09-07'),
      restDay('2026-09-08'),
      restDay('2026-09-09'),
      restDay('2026-09-10'),
      workout(today, { A: [[1, 1]] }),
    ];
    // The two workout days remain one unbroken chain through the rest marks
    // (not 0), but rest days themselves contribute nothing to the count.
    expect(computeStreak(sessions, today)).toEqual({ current: 2, activeToday: true });
  });

  it('future rest marks do not extend a live streak', () => {
    const today = '2026-09-11';
    const sessions = [
      workout('2026-09-10', { A: [[1, 1]] }),
      workout(today, { A: [[1, 1]] }),
      restDay('2026-09-12'), // marked tomorrow (sloppy data) — must be ignored
    ];
    expect(computeStreak(sessions, today)).toEqual({ current: 2, activeToday: true });
  });

  it('counts today with no prior history', () => {
    const today = '2026-09-11';
    const sessions = [workout(today, { A: [[1, 1]] })];
    expect(computeStreak(sessions, today)).toEqual({ current: 1, activeToday: true });
  });

  it('returns zero for no sessions at all', () => {
    expect(computeStreak([], '2026-09-11')).toEqual({ current: 0, activeToday: false });
  });
});
