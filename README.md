# Gym Tracker

A simple, offline-first mobile gym tracker built with React Native (Expo).

Gym Tracker has **two tabs** at the bottom of every screen:

- **Workout** — log training sessions, watch your strength grow on a graph, keep a day streak alive, resume an in-progress workout, and browse every past workout.
- **Diet** — set daily targets for protein, carbs, fats and fiber, log what you eat, and review a history of previous days.

Everything is stored on your device. No account, no internet connection and no backend are needed.

---

## Getting started

You need [Node.js](https://nodejs.org) (Node 22+ recommended) and the **Expo Go** app on your phone, or an Android/iOS emulator.

```bash
npm install     # install dependencies
npx expo start  # start the dev server
```

To run in a **browser** (handy when no phone/emulator is around):

```bash
npx expo start --web   # or press `w` in a running dev server
```

Then open the printed URL (default `http://localhost:8081`).

Useful checks during development:

```bash
npm run typecheck   # TypeScript checks (tsc --noEmit, includes unused-code checks)
npm test            # run the full unit + component test suite (vitest run)
npm run test:watch  # same suite in watch mode
```

---

## The Workout tab

### Current workout (auto-saved)

Your workout-in-progress is **separate from completed history** and is **saved automatically** as you type:

- Every change — date, body part, exercise, sets, weights, reps — is written to storage. Typing is debounced by a fraction of a second; structural changes and leaving the screen are written immediately.
- Pressing **Back** keeps the workout as the **Current workout** — it is never discarded and never becomes a completed session by accident.
- The **Workout** home screen shows a highlighted **Current workout** card above *Previous workouts* whenever a draft exists, with a **Resume workout** button.
- There is **at most one** current workout. If one already exists, the home CTA becomes **“Resume current workout”** and opening it resumes the same draft instead of starting another.
- The draft survives closing and reopening the app (it is hydrated on startup).
- **Current workouts do not appear in Previous workouts, the strength graph, or the streak** until you finish them.

### Logging a workout

1. Tap **“+ Add workout”** (or **“Resume current workout”** to continue an existing one).
2. Pick a **body part** from the presets (Chest, Back, Legs, Shoulders, Biceps, Triceps, Core) **or type any custom name**.
3. Add **exercises** — pick a preset for that body part or type any custom name. You can add several before moving on.
4. Add **sets** with a weight (kg) and reps. New sets start **blank** and stay blank until you type — an empty field is never forced to `0`.
5. Tap **“Add another body part”** to add more. The body part you were working on is committed to the saved draft **before** the picker opens, so nothing can be lost (this was a fixed bug).
6. Tap **“Finish workout”** to finalise. The whole session is saved as **one completed workout**, the current draft is cleared, and you land back on the Workout screen.

There is deliberately **no separate “Save” button**: auto-save preserves progress, **Back** leaves it as current, and **Finish** completes it.

### Date selection

- The workout date defaults to today and can be changed from the Add/Edit screens.
- **Future dates are not selectable.**
- Dates are displayed consistently everywhere as e.g. `Fri 11 Sep 2026` (see *Date handling* below).
- The stored format is always `YYYY-MM-DD`.

### Your strength graph

The **Strength** chart shows one point per workout day. A day's point is the sum of **weight × reps across every set you logged that day** (total training volume, in kg). Only logged (non-rest) workouts are plotted. Current/in-progress workouts are not plotted until finished.

### Your streak

The streak is the number of **consecutive days you trained**, with these rules:

- A day you **mark as a rest day** is **neutral**: it keeps an ongoing streak alive but does not extend it.
- Only a day with **no workout and no rest mark** breaks the streak.
- A day you already trained can't be marked as rest; marking an already-marked day is rejected.
- In-progress workouts do **not** count toward the streak until finished.

Example: train Mon, Tue, mark Wed as rest, train Thu → your Thu streak shows **3** (Mon, Tue, Thu — Wednesday doesn't count against you).

Tap the button again (“Unmark today as rest”) to undo a rest day.

### Browsing & editing past workouts

The **Previous workouts** list (newest first) shows each session's date, body parts and total sets. Tap any entry to open a **read-only** detail view with every exercise and set.

From the detail view you can:

- **Edit** — the pencil icon opens the full editor (date, body parts, exercises, sets).
- **Delete** — the trash icon with a confirmation. Deletion is permanent, persists across restarts, and immediately updates the graph and streak.

Editing is a **separate flow** from the current-workout flow: Home → workout → Detail → Edit → Save changes. Editing one body part never removes the others.

---

## The Diet tab

### First-time setup (one time only)

Tap **“Add diet”**, enter daily gram targets for **Protein, Carbs, Fats and Fiber**, and save. Afterwards an **“Edit”** button replaces “Add diet” so you can change targets anytime.

### Today’s intake

Four rows — one per macro — each showing the target, a progress bar and the **percentage of the target** logged today. Tap **“+”** on a row to log grams. Intake resets automatically each day, and **“Reset today’s log”** clears today only.

### Diet history

Below today's intake, the **Diet history** section lists **previous days** (newest first, read-only) with each macro's `consumed / target` and percentage. Today is never duplicated in history; a day with no intake is not listed. If there is nothing yet you'll see *“No previous diet logs yet.”*

### Midnight rollover

If the app stays open past midnight, the “today” log automatically re-points to the new day (checked when the app returns to the foreground and on a light once-a-minute check) — yesterday's entry is preserved in history and storage.

---

## Light & dark theme

Tap the **moon/sun icon** in the Workout header to switch themes. Every screen follows the active theme, and the choice is remembered.

All icons come from **Ionicons** (`@expo/vector-icons`).

---

## Settings & data backup

Open **Settings** from the gear icon on the Workout screen. The header is a custom header (like the rest of the app) with a **Back** button that returns to the previous screen.

- **Export data** writes a JSON backup of all workouts, diet logs, custom exercises and your theme preference.
- **Import data** reads a JSON backup, **validates it deeply**, then asks for confirmation before replacing your data.

### Backup format

```jsonc
{
  "exportVersion": 1,
  "exportedAt": "2026-09-20T10:00:00.000Z",
  "data": {
    "workouts": [ /* WorkoutSession[] — id, date, restDay, createdAt, bodyParts[] */ ],
    "dietTargets": { "protein": 140, "carbs": 250, "fats": 70, "fiber": 30, "isSetup": true },
    "dietLogs": [ { "date": "2026-09-10", "protein": 80, "carbs": 100, "fats": 20, "fiber": 10 } ],
    "customExercises": { "Chest": ["Custom Fly"] },
    "themeMode": "light"
  }
}
```

> ⚠️ **Import replaces all current data and cannot be undone.** An invalid file is rejected before anything is written, and if a write fails partway the previous data is restored. The in-progress current workout is **not** part of a backup.

### Platform differences

- **Native (iOS/Android):** export shares a file via the system share sheet; import uses the system document picker. Both use Expo's FileSystem/DocumentPicker/Sharing APIs.
- **Web (development preview):** export triggers a browser download; import uses a browser file input. Native filesystem APIs are never called on web.

---

## Supported platforms

- **iOS / Android** via Expo (primary target).
- **Web** via React Native Web for development/preview. The core flows work, but web is not the primary target and a few behaviours are intentionally platform-specific (date input, file import/export) as described above.

---

## For developers

### Project structure

```
├── App.tsx                  # Root: hydration gate + ThemeContext provider + diet day rollover
├── navigation/index.tsx     # Bottom tabs (Workout | Diet) + native stack for detail screens
├── screens/                 # One file per screen (UI only)
├── components/              # Shared UI kit (ui.tsx), DatePickerField, BodyPartPickerModal,
│                            # WorkoutDraftEditor, StrengthChart, Toast
├── theme/                   # Light/dark palettes, ThemeContext, persisted theme store
├── stores/                  # Zustand stores — the only state screens talk to
│                            #   appStores.ts (workout, current draft, diet), exerciseLibraryStore.ts
├── data/                    # Framework-agnostic data layer
│   ├── models.ts            # Domain types (WorkoutSession, CurrentWorkoutDraft, DietLog, …)
│   ├── repositories.ts      # Persistence + analytics + backup validation/import
│   ├── draft.ts             # Current-workout draft helpers (commit, summarize, convert)
│   ├── dietUtils.ts         # Diet log normalization + history selection
│   ├── dateUtils.ts         # Timezone-safe date parsing/formatting
│   ├── exerciseLibrary.ts   # Preset body parts & exercises
│   └── services/
│       ├── storageService.ts# AsyncStorage wrapper
│       └── backupFile.ts    # Platform-safe backup file I/O
└── tests/                   # Vitest: logic/store tests (node) + component/screen tests (jsdom)
```

### Architecture notes

- **Layering.** Screens → Zustand stores → repositories → `storageService` → AsyncStorage. Screens never touch storage directly.
- **Current workout vs completed workout.** The in-progress draft lives under its own key (`workouts.current.v1`) and is never mixed into the completed `workouts.sessions.v1` list. Only **Finish** converts a draft into a completed `WorkoutSession` (and only after the session is safely persisted does the draft get cleared).
- **Numeric input.** While editing, weight/reps are raw strings; numbers are produced only at the commit boundary, where blank/invalid fields are dropped rather than turned into zero-value sets.
- **Date handling.** Storage is local `YYYY-MM-DD`. Display uses `formatDisplayDate` from `data/dateUtils.ts`, built from local calendar components (never `new Date('YYYY-MM-DD')`), so the day never shifts across timezones. `todayISO`/`shiftISODate` use local date math (DST-independent).
- **Backend swap-in path.** To move to a server later, reimplement the repositories against HTTP; the models and repository signatures are the contract.
- **Strength score** = Σ (weight × reps) per session, summed per day (`computeSessionStrength` / `computeStrengthSeries`).
- **Streak** = consecutive calendar days with a workout, rest marks neutral (`computeStreak`).

### Testing

Tests run with [Vitest](https://vitest.dev) and are split by environment:

- **Logic / store / repository tests** (default `node` environment):
  - `tests/analytics.test.ts` — strength score/series, date helpers, streak rules.
  - `tests/stores.test.ts` — workout & diet stores against an in-memory AsyncStorage mock.
  - `tests/stores.diet.test.ts` — diet day rollover and history access.
  - `tests/currentDraft.test.ts` — current-workout draft lifecycle, autosave, finish ordering.
  - `tests/data/dateFormat.test.ts` — timezone-safe formatting and date boundaries.
  - `tests/data/backup.test.ts` — deep backup validation and safe import/rollback.
  - `tests/theme.test.ts` — theme persistence.
- **Component / screen tests** (`jsdom`, rendering through `@testing-library/react` backed by React Native Web):
  - `tests/components/*` — the shared UI kit, `BodyPartPickerModal`, `WorkoutDraftEditor`.
  - `tests/screens/*` — Add Workout (incl. the body-part data-loss guard), Edit Workout (incl. the “editing one body part wiped the others” regression), Workout home/detail navigation, Diet (today + history + rollover), Settings (import/export with mocked file APIs).

Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock; `vitest.config.mts` aliases `react-native` → `react-native-web` and `tests/setup/vitest.setup.ts` stubs native-only modules.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request using Node 22:

```bash
npm ci
npm run typecheck
npm test
```

CI contains no native builds and does not require an Expo account (platform-specific capabilities are mocked in tests).

### Tech stack

React Native (Expo SDK 54) · TypeScript · React Navigation (bottom tabs + native stack) · Zustand · AsyncStorage · @expo/vector-icons (Ionicons) · Victory Native (Skia) for the strength chart · React Native Web for browser preview · Vitest + Testing Library for tests.

---

## Known limitations

- The current workout is not included in backup export/import.
- Component/screen tests run against React Native Web; they do not replace a pass on a real device via Expo Go, and there is no screenshot-diff or E2E (Detox/Maestro) suite.
- Web is a development/preview target; date input and file import/export behave differently from native by design.
- No automated tests cover the native-only date picker or the system share/document-picker dialogs (they are mocked).

---

## Changelog

### 1.1.0 — Current-workout autosave, diet history, stability

- **Current workout.** An in-progress workout is auto-saved to its own storage key (`workouts.current.v1`), shown as a **Current workout** card on Home, and resumable. **Back** keeps it current; **Finish** converts it into a completed session. Only one current workout can exist. Current workouts are excluded from history, strength and streak until finished.
- **Data-loss fix.** Adding another body part now commits and persists the active body part *before* opening the picker (previously it could be lost).
- **Numeric input fix.** Set weight/reps can be temporarily blank or partially typed (e.g. `17.`) without being coerced to `0`.
- **Diet history.** Previous days are listed under today's intake, newest first, with `consumed / target` and percentage. Today is never duplicated in history.
- **Diet midnight rollover.** “Today” re-points to the new day if the app stays open past midnight; older logs are preserved.
- **Consistent dates.** One shared, timezone-safe formatter (`Fri 11 Sep 2026`) is used across Add/Edit/Detail/history. Storage stays `YYYY-MM-DD`.
- **Settings.** Safe-area-aware custom header with a Back button; themed text; import/export made platform-safe.
- **Backup hardening.** Deep validation of the whole backup structure, and import now snapshots, rolls back on failure, and verifies writes.
- **Cleanup & quality.** Removed dead code and stray log artifacts, enabled unused-code checks, and added CI plus a large component/screen test suite.

### 1.0.4 — Edit from detail, cleaner history list

- **Added:** Edit button on the WorkoutDetail header (pencil) opening `EditWorkoutScreen` pre-loaded.
- **Fixed:** history rows no longer show a delete icon (delete remains on the detail view).
- **Fixed:** tapping a workout row opens the read-only WorkoutDetail (not the editor).

### 1.0.3 — Stray text-cursor bug fix

- **Fixed:** a stray text cursor appearing outside input fields. The inline log `TextInput` in `DietScreen` had `autoFocus`, which stole focus in the web preview; the prop was removed.

### 1.0.2 — Delete-flow fix & verification pass

- **Fixed:** delete did nothing on web because `react-native-web` implements `Alert.alert` as a no-op. Delete/rest confirmations now use a themed in-app dialog that works on every platform.
- **Added:** success toasts (“Workout deleted”, “Today marked as rest”, “Workout saved”).
- **Hardened:** rest-day rules enforced in the store, not just the UI.

### 1.0.1 — Bug fixes & polish

- New sets start blank; “Duplicate last set” opts into copying values forward.
- Added workout deletion with confirmation, recalculating graph and streak.
- Strength formula moved behind the ⓘ explainer; emoji replaced with Ionicons.
- Clearer rest-day flow; compact empty chart; improved light-theme contrast.
