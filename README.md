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

- Every change — date, body part, exercise, sets, weights, reps — is written to storage. Typing is debounced (~400 ms); structural changes and leaving the screen are written immediately (including the Android hardware back button, which flushes the draft first).
- Pressing **Back** keeps the workout as the **Current workout** — it is never discarded and never becomes a completed session by accident.
- The **Workout** home screen shows a highlighted **Current workout** card above *Previous workouts* whenever a draft exists, with a **Resume workout** button.
- There is **at most one** current workout. If one already exists, the home CTA becomes **“Resume current workout”** and opening it resumes the same draft instead of starting another.
- The draft survives closing and reopening the app (it is hydrated on startup).
- **Current workouts do not appear in Previous workouts, the strength graph, or the streak** until you finish them.

### Logging a workout

1. Tap **“+ Add workout”** (or **“Resume current workout”** to continue an existing one).
2. Pick a **body part** from the presets (Chest, Back, Legs, Shoulders, Biceps, Triceps, Core) **or type any custom name**. Picking one already in the session auto-expands it and shows a toast instead of duplicating it.
3. Add **exercises** — pick a preset for that body part or type any custom name. Custom names are **saved to your exercise library** (deduplicated, per body part) and reappear in the picker next time. Adding an exercise whose name already exists in the body part **adds another set to it** (with a toast) instead of creating a duplicate. You can add several before moving on.
4. Add **sets** with a weight (kg) and reps. New sets start **blank** and stay blank until you type — an empty field is never forced to `0`. A comma decimal (`1,5`) is accepted as `1.5`.
5. Tap **“Add another body part”** to add more. The body part you were working on is committed to the saved draft **before** the picker opens, so nothing can be lost; dismissing the picker rolls the commit back via a snapshot (this was a fixed bug).
6. Tap **“Finish workout”** to finalise. The whole session is saved as **one completed workout**, the current draft is cleared, and you land back on the Workout screen.

Removing a **set, exercise or body part** inside the editor always asks for confirmation first, explaining exactly what will be removed.

There is deliberately **no separate “Save” button**: auto-save preserves progress, **Back** leaves it as current, and **Finish** completes it.

### Date selection

- The workout date defaults to today and can be changed from the Add/Edit screens.
- **Future dates are not selectable**, and the earliest selectable date is **1 Jan 2020**.
- Dates are displayed consistently everywhere as e.g. `Fri 11 Sep 2026` (see *Date handling* below).
- The stored format is always `YYYY-MM-DD`.

### Your strength graph

The **Strength** chart shows one point per workout day. A day's point is the sum of **weight × reps across every set you logged that day** (total training volume, in kg). Only logged (non-rest) workouts are plotted. Current/in-progress workouts are not plotted until finished.

### Your streak

The streak is the number of **consecutive days you trained**, with these rules:

- A day you **mark as a rest day** is **neutral**: it keeps an ongoing streak alive but does not extend it.
- Only a day with **no workout and no rest mark** breaks the streak.
- **Today doesn't break the streak until the day has ended**: if you haven't trained yet today, the streak still shows yesterday's count until the day closes without a workout or rest mark.
- A day you already trained can't be marked as rest; marking an already-marked day is rejected.
- In-progress workouts do **not** count toward the streak until finished.

Example: train Mon, Tue, mark Wed as rest, train Thu → your Thu streak shows **3** (Mon, Tue, Thu — Wednesday doesn't count against you).

Tap the button again (“Unmark today as rest”) to undo a rest day.

### Browsing & editing past workouts

The **Previous workouts** list (newest first) shows each session's date, body parts, total sets and per-session volume (`· N vol`). Rest-day entries show a moon icon and “Rest day · marked as rest”. Tap any entry to open a **read-only** detail view with every exercise and set (detail header also shows total sets + volume).

From the detail view you can:

- **Edit** — the pencil icon opens the full editor (date, body parts, exercises, sets).
- **Delete** — the trash icon with a confirmation. Deletion is permanent, persists across restarts, and immediately updates the graph and streak.

Editing is a **separate flow** from the current-workout flow: Home → workout → Detail → Edit → Save changes. Editing one body part never removes the others.

Editor notes:

- **“Save changes”** asks for a confirmation showing the final exercise and set counts before writing.
- **“Duplicate last set”** is available in the **Edit** screen's active-entry area (it copies the previous set's values forward).

