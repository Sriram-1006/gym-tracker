import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { useCurrentDraftStore } from '../stores/appStores';
import {
  cleanDraftExercises,
  commitActiveBodyPart,
  createEmptyDraft,
  formatDisplayDate,
  hasMeaningfulDraftData,
} from '../data/repositories';
import { CurrentWorkoutDraft, DraftExercise, DraftSet } from '../data/models';
import { Button, Card, SectionTitle, ConfirmDialog } from '../components/ui';
import { DatePickerField } from '../components/DatePickerField';
import { WorkoutDraftEditor } from '../components/workoutDraftEditor';
import { BodyPartPickerModal } from '../components/BodyPartPickerModal';
import { showToast } from '../components/Toast';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { Ionicons } from '@expo/vector-icons';

/**
 * Add Workout screen — also the "Current workout" screen.
 *
 * The in-progress workout is a persisted CurrentWorkoutDraft (`workouts.current.v1`)
 * that is autosaved continuously. Opening this screen resumes the existing draft
 * if one exists, so there is never more than one current workout.
 *
 * - Every edit is autosaved (typing is debounced, structural edits are immediate).
 * - Back flushes the latest state and leaves the workout as "current".
 * - Finish is the only action that converts the draft into a completed session.
 */
export function AddWorkoutScreen({ navigation }: any) {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;
  const insets = useSafeAreaInsets();

  const customExercises = useExerciseLibraryStore((s) => s.custom);
  const addCustomExercise = useExerciseLibraryStore((s) => s.addCustomExercise);

  const persistDraft = useCurrentDraftStore((s) => s.persistDraft);
  const autoSaveDraft = useCurrentDraftStore((s) => s.autoSaveDraft);
  const flushDraft = useCurrentDraftStore((s) => s.flushDraft);
  const finishDraft = useCurrentDraftStore((s) => s.finishDraft);

  // Resume the persisted draft when one exists; otherwise start a fresh one.
  const [state, setState] = useState<CurrentWorkoutDraft>(() => {
    const existing = useCurrentDraftStore.getState().draft;
    return existing && hasMeaningfulDraftData(existing) ? existing : createEmptyDraft();
  });

  // Authoritative in-memory snapshot. All mutations go through `commitState`, so
  // the ref never goes stale and flush/Finish always see the latest edit.
  const stateRef = useRef(state);

  const commitState = useCallback(
    (next: CurrentWorkoutDraft, immediate = false) => {
      const stamped = { ...next, updatedAt: Date.now() };
      stateRef.current = stamped;
      setState(stamped);
      if (immediate) {
        // Structural change / boundary: write now so leaving immediately is safe.
        void persistDraft(stamped);
      } else {
        // Typing burst: UI updates now, storage shortly, flushed on navigation.
        autoSaveDraft(stamped);
      }
    },
    [persistDraft, autoSaveDraft],
  );

  /* ------------------------------ visual state ---------------------------- */

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [exPickerOpen, setExPickerOpen] = useState(false);
  const [exPickerForBodyPart, setExPickerForBodyPart] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'set' | 'exercise' | 'bodyPart';
    bodyPartName?: string;
    exerciseIndex?: number;
    setIndex?: number;
    onConfirm: () => void;
  } | null>(null);

  /**
   * Snapshot taken right before an "add body part" picker opens. If the picker
   * is dismissed, the snapshot is restored — so the pre-picker commit (below)
   * is safely undone and the active entry form looks untouched.
   */
  const pickerSnapshotRef = useRef<CurrentWorkoutDraft | null>(null);

  /* -------------------------------- derived ------------------------------- */

  const draft = state.bodyParts;
  const bodyPart = state.activeBodyPart;
  const exercises = state.activeExercises;
  const exName = state.activeExerciseName;
  const date = state.date;

  const draftBodyParts = useMemo(
    () => new Set(state.bodyParts.map((bp) => bp.bodyPart)),
    [state.bodyParts],
  );

  const allExercisesFor = useMemo(
    () => (part: string) => [...(EXERCISE_LIBRARY[part] ?? []), ...(customExercises[part] ?? [])],
    [customExercises],
  );

  const isInitialScreen = exercises.length === 0 && draft.length === 0;
  const showStep2 = bodyPart !== null;
  const showFooter =
    draft.length > 0 ||
    (bodyPart !== null &&
      exercises.some((e) => e.sets.some((s) => s.weight.trim() !== '' || s.reps.trim() !== '')));

  /* ----------------------------- navigation ------------------------------- */

  const handleBack = useCallback(() => {
    // Explicitly flush the latest state before leaving; never rely on debounce.
    void flushDraft();
    navigation.goBack();
  }, [flushDraft, navigation]);

  useEffect(() => {
    if (Platform.OS === 'web') return; // BackHandler is a no-op on web
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  // Covers gesture/back-navigation paths too (and the unmount below covers any
  // remaining case). Flushing an already-cleared draft is a harmless no-op.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('beforeRemove', () => {
      void flushDraft();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigation, flushDraft]);

  useEffect(() => () => void flushDraft(), [flushDraft]);

  /* -------------------- active body part / exercise entry ----------------- */

  const openExercisePicker = (forBodyPart?: string) => {
    setExPickerForBodyPart(forBodyPart ?? null);
    setExPickerOpen(true);
  };

  /** Blank sets start genuinely blank (never an unusable 0 kg / 0 reps field). */
  const blankSet = (): DraftSet => ({ weight: '', reps: '' });

  const addExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cur = stateRef.current;
    const existingIdx = cur.activeExercises.findIndex(
      (ex) => ex.name.toLowerCase() === trimmed.toLowerCase(),
    );
    let activeExercises: DraftExercise[];
    if (existingIdx >= 0) {
      activeExercises = cur.activeExercises.map((ex, i) =>
        i === existingIdx ? { ...ex, sets: [...ex.sets, blankSet()] } : ex,
      );
      showToast(`${trimmed} is already in this workout — added another set to it.`);
    } else {
      activeExercises = [...cur.activeExercises, { name: trimmed, sets: [blankSet()] }];
    }
    commitState({ ...cur, activeExercises, activeExerciseName: '' }, true);
    const part = cur.activeBodyPart;
    if (part && !EXERCISE_LIBRARY[part]?.includes(trimmed)) addCustomExercise(part, trimmed);
  };

  const updateActiveSet = (exIdx: number, setIdx: number, patch: Partial<DraftSet>) => {
    const cur = stateRef.current;
    commitState({
      ...cur,
      activeExercises: cur.activeExercises.map((ex, i) =>
        i === exIdx
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) }
          : ex,
      ),
    });
  };

  const addActiveSet = (exIdx: number) => {
    const cur = stateRef.current;
    commitState(
      {
        ...cur,
        activeExercises: cur.activeExercises.map((ex, i) =>
          i === exIdx ? { ...ex, sets: [...ex.sets, blankSet()] } : ex,
        ),
      },
      true,
    );
  };

  const removeActiveSet = (exIdx: number, setIdx: number) => {
    const cur = stateRef.current;
    commitState(
      {
        ...cur,
        activeExercises: cur.activeExercises.map((ex, i) =>
          i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex,
        ),
      },
      true,
    );
  };

  const removeActiveExercise = (exIdx: number) => {
    const cur = stateRef.current;
    commitState({ ...cur, activeExercises: cur.activeExercises.filter((_, i) => i !== exIdx) }, true);
  };

  const setActiveExerciseName = (text: string) => {
    commitState({ ...stateRef.current, activeExerciseName: text });
  };

  /* --------------------------- committed draft ops ------------------------ */

  const addExerciseToDraftBodyPart = (bpName: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cur = stateRef.current;
    const bodyParts = cur.bodyParts.map((bp) => {
      if (bp.bodyPart !== bpName) return bp;
      const existingIdx = bp.exercises.findIndex(
        (ex) => ex.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existingIdx >= 0) {
        showToast(`${trimmed} is already in this workout — added another set to it.`);
        return {
          ...bp,
          exercises: bp.exercises.map((ex, i) =>
            i === existingIdx ? { ...ex, sets: [...ex.sets, blankSet()] } : ex,
          ),
        };
      }
      return { ...bp, exercises: [...bp.exercises, { name: trimmed, sets: [blankSet()] }] };
    });
    commitState({ ...cur, bodyParts }, true);
    if (!EXERCISE_LIBRARY[bpName]?.includes(trimmed)) addCustomExercise(bpName, trimmed);
  };

  const handleAddSet = (bpName: string, exIdx: number) => {
    const cur = stateRef.current;
    commitState(
      {
        ...cur,
        bodyParts: cur.bodyParts.map((bp) =>
          bp.bodyPart !== bpName
            ? bp
            : {
                ...bp,
                exercises: bp.exercises.map((ex, i) =>
                  i === exIdx ? { ...ex, sets: [...ex.sets, blankSet()] } : ex,
                ),
              },
        ),
      },
      true,
    );
  };

  const handleUpdateSet = (
    bpName: string,
    exIdx: number,
    setIdx: number,
    patch: Partial<DraftSet>,
  ) => {
    const cur = stateRef.current;
    commitState({
      ...cur,
      bodyParts: cur.bodyParts.map((bp) =>
        bp.bodyPart !== bpName
          ? bp
          : {
              ...bp,
              exercises: bp.exercises.map((ex, i) =>
                i === exIdx
                  ? { ...ex, sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)) }
                  : ex,
              ),
            },
      ),
    });
  };

  const confirmRemoveSet = (bpName: string, exIdx: number, setIdx: number) => {
    setConfirmDelete({
      type: 'set',
      onConfirm: () => {
        const cur = stateRef.current;
        commitState(
          {
            ...cur,
            bodyParts: cur.bodyParts.map((bp) =>
              bp.bodyPart !== bpName
                ? bp
                : {
                    ...bp,
                    exercises: bp.exercises.map((ex, i) =>
                      i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex,
                    ),
                  },
            ),
          },
          true,
        );
      },
    });
  };

  const confirmRemoveExercise = (bpName: string, exIdx: number) => {
    setConfirmDelete({
      type: 'exercise',
      onConfirm: () => {
        const cur = stateRef.current;
        commitState(
          {
            ...cur,
            bodyParts: cur.bodyParts.map((bp) =>
              bp.bodyPart !== bpName
                ? bp
                : { ...bp, exercises: bp.exercises.filter((_, i) => i !== exIdx) },
            ),
          },
          true,
        );
      },
    });
  };

  const confirmRemoveBodyPart = (bpName: string) => {
    setConfirmDelete({
      type: 'bodyPart',
      onConfirm: () => {
        const cur = stateRef.current;
        commitState({ ...cur, bodyParts: cur.bodyParts.filter((bp) => bp.bodyPart !== bpName) }, true);
        setExpandedParts((prev) => {
          const next = new Set(prev);
          next.delete(bpName);
          return next;
        });
      },
    });
  };

  const toggleDraftPartExpansion = (bpName: string) => {
    setExpandedParts((prev) => {
      const next = new Set(prev);
      if (next.has(bpName)) {
        next.delete(bpName);
      } else {
        next.clear();
        next.add(bpName);
      }
      return next;
    });
  };

  /* ----------------------- add-another-body-part flow --------------------- */

  /**
   * Single entry point for every "add body part" affordance.
   *
   * Order is deliberate (P0 fix): validate the active entry → incorporate it
   * into the draft → PERSIST → then open the picker. The active form is cleared
   * as part of the commit, so the same data can never be persisted twice, and a
   * dismissed picker restores the snapshot so nothing feels lost.
   */
  const beginAddBodyPart = () => {
    const cur = stateRef.current;

    if (cur.activeBodyPart && cur.activeExercises.length > 0) {
      const cleaned = cleanDraftExercises(cur.activeExercises);
      if (!cleaned.some((ex) => ex.sets.length > 0)) {
        setError('Each exercise needs at least one set with weight or reps.');
        return; // keep the entry visible; do not open the picker
      }
    }

    pickerSnapshotRef.current = cur;
    const committed = commitActiveBodyPart(cur);
    setError(null);
    commitState(committed, true);
    setPartPickerOpen(true);
  };

  const handleBodyPartPickerConfirm = (selected: string) => {
    const cur = stateRef.current;
    pickerSnapshotRef.current = null;
    const alreadyInDraft = cur.bodyParts.some((bp) => bp.bodyPart === selected);

    if (alreadyInDraft) {
      setExpandedParts(new Set([selected]));
      showToast(`${selected} is already in this session — add more exercises to it below.`);
      commitState(
        { ...cur, activeBodyPart: null, activeExercises: [], activeExerciseName: '' },
        true,
      );
    } else {
      setExpandedParts(new Set());
      commitState(
        { ...cur, activeBodyPart: selected, activeExercises: [], activeExerciseName: '' },
        true,
      );
    }
    setPartPickerOpen(false);
  };

  const handleBodyPartPickerDismiss = () => {
    const snapshot = pickerSnapshotRef.current;
    pickerSnapshotRef.current = null;
    setPartPickerOpen(false);
    if (snapshot) commitState(snapshot, true); // undo the pre-picker commit
  };

  /* -------------------------------- finish -------------------------------- */

  /** Finish = the only action that turns the draft into a completed session. */
  const handleFinish = async () => {
    const cur = stateRef.current;

    if (cur.activeBodyPart && cur.activeExercises.length > 0) {
      const cleaned = cleanDraftExercises(cur.activeExercises);
      if (!cleaned.some((ex) => ex.sets.length > 0)) {
        setError('Each exercise needs at least one set with weight or reps.');
        return;
      }
    }

    const finalDraft = commitActiveBodyPart(cur);
    if (!hasMeaningfulDraftData(finalDraft)) {
      setError('Add at least one exercise before finishing.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const session = await finishDraft(finalDraft);
      if (!session) {
        setError('Add at least one complete set (weight or reps) before finishing.');
        return;
      }
      showToast('Workout saved');
      navigation.popToTop();
    } catch (e) {
      // finishDraft only clears the draft after the session is stored, so the
      // workout is still here for a retry.
      setError('Could not save your workout. Your current workout is safe — please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------- rendering ------------------------------ */

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
              <Pressable accessibilityRole="button" onPress={() => removeActiveExercise(i)} hitSlop={8}>
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
                  onChangeText={(t) => updateActiveSet(i, j, { weight: t })}
                  keyboardType="decimal-pad"
                  placeholder="kg"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.setInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius }]}
                />
                <TextInput
                  value={s.reps}
                  onChangeText={(t) => updateActiveSet(i, j, { reps: t })}
                  keyboardType="number-pad"
                  placeholder="reps"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.setInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove set ${j + 1}`}
                  onPress={() => removeActiveSet(i, j)}
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
                onPress={() => addActiveSet(i)}
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

  const renderFooterActions = () =>
    showFooter ? (
      <Card>
        <View style={{ gap: spacing.s }}>
          <Button
            label="Add another body part"
            variant="secondary"
            onPress={beginAddBodyPart}
          />
          <Button
            label={saving ? 'Finishing…' : 'Finish workout'}
            onPress={handleFinish}
            disabled={saving}
          />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, textAlign: 'center' }}>
            Progress is saved automatically — you can leave and resume anytime.
          </Text>
        </View>
        {error ? (
          <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
            {error}
          </Text>
        ) : null}
      </Card>
    ) : null;

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
          accessibilityLabel="Back"
          onPress={handleBack}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: fontSize.title, fontWeight: '800' }}>
          {isInitialScreen ? 'Add workout' : 'Current workout'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Read-only header when in exercise entry mode (Screen 2+) */}
      {!isInitialScreen && (
        <View style={{ paddingHorizontal: spacing.m, paddingTop: spacing.m, paddingBottom: spacing.s }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.s }}>
            {/* Body parts breadcrumb */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 }}>
              {draft.map((bp) => (
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
                {formatDisplayDate(date)}
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
                    <DatePickerField
                      value={date}
                      onChange={(iso) => commitState({ ...stateRef.current, date: iso }, true)}
                    />
                  </View>
                </Card>

                {/* Step 1 — body part */}
                <SectionTitle>1 · Body part</SectionTitle>
                <Card>
                  <Pressable
                    accessibilityRole="button"
                    onPress={beginAddBodyPart}
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
                {renderFooterActions()}
              </>
            )}

            {/* Screen 2+: Exercise entry mode */}
            {!isInitialScreen && (
              <>
                {/* Expandable/editable draft body parts */}
                <WorkoutDraftEditor
                  draft={draft}
                  expandedParts={expandedParts}
                  onToggleExpansion={toggleDraftPartExpansion}
                  onRemoveBodyPart={confirmRemoveBodyPart}
                  onRemoveExercise={confirmRemoveExercise}
                  onRemoveSet={confirmRemoveSet}
                  onAddSet={handleAddSet}
                  onUpdateSet={handleUpdateSet}
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
                {renderFooterActions()}
              </>
            )}
          </View>
        )}
      />

      {/* Shared body-part picker modal */}
      <BodyPartPickerModal
        visible={partPickerOpen}
        onClose={handleBodyPartPickerDismiss}
        onConfirm={handleBodyPartPickerConfirm}
        alreadyInDraft={draftBodyParts}
        currentBodyPart={null}
      />

      {/* Exercise picker modal (presets for the chosen body part + free text + custom) */}
      <Modal
        visible={exPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setExPickerOpen(false);
          setExPickerForBodyPart(null);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setExPickerOpen(false);
            setExPickerForBodyPart(null);
          }}
        >
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.title, marginBottom: spacing.m }}>
              {(exPickerForBodyPart ?? bodyPart) ? `Exercises — ${exPickerForBodyPart ?? bodyPart}` : 'Pick a body part first'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s }}>
              {((exPickerForBodyPart ?? bodyPart)
                ? allExercisesFor(exPickerForBodyPart ?? bodyPart!)
                : []
              ).map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    if (exPickerForBodyPart) {
                      addExerciseToDraftBodyPart(exPickerForBodyPart, name);
                    } else {
                      setActiveExerciseName(name);
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
              onChangeText={setActiveExerciseName}
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
                } else {
                  addExercise(exName);
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
