/**
 * Pure, side-effect-free helpers for the in-progress "current workout" draft.
 *
 * Keeping this logic out of the screens/store means the exact same conversion
 * is used by autosave, resume and finish — and it is directly unit-testable.
 *
 * Key rule: while editing, weight/reps stay raw strings. Numbers are only
 * produced at the commit boundary (`draftToBodyParts`), where blank or invalid
 * fields are dropped rather than silently turned into zero-value sets.
 */
import {
  BodyPartEntry,
  CurrentWorkoutDraft,
  DraftBodyPart,
  DraftExercise,
  DraftSet,
  ExerciseEntry,
} from './models';
import { todayISO } from './dateUtils';

/** A set counts as "entered" when either field has a non-blank value. */
export function hasSetData(s: DraftSet): boolean {
  return s.weight.trim() !== '' || s.reps.trim() !== '';
}

function exerciseHasData(ex: DraftExercise): boolean {
  return ex.sets.some(hasSetData);
}

export function createEmptyDraft(date: string = todayISO()): CurrentWorkoutDraft {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date,
    bodyParts: [],
    activeBodyPart: null,
    activeExercises: [],
    activeExerciseName: '',
    updatedAt: Date.now(),
  };
}

/**
 * True when the draft holds anything worth resuming. Used to decide whether to
 * persist a draft at all and whether Home should show the Current Workout card.
 */
export function hasMeaningfulDraftData(draft: CurrentWorkoutDraft | null): boolean {
  if (!draft) return false;
  if (draft.bodyParts.some((bp) => bp.exercises.length > 0)) return true;
  if (draft.activeBodyPart) return true;
  if (draft.activeExercises.some(exerciseHasData)) return true;
  if (draft.activeExercises.length > 0) return true;
  return false;
}

/**
 * Trim exercise names and drop sets with no entered value. Names are kept even
 * when every set is blank so the in-progress form survives a round-trip through
 * a commit (the user may not have typed a weight yet).
 */
export function cleanDraftExercises(exercises: DraftExercise[]): DraftExercise[] {
  return exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets.filter(hasSetData).map((s) => ({ ...s })),
    }))
    .filter((ex) => ex.name !== '');
}

/** Merge two exercise lists, joining same-named exercises by appending sets. */
export function mergeDraftExercises(a: DraftExercise[], b: DraftExercise[]): DraftExercise[] {
  const merged = a.map((ex) => ({ ...ex, sets: [...ex.sets] }));
  for (const incoming of b) {
    const idx = merged.findIndex((ex) => ex.name.toLowerCase() === incoming.name.toLowerCase());
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], sets: [...merged[idx].sets, ...incoming.sets] };
    } else {
      merged.push({ ...incoming, sets: [...incoming.sets] });
    }
  }
  return merged;
}

/**
 * Fold the currently active body part into `bodyParts` and clear the active
 * entry. This is the single authoritative commit path used before opening the
 * body-part picker, before Finish, and on resume — so the active part can never
 * be lost or persisted twice.
 */
export function commitActiveBodyPart(draft: CurrentWorkoutDraft): CurrentWorkoutDraft {
  const part = draft.activeBodyPart;
  if (!part) return draft;

  const exercises = cleanDraftExercises(draft.activeExercises);
  const cleared: CurrentWorkoutDraft = {
    ...draft,
    activeBodyPart: null,
    activeExercises: [],
    activeExerciseName: '',
  };

  if (exercises.length === 0) {
    // Nothing entered (or only blank sets). With `onlyIfData` the caller takes
    // responsibility for validating, so we still clear the empty entry.
    return cleared;
  }

  const idx = draft.bodyParts.findIndex((bp) => bp.bodyPart === part);
  const bodyParts: DraftBodyPart[] =
    idx >= 0
      ? draft.bodyParts.map((bp, i) =>
          i === idx ? { ...bp, exercises: mergeDraftExercises(bp.exercises, exercises) } : bp,
        )
      : [...draft.bodyParts, { bodyPart: part, exercises }];

  return { ...cleared, bodyParts };
}

/** Parse a user-typed numeric string; blank/invalid -> 0. Accepts "1,5". */
export function parseDraftNumber(value: string): number {
  if (value == null) return 0;
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toSessionExercise(ex: DraftExercise): ExerciseEntry {
  return {
    name: ex.name.trim(),
    sets: ex.sets
      .map((s) => ({ weight: parseDraftNumber(s.weight), reps: parseDraftNumber(s.reps) }))
      // Drop fully blank sets — never fabricate a 0 kg / 0 reps completed set.
      .filter((s) => s.weight !== 0 || s.reps !== 0),
  };
}

/**
 * Commit boundary: turn a draft (including its still-active body part) into
 * numeric completed-session body parts. Returns [] when nothing valid remains.
 */
export function draftToBodyParts(draft: CurrentWorkoutDraft): BodyPartEntry[] {
  const parts: BodyPartEntry[] = draft.bodyParts
    .map((bp) => ({
      bodyPart: bp.bodyPart,
      exercises: bp.exercises.map(toSessionExercise).filter((e) => e.name && e.sets.length > 0),
    }))
    .filter((bp) => bp.exercises.length > 0);

  const active = draft.activeBodyPart;
  if (active) {
    const exercises = draft.activeExercises.map(toSessionExercise).filter(
      (e) => e.name && e.sets.length > 0,
    );
    if (exercises.length > 0) {
      const idx = parts.findIndex((bp) => bp.bodyPart === active);
      if (idx >= 0) {
        parts[idx] = {
          bodyPart: active,
          exercises: [...parts[idx].exercises, ...exercises],
        };
      } else {
        parts.push({ bodyPart: active, exercises });
      }
    }
  }

  return parts;
}

export interface DraftSummary {
  parts: string[];
  exercises: number;
  sets: number;
}

/** Lightweight counts for the Home "Current workout" card. */
export function summarizeDraft(draft: CurrentWorkoutDraft): DraftSummary {
  const parts: string[] = [];
  let exercises = 0;
  let sets = 0;

  for (const bp of draft.bodyParts) {
    parts.push(bp.bodyPart);
    for (const ex of bp.exercises) {
      exercises += 1;
      sets += ex.sets.length;
    }
  }

  if (draft.activeBodyPart) {
    const activeExercises = draft.activeExercises.filter(exerciseHasData);
    if (activeExercises.length > 0) {
      parts.push(draft.activeBodyPart);
      for (const ex of activeExercises) {
        exercises += 1;
        sets += ex.sets.filter(hasSetData).length;
      }
    }
  }

  return { parts, exercises, sets };
}