---

## The Diet tab

### First-time setup (one time only)

Tap **“Add diet”**, enter daily gram targets for **Protein, Carbs, Fats and Fiber**, and save. The form is **prefilled with default targets of 140 / 250 / 70 / 30 g** (protein / carbs / fats / fiber) — edit them before saving if you like. Afterwards an **“Edit”** button replaces “Add diet” so you can change targets anytime.

### Today’s intake

Four rows — one per macro — each showing the target, a progress bar and the **percentage of the target** logged today. Tap **“+”** on a row to log grams. Intake resets automatically each day, and **“Reset today’s log”** clears today only.

### Diet history

Below today's intake, the **Diet history** section lists **previous days** (newest first, read-only) with each macro's `consumed / target` and percentage. Today is never duplicated in history; a day with no intake is not listed. If there is nothing yet you'll see *“No previous diet logs yet.”*

### Midnight rollover

If the app stays open past midnight, the “today” log automatically re-points to the new day (checked when the app returns to the foreground and on a light every-30-seconds check) — yesterday's entry is preserved in history and storage.

---

## Light & dark theme

Tap the **moon/sun icon** in the Workout header to switch themes. Every screen follows the active theme (including the status bar and tab bar), and the choice is remembered across restarts.

All icons come from **Ionicons** (`@expo/vector-icons`).

---

## Feedback & accessibility

- **Toasts** confirm actions across the app (e.g. “Workout saved”, “Workout updated”, “Workout deleted”, “Today marked as rest”, “Rest day unmarked”, duplicate exercise/body-part notices, “Backup downloaded”, “Backup imported successfully.”, and error messages). They appear above the tab bar and work on every platform (unlike native `Alert`). A native export does **not** toast — the share sheet is the confirmation.
- **Confirmations** use a themed in-app dialog (not `Alert.alert`, which is a no-op on web) for delete, rest-day, import, save-changes and editor removals.
- **Hydration gate** — on launch the app shows a spinner until the theme, workouts, diet, exercise library and current draft are all loaded from storage, so you never see a flash of empty UI.
- **Touch targets** are at least **44 px**, and interactive elements carry `accessibilityRole` / `accessibilityLabel` throughout.

---

## Settings & data backup

Open **Settings** from the gear icon on the Workout screen. The header is a custom header (like the rest of the app) with a **Back** button that returns to the previous screen. The data section itself is deliberately just two rows — the operating system does the rest:

```text
DATA & BACKUP
┌──────────────────────────────────────────────┐
│ Export Data                               →  │
│ Save your workout and diet data as a        │
│ backup file                                 │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Import Data                               →  │
│ Restore your data from a backup file         │
└──────────────────────────────────────────────┘
```

- **Export Data** writes a JSON backup of all workouts, diet logs, custom exercises and your theme preference, named `gym-tracker-backup-YYYY-MM-DD.json` with the **local** date (a UTC date would be a day off after midnight).
  - While the file is generated the row shows a spinner + **“Exporting backup…”**.
  - The spinner disappears the moment the **system share sheet** opens (the row returns to its normal text, then to normal — enabled — once the flow ends). The app never picks a destination: Drive, Files, Downloads, WhatsApp, mail, … are all offered by the OS.
  - Closing or cancelling the share sheet is **not** an error — nothing is reported. Only a real generation/sharing failure shows “Couldn't export your backup. Please try again.”, and success is never claimed otherwise.
- **Import Data** opens the **system file picker** (no MIME filter — providers often report `.json` backups as some other type), reads and **deeply validates** the file, and only then shows the confirmation. The app never picks a source (Google Drive etc. come from the OS picker) and never opens the share sheet for import.
  - An unparsable or structurally invalid file never opens the confirmation: it reports **“Invalid Gym Tracker backup file.”** (the specific reason goes to the console) and leaves existing data untouched.
  - A valid file opens this confirmation, and **nothing is written until Import is pressed**:

