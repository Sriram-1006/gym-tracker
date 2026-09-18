import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '../theme/ThemeContext';
import { useWorkoutStore, BodyPartInput } from '../stores/appStores';
import { todayISO } from '../data/repositories';
import { Button, Card, SectionTitle, ConfirmDialog } from '../components/ui';
import { WorkoutDraftEditor } from '../components/workoutDraftEditor';
import { showToast } from '../components/Toast';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { Ionicons } from '@expo/vector-icons';

/** Parse ISO date string (YYYY-MM-DD) as local date, not UTC. */
function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

type DraftSet = { weight: string; reps: string };

/**
 * Add Workout screen.
 *
 * Flow (spec): pick a body part → add one or more exercises under it →
 * for each exercise add one or more sets (weight + reps) → optionally repeat
 * for another body part → Save commits the whole session at once.
 *
 * Draft state is kept locally in this screen; nothing touches the store until
 * "Finish & save workout" is pressed, so backing out never corrupts data.
 */
export function AddWorkoutScreen({ navigation }: any) {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;
  const insets = useSafeAreaInsets();
  const addSession = useWorkoutStore((s) => s.addSession);

  const [draft, setDraft] = useState<BodyPartInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  // Custom exercises from library store
  const customExercises = useExerciseLibraryStore((s) => s.custom);
  const addCustomExercise = useExerciseLibraryStore((s) => s.addCustomExercise);

  // Which draft body parts are expanded for editing
  const [expandedDraftParts, setExpandedDraftParts] = useState<Set<string>>(new Set());

  // Current in-progress body part
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [customPart, setCustomPart] = useState('');
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  // Confirmation dialogs for deletions
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'set' | 'exercise' | 'bodyPart';
    bodyPartName?: string;
    exerciseIndex?: number;
    setIndex?: number;
    onConfirm: () => void;
  } | null>(null);

  // Current in-progress exercise
  const [exercises, setExercises] = useState<{ name: string; sets: DraftSet[] }[]>([]);
  const [exName, setExName] = useState('');
  const [exPickerOpen, setExPickerOpen] = useState(false);
  const [exPickerForBodyPart, setExPickerForBodyPart] = useState<string | null>(null);

  // Workout date — defaults to current date if not explicitly changed
  const [date, setDate] = useState<string>(() => todayISO());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const presetSetsFor = useMemo(
    () => (part: string) => EXERCISE_LIBRARY[part] ?? [],
    [],
  );

  const allExercisesFor = useMemo(
    () => (part: string) => [...(EXERCISE_LIBRARY[part] ?? []), ...(customExercises[part] ?? [])],
    [customExercises],
  );

  /** Open exercise picker for a specific body part (from expanded card or active entry). */
  const openExercisePicker = (forBodyPart?: string) => {
    if (forBodyPart) {
      setExPickerForBodyPart(forBodyPart);
    }
    setExPickerOpen(true);
  };

  /** Add exercise directly to a draft body part (from expanded card). */
  const addExerciseToDraftBodyPart = (bpName: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDraft((d) =>
      d.map((bp) => {
        if (bp.bodyPart !== bpName) return bp;
        return { ...bp, exercises: [...bp.exercises, { name: trimmed, sets: [{ weight: 0, reps: 0 }] }] };
      }),
    );
    // If this is a custom exercise, save it to the library
    if (!EXERCISE_LIBRARY[bpName]?.includes(trimmed)) {
      addCustomExercise(bpName, trimmed);
    }
  };

  const resetExerciseForm = () => {
    setExName('');
    setExercises([]);
    setExPickerForBodyPart(null);
  };

  const startNewBodyPart = () => {
    setBodyPart(null);
    setCustomPart('');
    resetExerciseForm();
    setPartPickerOpen(true);
  };

  /** Toggle expansion of a draft body part in the summary list. */
  const toggleDraftPartExpansion = (bodyPartName: string) => {
    setExpandedDraftParts((prev) => {
      const next = new Set(prev);
      if (next.has(bodyPartName)) {
        next.delete(bodyPartName);
      } else {
        // Accordion behavior: close others, open this one
        next.clear();
        next.add(bodyPartName);
      }
      return next;
    });
  };

  /** Check if a draft body part is expanded. */
  const isDraftPartExpanded = (bodyPartName: string) => expandedDraftParts.has(bodyPartName);

  /* ----------------------------- deletion ops ---------------------------- */

  const confirmRemoveSet = (bpName: string, exIdx: number, setIdx: number) => {
    setConfirmDelete({
      type: 'set',
      bodyPartName: bpName,
      exerciseIndex: exIdx,
      setIndex: setIdx,
      onConfirm: () => {
        // Find the body part in draft and remove the set
        setDraft((d) =>
          d.map((bp) => {
            if (bp.bodyPart !== bpName) return bp;
            return {
              ...bp,
              exercises: bp.exercises.map((ex, i) => {
                if (i !== exIdx) return ex;
                return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) };
              }),
            };
          }),
        );
      },
    });
  };

  const confirmRemoveExercise = (bpName: string, exIdx: number) => {
    setConfirmDelete({
      type: 'exercise',
      bodyPartName: bpName,
      exerciseIndex: exIdx,
      onConfirm: () => {
        setDraft((d) =>
          d.map((bp) => {
            if (bp.bodyPart !== bpName) return bp;
            return { ...bp, exercises: bp.exercises.filter((_, i) => i !== exIdx) };
          }),
        );
      },
    });
  };

  const confirmRemoveBodyPart = (bpName: string) => {
    setConfirmDelete({
      type: 'bodyPart',
      bodyPartName: bpName,
      onConfirm: () => {
        setDraft((d) => d.filter((bp) => bp.bodyPart !== bpName));
        setExpandedDraftParts((prev) => {
          const next = new Set(prev);
          next.delete(bpName);
          return next;
        });
      },
    });
  };

  /** Validates and moves the in-progress body part into the draft.
   *  Returns the committed entry (or null) so callers don't read stale state. */
  const commitBodyPart = (): BodyPartInput | null => {
    const part = bodyPart;
    if (!part) {
      setError('Choose a body part first.');
      return null;
    }
    if (exercises.length === 0) {
      setError('Add at least one exercise for this body part.');
      return null;
    }
    const cleaned = exercises
      .map((e) => ({
        name: e.name.trim(),
        sets: e.sets
          .map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }))
          .filter((s) => s.weight > 0 || s.reps > 0),
      }))
      .filter((e) => e.name && e.sets.length > 0);
    if (cleaned.length === 0) {
      setError('Each exercise needs at least one set with weight or reps.');
      return null;
    }
    const entry: BodyPartInput = { bodyPart: part, exercises: cleaned };
    setDraft((d) => {
      const idx = d.findIndex((bp) => bp.bodyPart === part);
      if (idx >= 0) {
        // Merge exercises with existing body part instead of replacing
        const existing = d[idx];
        const mergedExercises = [...existing.exercises, ...cleaned];
        const mergedEntry: BodyPartInput = { bodyPart: part, exercises: mergedExercises };
        return [...d.slice(0, idx), mergedEntry, ...d.slice(idx + 1)];
      }
      return [...d, entry];
    });

    // If this body part was already in draft, show a toast
    const wasExisting = draft.some((bp) => bp.bodyPart === part);
    if (wasExisting) {
      showToast(`${part} already in workout — exercises added`);
    }
    setError(null);
    startNewBodyPart();
    return entry;
  };

  /* ----------------------------- exercise ops ---------------------------- */

  const addExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setExercises((xs) => [...xs, { name: trimmed, sets: [{ weight: '', reps: '' }] }]);
    setExName('');
    // If this is a custom exercise (not in presets), save it to the library
    if (bodyPart && !EXERCISE_LIBRARY[bodyPart]?.includes(trimmed)) {
      addCustomExercise(bodyPart, trimmed);
    }
  };

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<DraftSet>) => {
    setExercises((xs) =>
      xs.map((x, i) =>
        i === exIdx
          ? { ...x, sets: x.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) }
          : x,
      ),
    );
  };

  /**
   * New sets always start blank — carrying the previous set's values forward
   * happens only when the user explicitly taps "Duplicate last set".
   */
  const addSet = (exIdx: number) => {
    setExercises((xs) =>
      xs.map((x, i) =>
        i === exIdx ? { ...x, sets: [...x.sets, { weight: '', reps: '' }] } : x),
    );
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((xs) =>
      xs.map((x, i) =>
        i === exIdx ? { ...x, sets: x.sets.filter((_, j) => j !== setIdx) } : x),
    );
  };

  const removeExercise = (exIdx: number) => {
    setExercises((xs) => xs.filter((_, i) => i !== exIdx));
  };

  /* ------------------------------- rendering ----------------------------- */

  // Handler functions for the shared WorkoutDraftEditor component
  const handleRemoveBodyPart = (bodyPartName: string) => {
    confirmRemoveBodyPart(bodyPartName);
  };

  const handleRemoveExercise = (bodyPartName: string, exerciseIndex: number) => {
    confirmRemoveExercise(bodyPartName, exerciseIndex);
  };

  const handleRemoveSet = (bodyPartName: string, exerciseIndex: number, setIndex: number) => {
    confirmRemoveSet(bodyPartName, exerciseIndex, setIndex);
  };

  const handleAddSet = (bodyPartName: string, exerciseIndex: number) => {
    setDraft((d) =>
      d.map((bp) => {
        if (bp.bodyPart !== bodyPartName) return bp;
        return {
          ...bp,
          exercises: bp.exercises.map((ex, i) => {
            if (i !== exerciseIndex) return ex;
            return { ...ex, sets: [...ex.sets, { weight: 0, reps: 0 }] };
          }),
        };
      }),
    );
  };

  const handleUpdateSet = (bodyPartName: string, exerciseIndex: number, setIndex: number, patch: { weight?: number; reps?: number }) => {
    setDraft((d) =>
      d.map((bp) => {
        if (bp.bodyPart !== bodyPartName) return bp;
        return {
          ...bp,
          exercises: bp.exercises.map((ex, i) => {
            if (i !== exerciseIndex) return ex;
            return {
              ...ex,
              sets: ex.sets.map((set, k) =>
                k === setIndex ? { ...set, ...patch } : set
              ),
            };
          }),
        };
      }),
    );
  };

  const handleAddExercise = (bodyPartName: string, exerciseName: string) => {
    addExerciseToDraftBodyPart(bodyPartName, exerciseName);
  };

  /** Render the active exercise entry area (for the current body part being added). */
  const renderActiveExerciseEntry = () => {
    if (!bodyPart) return null;
    return (
      <Card>
        <SectionTitle>Exercise entry</SectionTitle>

        {exercises.map((ex, i) => (
          <View
            key={`${ex.name}-${i}`}
            style={{
              marginTop: spacing.m,
              paddingTop: spacing.s,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                {ex.name}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => removeExercise(i)} hitSlop={8}>
                <Text style={{ color: colors.destructive, fontSize: fontSize.caption }}>Remove</Text>
              </Pressable>
            </View>

            {ex.sets.map((s, j) => (
              <View
                key={j}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.s }}
              >
                <Text style={{ color: colors.textMuted, width: 34, fontSize: fontSize.caption }}>
                  Set {j + 1}
                </Text>
                <TextInput
                  value={s.weight}
                  onChangeText={(t) => updateSet(i, j, { weight: t })}
                  keyboardType="decimal-pad"
                  placeholder="kg"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.setInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius }]}
                />
                <TextInput
                  value={s.reps}
                  onChangeText={(t) => updateSet(i, j, { reps: t })}
                  keyboardType="number-pad"
                  placeholder="reps"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.setInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove set ${j + 1}`}
                  onPress={() => removeSet(i, j)}
                  hitSlop={8}
                  style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={20} color={colors.destructive} />
                </Pressable>
              </View>
            ))}

            <View style={{ flexDirection: 'row', gap: spacing.s, marginTop: spacing.s }}>
              <Button
                label="Add set"
                variant="ghost"
                size="sm"
                onPress={() => addSet(i)}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          </View>
        ))}

        {exercises.length === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, textAlign: 'center', padding: spacing.m }}>
            Add an exercise to get started
          </Text>
        )}

        {/* Add exercise control at the bottom */}
        <View style={{ marginTop: spacing.m, paddingTop: spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openExercisePicker()}
            style={{
              minHeight: touchTarget,
              borderRadius: radius,
              backgroundColor: colors.surfaceAlt,
              justifyContent: 'center',
              paddingHorizontal: spacing.m,
            }}
          >
            <Text style={{ color: exName ? colors.text : colors.textMuted, fontSize: fontSize.body }}>
              {exName || 'Add exercise (pick or type free text)…'}
            </Text>
          </Pressable>
          <Button
            label="Add exercise"
            variant="secondary"
            onPress={() => addExercise(exName)}
            style={{ marginTop: spacing.s }}
          />
        </View>
      </Card>
    );
  };

  /* Date selection handlers */

  const showDatePicker = () => {
    setDatePickerVisible(true);
  };

  const onDateConfirm = (selectedDate: string) => {
    setDate(selectedDate);
    setDatePickerVisible(false);
  };

  const onDateChange = (_event: any, selectedDate?: Date) => {
    if (selectedDate) {
      setDate(todayISO(selectedDate));
    }
    setDatePickerVisible(false);
  };

  const renderDatePicker = () => {
    if (!datePickerVisible) return null;
    return (
      <DateTimePicker
        value={parseISODateLocal(date)}
        mode="date"
        is24Hour={true}
        display="default"
        onChange={onDateChange}
        minimumDate={new Date(2020, 0, 1)}
        maximumDate={new Date()}
      />
    );
  };

  /** Whether we're in "Screen 1" (initial selection) vs "Screen 2+" (exercise entry) */
  const isInitialScreen = exercises.length === 0 && draft.length === 0;

  /** Whether Step 2 (exercises) should be visible — only after a body part is selected. */
  const showStep2 = bodyPart !== null;

  /** Whether footer actions should be visible — when there's something to act on. */
  const showFooter = draft.length > 0 || (bodyPart !== null && exercises.length > 0 && exercises.some((e) => e.sets.some((s) => Number(s.weight) > 0 || Number(s.reps) > 0)));

  /** Save the current session (create or update) and stay on screen. */
  const handleSave = async () => {
    const pending = bodyPart && exercises.length > 0 ? commitBodyPart() : null;
    if (pending === null && bodyPart && exercises.length > 0) return; // validation error
    const finalDraft = pending ? [...draft, pending] : draft;
    if (finalDraft.length === 0) {
      setError('Nothing to save yet — add at least one exercise.');
      return;
    }
    setSaving(true);
    try {
      if (savedSessionId) {
        await useWorkoutStore.getState().updateSession(savedSessionId, { bodyParts: finalDraft, date });
        showToast('Workout saved');
      } else {
        const session = await addSession({ bodyParts: finalDraft, dateISO: date });
        setSavedSessionId(session.id);
        showToast('Workout saved');
      }
    } catch (e) {
      showToast('Could not save workout — please try again');
    } finally {
      setSaving(false);
    }
    // Close picker if it was opened by commitBodyPart
    setPartPickerOpen(false);
  };

  /** Finish the workout — save and navigate home. */
  const handleFinish = async () => {
    const pending = bodyPart && exercises.length > 0 ? commitBodyPart() : null;
    if (pending === null && bodyPart && exercises.length > 0) return; // validation error
    const finalDraft = pending ? [...draft, pending] : draft;
    if (finalDraft.length === 0) {
      setError('Nothing to save yet — add at least one exercise.');
      return;
    }
    setSaving(true);
    try {
      if (savedSessionId) {
        await useWorkoutStore.getState().updateSession(savedSessionId, { bodyParts: finalDraft, date });
      } else {
        await addSession({ bodyParts: finalDraft, dateISO: date });
      }
      showToast('Workout saved');
      navigation.popToTop();
    } catch (e) {
      showToast('Could not save workout — please try again');
    } finally {
      setSaving(false);
    }
    // Close picker if it was opened by commitBodyPart
    setPartPickerOpen(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: fontSize.title, fontWeight: '800' }}>
          Add workout
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Read-only header when in exercise entry mode (Screen 2+) */}
      {!isInitialScreen && (
        <View style={{ paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.s }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.s }}>
            {/* Body parts breadcrumb */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 }}>
              {draft.map((bp, i) => (
                <Text key={bp.bodyPart} style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                  {bp.bodyPart}
                </Text>
              ))}
              {exercises.length > 0 && (
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                  {bodyPart ?? '—'}
                </Text>
              )}
            </View>
            {/* Locked date */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                {parseISODateLocal(date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })} {parseISODateLocal(date).getFullYear()}
              </Text>
            </View>
          </View>
        </View>
      )}

      <FlatList
        contentContainerStyle={{ padding: spacing.m, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        data={[0]}
        renderItem={() => (
          <View>
            {/* Screen 1: Initial selection (date, body part, exercise) */}
            {isInitialScreen && (
              <>
                {/* Workout date selection */}
                <Card style={{ marginBottom: spacing.m }}>
                  <View style={{ padding: spacing.s }}>
                    <SectionTitle>Workout date</SectionTitle>
                    <Pressable
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: touchTarget,
                        borderRadius: radius,
                        backgroundColor: colors.surfaceAlt,
                        paddingHorizontal: spacing.m,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                      }}
                      onPress={showDatePicker}
                    >
                      <Text style={{ color: colors.text }}>
                        {parseISODateLocal(date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })} {parseISODateLocal(date).getFullYear()}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </Card>

                {/* Step 1 — body part */}
                <SectionTitle>1 · Body part</SectionTitle>
                <Card>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPartPickerOpen(true)}
                    style={{
                      minHeight: touchTarget,
                      borderRadius: radius,
                      backgroundColor: colors.surfaceAlt,
                      justifyContent: 'center',
                      paddingHorizontal: spacing.m,
                    }}
                  >
                    <Text style={{ color: bodyPart ? colors.text : colors.textMuted, fontSize: fontSize.body }}>
                      {bodyPart ?? 'Select body part…'}
                    </Text>
                  </Pressable>
                </Card>

                {/* Step 2 — exercises under the body part (gated) */}
                {showStep2 && (
                  <>
                    <SectionTitle>2 · Exercises</SectionTitle>
                    <Card>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openExercisePicker()}
                        style={{
                          minHeight: touchTarget,
                          borderRadius: radius,
                          backgroundColor: colors.surfaceAlt,
                          justifyContent: 'center',
                          paddingHorizontal: spacing.m,
                        }}
                      >
                        <Text style={{ color: exName ? colors.text : colors.textMuted, fontSize: fontSize.body }}>
                          {exName || 'Add exercise (pick or type free text)…'}
                        </Text>
                      </Pressable>
                      <Button
                        label="Add exercise"
                        variant="secondary"
                        onPress={() => addExercise(exName)}
                        style={{ marginTop: spacing.s }}
                      />
                    </Card>
                  </>
                )}

                {/* Step 3 — footer actions (gated) */}
                {showFooter && (
                  <Card>
                    <View style={{ gap: spacing.s }}>
                      <Button
                        label="Add another body part"
                        variant="secondary"
                        onPress={commitBodyPart}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.s }}>
                        <Button
                          label={saving ? 'Saving…' : 'Save'}
                          variant="secondary"
                          onPress={handleSave}
                          disabled={saving}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label={saving ? 'Saving…' : 'Finish'}
                          onPress={handleFinish}
                          disabled={saving}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                    {error ? (
                      <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
                        {error}
                      </Text>
                    ) : null}
                  </Card>
                )}
              </>
            )}

            {/* Screen 2+: Exercise entry mode */}
            {!isInitialScreen && (
              <>
                {/* Expandable/editable draft body parts */}
                <WorkoutDraftEditor
                  draft={draft}
                  expandedParts={expandedDraftParts}
                  onToggleExpansion={toggleDraftPartExpansion}
                  onRemoveBodyPart={handleRemoveBodyPart}
                  onRemoveExercise={handleRemoveExercise}
                  onRemoveSet={handleRemoveSet}
                  onAddSet={handleAddSet}
                  onUpdateSet={handleUpdateSet}
                  onAddExercise={handleAddExercise}
                  openExercisePicker={openExercisePicker}
                  colors={colors}
                  spacing={spacing}
                  fontSize={fontSize}
                  radius={radius}
                  touchTarget={touchTarget}
                />

                {/* Active body part header */}
                {bodyPart && (
                  <View style={{ marginBottom: spacing.s, paddingHorizontal: spacing.xs }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                      {bodyPart}
                    </Text>
                  </View>
                )}

                {/* Active exercise entry area */}
                {renderActiveExerciseEntry()}

                {/* Step 3 — footer actions (gated) */}
                {showFooter && (
                  <Card>
                    <View style={{ gap: spacing.s }}>
                      <Button
                        label="Add another body part"
                        variant="secondary"
                        onPress={commitBodyPart}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.s }}>
                        <Button
                          label={saving ? 'Saving…' : 'Save'}
                          variant="secondary"
                          onPress={handleSave}
                          disabled={saving}
                          style={{ flex: 1 }}
                        />
                        <Button
                          label={saving ? 'Saving…' : 'Finish'}
                          onPress={handleFinish}
                          disabled={saving}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                    {error ? (
                      <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
                        {error}
                      </Text>
                    ) : null}
                  </Card>
                )}
              </>
            )}
          </View>
        )}
      />

      {/* Body part picker modal */}
      <Modal visible={partPickerOpen} transparent animationType="fade" onRequestClose={() => setPartPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPartPickerOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.title, marginBottom: spacing.m }}>
              Select body part
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s }}>
              {Object.keys(EXERCISE_LIBRARY).map((p) => (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  onPress={() => {
                    const alreadyInDraft = draft.some((bp) => bp.bodyPart === p);
                    if (alreadyInDraft) {
                      // Expand the existing body part instead of creating duplicate
                      setPartPickerOpen(false);
                      setExpandedDraftParts((prev) => {
                        const next = new Set(prev);
                        next.clear();
                        next.add(p);
                        return next;
                      });
                      showToast(`${p} already in workout — tap to expand`);
                    } else {
                      setBodyPart(p);
                      setCustomPart('');
                      setPartPickerOpen(false);
                    }
                  }}
                  style={{
                    minHeight: touchTarget,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.m,
                    borderRadius: radius,
                    backgroundColor: bodyPart === p ? colors.accent : colors.surfaceAlt,
                  }}
                >
                  <Text style={{ color: bodyPart === p ? colors.accentText : colors.text }}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Exercise picker modal (presets for the chosen body part + free text + custom) */}
      <Modal visible={exPickerOpen} transparent animationType="fade" onRequestClose={() => { setExPickerOpen(false); setExPickerForBodyPart(null); }}>
        <Pressable style={styles.backdrop} onPress={() => { setExPickerOpen(false); setExPickerForBodyPart(null); }}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.title, marginBottom: spacing.m }}>
              {(exPickerForBodyPart ?? bodyPart) ? `Exercises — ${exPickerForBodyPart ?? bodyPart}` : 'Pick a body part first'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s }}>
              {((exPickerForBodyPart ?? bodyPart) ? allExercisesFor(exPickerForBodyPart ?? bodyPart!) : []).map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    setExName(name);
                    if (exPickerForBodyPart) {
                      addExerciseToDraftBodyPart(exPickerForBodyPart, name);
                    }
                    setExPickerOpen(false);
                    setExPickerForBodyPart(null);
                  }}
                  style={{
                    minHeight: touchTarget,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.m,
                    borderRadius: radius,
                    backgroundColor: colors.surfaceAlt,
                  }}
                >
                  <Text style={{ color: colors.text }}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={exName}
              onChangeText={setExName}
              placeholder="Custom exercise name…"
              placeholderTextColor={colors.textMuted}
              style={{
                marginTop: spacing.m,
                minHeight: touchTarget,
                borderRadius: radius,
                backgroundColor: colors.surfaceAlt,
                color: colors.text,
                paddingHorizontal: spacing.m,
                fontSize: fontSize.body,
              }}
            />
            <Button
              label="Use this name"
              variant="secondary"
              onPress={() => {
                if (exPickerForBodyPart) {
                  addExerciseToDraftBodyPart(exPickerForBodyPart, exName);
                }
                setExPickerOpen(false);
                setExPickerForBodyPart(null);
              }}
              style={{ marginTop: spacing.s }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirmation dialog for deletions */}
      <ConfirmDialog
        visible={confirmDelete !== null}
        title={
          confirmDelete?.type === 'set'
            ? 'Delete this set?'
            : confirmDelete?.type === 'exercise'
            ? 'Delete this exercise?'
            : 'Delete this body part?'
        }
        message={
          confirmDelete?.type === 'set'
            ? 'This will remove the set from the exercise.'
            : confirmDelete?.type === 'exercise'
            ? 'This will remove the exercise and all its sets.'
            : 'This will remove the body part and all its exercises and sets.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          confirmDelete?.onConfirm();
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {renderDatePicker()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerSheet: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  setInput: {
    minHeight: 44,
    paddingHorizontal: 10,
    fontSize: 15,
    flex: 1,
  },
});