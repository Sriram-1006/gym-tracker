/**
 * Preset body parts and exercises (spec: Chest, Back, Legs, Shoulders, Arms,
 * Core). Every field also accepts free text, so users are never locked to
 * these presets.
 */
export const EXERCISE_LIBRARY: Record<string, string[]> = {
  Chest: ['Bench Press', 'Incline Press', 'Push-Up', 'Cable Fly'],
  Back: ['Deadlift', 'Pull-Up', 'Barbell Row', 'Lat Pulldown'],
  Legs: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Lunge'],
  Shoulders: ['Overhead Press', 'Lateral Raise', 'Face Pull', 'Arnold Press'],
  Arms: ['Biceps Curl', 'Hammer Curl', 'Triceps Pushdown', 'Skullcrusher'],
  Core: ['Plank (timed)', 'Crunch', 'Hanging Leg Raise', 'Russian Twist'],
};