```text
Import Backup?

Workouts                     18
Diet logs                    12
Custom exercises             24

Your current app data will be replaced by this backup.

                [ Cancel ]   [ Import ]
```

**Cancel** closes the dialog, keeps every key in storage untouched and shows no message. **Import** performs the validated replace, re-hydrates all stores and toasts **“Backup imported successfully.”** — a failure reports the real reason (data is rolled back) and never claims success.

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

## Building & releasing (EAS)

Day-to-day development runs in [Expo Go](https://expo.dev/go); installable/store builds go through [EAS Build](https://docs.expo.dev/build/introduction/).

```bash
npm i -g eas-cli
eas login                                     # once per machine

eas build --platform android --profile preview     # internal-test APK you can sideload
eas build --platform android --profile production  # Play Store build
eas build --platform ios --profile production      # App Store build
eas submit --platform android --profile production # upload the latest build to the store
```

The build profiles live in `eas.json` (committed to the repo):

| Profile | What it produces |
| --- | --- |
| `development` | Dev-client build (`developmentClient: true`) with internal distribution, for running the app against your own dev server. |
| `preview` | Internal-distribution build (APK / ad-hoc IPA) installable without an app store. |
| `production` | Store build. `autoIncrement: true` bumps the version on every build, and `appVersionSource: "remote"` keeps the build-number bookkeeping on EAS rather than in `app.json`. |

`app.json` holds the Expo config (app name, version `1.1.0`, Android package `com.karthik1006.gymtracker`, plugins) and the EAS project id under `expo.extra.eas.projectId`. The required EAS CLI version is pinned by `cli.version` in `eas.json`.

Keystores, credentials, `google-services.json` / `GoogleService-Info.plist`, generated `android/` and `ios/` projects and build artifacts are all ignored by `.gitignore` — nothing secret or machine-generated is committed.

CI intentionally runs **no** native builds (see *Continuous integration*).

---

## For developers

### Project structure

```
├── App.tsx                  # Root: hydration gate + ThemeContext provider + diet day rollover
├── app.json                 # Expo config: name, version, Android package, plugins, EAS project id
├── eas.json                 # EAS Build profiles (development / preview / production)
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
  - `tests/screens/*` — Add Workout (incl. the body-part data-loss guard), Edit Workout (incl. the “editing one body part wiped the others” regression), Workout home/detail navigation, Diet (today + history + rollover), Settings (the whole backup flow with mocked file/share APIs: export loading state → share-sheet handoff → no error on cancel → real failure reported; import picker → invalid file rejected → summary shown → cancel keeps data → confirm imports/hydrates → failed write reports no success).

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

React Native (Expo SDK 57) · TypeScript · React Navigation (bottom tabs + native stack) · Zustand · AsyncStorage · @expo/vector-icons (Ionicons) · Victory Native (Skia) for the strength chart · React Native Web for browser preview · Vitest + Testing Library for tests.

---

## Known limitations

- The current workout is not included in backup export/import.
- Component/screen tests run against React Native Web; they do not replace a pass on a real device via Expo Go, and there is no screenshot-diff or E2E (Detox/Maestro) suite.
- Web is a development/preview target; date input and file import/export behave differently from native by design.
- No automated tests cover the native-only date picker or the system share/document-picker dialogs (they are mocked).

---

## Changelog

### Unreleased — Export / Import UX refinement, EAS build setup

- **Builds.** Added `eas.json` with **development / preview / production** profiles (CLI `>= 24.8.0`, remote version source, auto-incrementing production builds) and registered the EAS project id in `app.json` (`expo.extra.eas.projectId`); the README documents the build/submit flow, and `.gitignore` now also excludes generated `android/`/`ios/` projects, release artifacts (`.apk`/`.aab`/`.ipa`), EAS caches (`.eas/`) and native signing credentials.
- **Custom exercise library.** Body part names that collide with `Object` properties (`constructor`, `toString`, `__proto__`, `hasOwnProperty`) no longer crash the picker or the "save as custom exercise" path — all lookups now read own properties only, and a failed library write is logged instead of surfacing as an unhandled rejection.
- **Backup filename.** Exports are named after the **local** date (`gym-tracker-backup-2026-10-02.json`), not the UTC date carried inside the payload — previously a 02:00 export in a UTC+ timezone produced yesterday's filename.
- **Diet logging.** Two quick taps on **Add** log once (the input closes before the write), overlapping `addToLog` calls accumulate instead of overwriting each other, and gram totals are rounded to one decimal — `10.1 + 20.2` shows `30.3g`, never `30.299999999999997g`. The macro row label also reads `140g` instead of `140G`.
- **Numeric input.** Weight/reps and diet fields strip minus signs, letters and extra decimal separators while typing (`1,5` still reads as `1.5`), negative/non-finite numbers are rejected at parse time, and reps are floored to whole numbers when a set is committed — so the app can no longer store data its own backup validator refuses.
- **Streak.** A morning with nothing logged yet no longer resets the streak: today is treated as still open, so the count from the previous days stays visible until the day ends without a workout or rest mark.
- **Editor removals.** The active exercise entry in Add/Edit now asks for confirmation before deleting an exercise or a set (the committed draft list already did), so a stray tap on **Remove**/**✕** can no longer lose data.
- **Import picker.** The system picker no longer filters on `application/json` — providers often label `.json` backups with a different MIME type, which hid the file from the list. Any file can be chosen and is still deep-validated after picking; an invalid one reports “Invalid Gym Tracker backup file.”.
- **Chart.** The strength chart area now fills down to the plot's baseline instead of y = 0, so a narrow strength range no longer renders a mostly-empty plot.
- **Home streak after midnight.** Home re-reads the date every 30 seconds (and when the app returns to the foreground), so a screen kept open past midnight no longer shows yesterday's streak.
- **Startup.** Corrupt stored data (workouts/logs saved as a non-array, targets/custom exercises as a non-object) falls back to defaults instead of throwing, and a failed hydrate is caught and logged — the app can no longer hang on the loading screen.
- **Date input (web).** The date field enforces the same limits as native: future dates and dates before 2020-01-01 are rejected rather than silently accepted.
- **Toasts.** Duplicate-exercise editor toasts are raised before the state update instead of inside its updater, so React StrictMode's double-invoke no longer shows them twice.
- **Export.** The row now shows “Exporting backup…” only while the file is generated; the loading state ends the moment the OS takes the file (share sheet open / download started) and the row returns to normal when the flow ends. Cancelling or closing the share sheet is no longer reported as anything — an error is shown only when generation or sharing actually fails.
- **Import.** The confirmation now shows what the backup contains (workouts, diet logs, custom exercises as label/value rows) plus the replacement warning; invalid files are uniformly reported as “Invalid Gym Tracker backup file.” without opening the dialog. Cancel writes nothing, confirm imports and hydrates, and success is reported only after the validated import lands.
- **Settings UI.** Data section is two simple cards (Export Data / Import Data) with descriptions and a chevron, using the existing theme; the OS still handles destination/source selection (share sheet, file picker).
- **Tests.** Settings screen tests expanded from 6 to 13 (loading states, share-sheet handoff, cancelled share, validation, summary, cancel/confirm, failed import).

### 1.1.1 — Documentation of new features & clarifications

- **Documented** previously implemented but undocumented behaviour: custom exercise library persistence, duplicate exercise/body-part handling, body-part picker snapshot rollback, default diet targets (140/250/70/30 g), edit-save confirmation counts, editor-level delete confirmations, export filename format, date-picker minimum (2020-01-01), comma decimal input, per-session volume on history rows, hydration loading gate, Android hardware-back draft flush, toast inventory, and accessibility (44 px targets, accessibility roles/labels).
- **Fixed** diet midnight rollover wording: the background check runs every **30 seconds** (previously documented as once-a-minute).
- **Clarified** that **“Duplicate last set”** is available in the **Edit** workout flow.
- **Version** fields in `package.json` and `app.json` bumped to **1.1.0** to match the released feature set.

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

- New sets start blank; “Duplicate last set” (Edit screen) opts into copying values forward.
- Added workout deletion with confirmation, recalculating graph and streak.
- Strength formula moved behind the ⓘ explainer; emoji replaced with Ionicons.
- Clearer rest-day flow; compact empty chart; improved light-theme contrast.
