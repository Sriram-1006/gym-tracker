/**
 * Preset body parts and exercises (spec: Chest, Back, Legs, Shoulders, Biceps,
 * Triceps, Core). Every field also accepts free text, so users are never locked
 * to these presets.
 */
export const EXERCISE_LIBRARY: Record<string, string[]> = {
  Chest: ['Bench Press', 'Incline Press', 'Push-Up', 'Cable Fly'],
  Back: ['Deadlift', 'Pull-Up', 'Barbell Row', 'Lat Pulldown'],
  Legs: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Lunge'],
  Shoulders: ['Overhead Press', 'Lateral Raise', 'Face Pull', 'Arnold Press'],
  Biceps: ['Biceps Curl', 'Hammer Curl'],
  Triceps: ['Triceps Pushdown', 'Skullcrusher'],
  Core: ['Plank (timed)', 'Crunch', 'Hanging Leg Raise', 'Russian Twist'],
};

/**
 * Safe lookups for user-supplied body part names. A custom name such as
 * `constructor`, `toString` or `__proto__` would otherwise hit an inherited
 * `Object` member (`EXERCISE_LIBRARY['constructor']` is a function) and crash
 * the caller — so only own properties are ever read.
 */
export function getPresetExercises(bodyPart: string): string[] {
  return Object.prototype.hasOwnProperty.call(EXERCISE_LIBRARY, bodyPart) ? EXERCISE_LIBRARY[bodyPart] : [];
}

export function getCustomExercises(custom: Record<string, string[]>, bodyPart: string): string[] {
  return Object.prototype.hasOwnProperty.call(custom, bodyPart) ? custom[bodyPart] : [];
}
