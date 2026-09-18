# Gym Tracker

A simple, offline-first mobile gym tracker built with React Native (Expo).

Gym Tracker has **two tabs** at the bottom of every screen:

- **Workout** — log your training sessions, watch your strength grow on a graph, keep a day streak alive, and browse every past workout.
- **Diet** — set daily targets for protein, carbs, fats and fiber, then log what you eat and see progress bars fill up.

Everything is stored on your phone. No account, no internet connection and no backend are needed.

---

## Getting started (running the app)

You need [Node.js](https://nodejs.org) and the **Expo Go** app on your phone (App Store / Play Store), or an Android/iOS emulator.

```bash
npm install     # install dependencies
npx expo start  # start the dev server
```

To run in a **browser** (handy when no phone/emulator is around):

```bash
npx expo start --web   # or press `w` in a running dev server
```

Then open the printed URL (default `http://localhost:8081`).

Then:

- Scan the QR code shown in the terminal with the **Expo Go** app (Android) or the Camera app (iPhone), or
- Press `a` to open an Android emulator, or `i` for the iOS simulator.

Useful checks during development:

```bash
npm run typecheck   # TypeScript checks (tsc --noEmit)
npm test            # run the unit test suite (vitest)
```

---

## The Workout tab

### Logging a workout

1. Tap **“+ Add workout”**.
2. **Step 1 – Body part**: pick one of the presets (Chest, Back, Legs, Shoulders, Arms, Core) or type your own.
3. **Step 2 – Exercises**: pick a preset exercise for that body part (e.g. Bench Press under Chest) **or type any custom name** — you are never limited to the list.
4. For each exercise, add **sets**: enter a weight (kg) and reps per set. Every new set starts **blank**; use **“Duplicate last set”** if you want to copy the previous set's values forward, and the ✕ (trash) icon to remove one. You can add several exercises under the same body part before moving on.
5. Tap **“Add another body part”** to start the next body part. Everything you already entered stays safely in the session summary at the top — nothing is lost.
6. Tap **“Finish & save workout”**. The whole session (all body parts, exercises and sets) is saved as **one workout entry**, stamped with today's date, and you land back on the Workout screen where the graph, streak and history update immediately.

### Your strength graph

The **Strength** chart shows one point per workout day. A day's point is the sum of **weight × reps across every set you logged that day** (your total training volume, in kg). Miss a few days? The chart simply connects the days you trained — only logged workouts are plotted. The same explanation is available in-app behind the ⓘ icon next to the **Strength** heading.

> Why total volume? It is simple, works for any exercise (including bodyweight or light high-rep work), and rewards both heavier weights and more work. An alternative like "average estimated 1RM" was considered but volume is easier to reason about day-to-day.

### Your streak

The streak is the number of **consecutive days you trained**. Special rule for rest:

- A day you **mark as a rest day** (the “Mark today as rest day” button on the Workout screen, confirmed via a dialog) is **neutral**: it neither extends nor breaks your streak.
- Only a day with **no workout and no rest mark** breaks the streak.
- Rest days do not appear on the strength graph.
- A day you already trained can't be marked as rest — the app tells you so instead of silently marking it. Marking an already-marked day is rejected ("Today is already marked as a rest day"), enforced both in the UI and in the store.
- Confirmations and notices use an **in-app dialog/toast** (not the system Alert), so they behave identically on iOS, Android and web — react-native-web's `Alert` is a no-op.

Example: train Mon, Tue, mark Wed as rest, train Thu → your Thu streak shows **3** (Mon, Tue, Thu — Wednesday doesn't count against you).

Tap the button again (“Unmark rest”) if you marked a rest day by mistake.

### Browsing & editing past workouts

The **Previous workouts** list (most recent first) shows each session's date, the body parts trained and the total number of sets. Tap any entry to open a **read-only** detail view with every exercise and set.

From the detail view you can:

- **Edit** — tap the **pencil icon** in the header to open the full editor (change date, add/remove body parts, exercises, sets, or reorder).
- **Delete** — tap the **trash icon** in the header and confirm — deleting a workout or rest-day marker updates the strength graph and recomputes the streak immediately. Deletion is permanent and persists across app restarts. A brief **“Workout deleted”** toast confirms each deletion.

---

## The Diet tab

### First-time setup (one time only)

The first time you open the Diet tab you'll see an **“Add diet”** button. Tap it, enter your daily gram targets for **Protein, Carbs, Fats and Fiber**, and save. That's it — the “Add diet” button disappears for good.

### After setup

- Four rows appear — one per macro — each showing your **gram target** (e.g. `150G`), a **progress bar** and the **percentage of the target** you've logged so far today.
- The **“Add diet”** option is replaced by an **“Edit”** button at the top of the screen. Tap it any time to change your target grams.
- Tap the **“+”** on any macro row to log grams you ate (e.g. 30 g of protein). The bar and percentage update instantly and the intake resets automatically each day.

---

## Light & dark theme

Tap the **moon/sun icon** (Ionicons) in the top-right of the Workout screen to switch between light and dark mode. Every screen, list and chart follows the active theme, and your choice is **remembered** for the next time you open the app.

### Icons

All icons come from **Ionicons** (`@expo/vector-icons`): barbell/nutrition tab icons, flame for the streak, moon/sun for the theme toggle and rest-day markers, trash for delete, and an info circle for the strength-score explainer. No emoji are used in the UI.

---

## For developers

### Project structure

```
├── App.tsx                  # Root: hydration gate + ThemeContext provider
├── index.ts                 # Expo entry point
├── navigation/
│   └── index.tsx            # Bottom tabs (Workout | Diet) + native stack for detail screens
├── screens/                 # One file per screen (UI only)
├── components/              # Shared UI kit (ui.tsx) + StrengthChart
├── theme/                   # Light/dark palettes, ThemeContext, persisted theme store
├── stores/                  # Zustand stores — the only state screens talk to
└── data/                    # Framework-agnostic data layer
    ├── models.ts            # Domain types (WorkoutSession, DietTargets, DietLog)
    ├── repositories.ts      # CRUD + analytics (strength score, streak logic)
    ├── exerciseLibrary.ts   # Preset body parts & exercises
    └── services/
        └── storageService.ts# AsyncStorage wrapper
```

### Tests

Unit tests live in `tests/` and run with [Vitest](https://vitest.dev) (`npm test`). They cover the logic that is pure or store-level, not RN UI:

- `tests/analytics.test.ts` — strength score, strength series, ISO date helpers and the streak rules (including the rest-day continuation: marking a day as rest keeps an ongoing streak alive).
- `tests/stores.test.ts` — workout & diet Zustand stores against an in-memory AsyncStorage mock: persistence, hydration, rest-day toggle, log accumulation/reset.
- `tests/theme.test.ts` — theme toggle persistence.

The streak rule pinned by the tests: a **marked rest day is neutral** — it neither extends nor breaks a streak, so opening the app and marking a rest day keeps an ongoing streak alive. A day with neither a workout nor a rest mark breaks it.

### Architecture notes

- **Screens never touch storage.** They read from and write to two Zustand stores (`useWorkoutStore`, `useDietStore`). The stores delegate persistence to **repositories** in `data/repositories.ts`, which in turn use the `storageService` AsyncStorage wrapper.
- **Backend swap-in path.** To move to Node/Express + MongoDB later, reimplement `workoutRepository` and `dietRepository` (and `storageService`, if you keep it) against HTTP calls. The repository method signatures and the domain models in `data/models.ts` are the contract — no screen, component or store shape needs to change beyond that seam.
- **Strength score** = Σ (weight × reps) over all sets in a session; the graph plots one point per day (multiple sessions on one day are summed). See `computeSessionStrength` / `computeStrengthSeries` in `data/repositories.ts`.
- **Streak** = consecutive calendar days with a workout, where marked rest days are skipped neutrally. See `computeStreak` in `data/repositories.ts`.
- **Theme** = light/dark palettes in `theme/theme.ts`, provided via `ThemeContext`, toggled from the Workout header and persisted through the same storage service.
- All touch targets respect the **44 px minimum**; spacing and font sizes come from the shared `Theme` so screens stay consistent.

### Tech stack

React Native (Expo SDK 54) · TypeScript · React Navigation (bottom tabs + native stack) · Zustand · AsyncStorage · @expo/vector-icons (Ionicons) · Victory Native (Skia) for the strength chart · React Native Web for browser preview (Skia provides a web canvas backend, so the chart works there too).

---

## Changelog

### 1.0.4 — Edit from detail, cleaner history list

- **Added: Edit button on WorkoutDetail header.** Pencil icon next to the trash icon opens the full `EditWorkoutScreen` with the session pre-loaded. One tap from the read-only view to full editing.
- **Fixed: history list rows no longer show a delete icon.** The trash icon was removed from each row to prevent accidental deletions while scrolling. Delete remains available (and intentional) from the detail view's header via the themed ConfirmDialog.
- **Fixed: tapping a workout row now opens WorkoutDetail (read-only).** Previously it incorrectly opened the EditWorkout screen (a regression introduced in the prior refactor). Now the flow is: Home → tap row → WorkoutDetail → (pencil) → EditWorkout → Save → back to Home.

### 1.0.3 — Stray text-cursor bug fix

### 1.0.2 — Delete-flow fix & verification pass

- **Fixed: delete button did nothing on web.** Root cause: `react-native-web` implements `Alert.alert` as a no-op, so the confirmation dialog never appeared and its `Delete` callback (which performed the deletion) never ran. Delete and rest-day confirmations now use a themed in-app **ConfirmDialog** that works on every platform; confirming calls the store's `deleteSession`, which removes the record from **AsyncStorage** (verified by a reload test) and refreshes the list, strength graph and streak immediately.
- **Added: success feedback.** Toasts now confirm “Workout deleted”, “Today marked as rest”, “Rest day unmarked”, and “Workout saved”.
- **Hardened: rest-day rules.** The store itself now rejects marking an already-marked day or a day with a logged workout (covered by unit tests); the UI shows the corresponding messages.
- **Verified: end-to-end flows.** Blank new sets with opt-in “Duplicate last set”; multiple exercises per body part and multiple body parts saved as one entry; real workouts appear in Previous Workouts, plot on the strength graph and count toward the streak. 41 unit tests pass; `tsc --noEmit` clean.
- **Verified: mobile layout.** The bottom tab bar applies the safe-area bottom inset (`@react-navigation/bottom-tabs` v7 adds `insets.bottom` to the tab bar itself); delete zones, the diet “+” and all buttons meet the 44 px minimum touch-target rule at a 390 × 844 phone viewport.

### 1.0.1 — Bug fixes & polish

- **Fixed: “Add set” no longer silently copies the previous set's weight/reps.** New sets start blank; an explicit **“Duplicate last set”** button opts into carrying values forward.
- **Added: delete workouts.** Trash action on every entry in *Previous workouts* and in the workout detail view, with a confirmation prompt (“Delete workout? This can't be undone.”). Deleting recalculates the strength graph and recomputes the streak from scratch — removed days no longer count toward either.
- **Polish: strength formula hidden.** The scoring formula was removed from the chart's empty state; the ⓘ icon next to the *Strength* heading opens an explainer instead.
- **Polish: proper icon set.** All emoji (🔥 streak, 🥗/🏋️ tabs, ☀️/🌙 theme toggle, ✕/＋ glyphs) were replaced with Ionicons for a consistent look.
- **Polish: clearer rest days.** The button is now “Mark today as rest day” and asks for confirmation; marking a day that already has a workout is blocked with a “You already logged a workout today” message, and double-marking is prevented.
- **Polish: compact empty chart.** The empty strength-graph state is only as tall as its message instead of reserving full graph height.
- **Fixed: light-theme contrast.** Secondary text darkened (`#6b7280` → `#4b5563`) and destructive red deepened (`#dc2626` → `#b91c1c`) so both clear WCAG AA against light backgrounds.

### Known issues

- Delete/confirm flows are covered by store-level unit tests and code-level verification; an automated end-to-end UI test (e.g. Detox/Maestro) does not exist yet.
- Light/dark rendering was verified manually on the Workout, Add Workout, Diet and Edit-diet-targets screens; a automated screenshot-diff check for both themes does not exist yet.
- The mobile-layout check was done by code inspection against a 390 × 844 viewport (safe-area handling and touch-target sizes); a pass on a physical device via Expo Go is still recommended.

### 1.0.3 — Stray text-cursor bug fix

- **Fixed: stray text cursor appearing outside input fields.** Root cause: the inline log `TextInput` in `DietScreen.tsx` had `autoFocus` prop, which caused the input to receive focus in React Native Web's browser preview, making a cursor appear when tapping near text on any screen. The `autoFocus` prop has been removed. Only genuine input fields (weight/reps entry, body-part custom text, diet target numbers) now show a cursor.
