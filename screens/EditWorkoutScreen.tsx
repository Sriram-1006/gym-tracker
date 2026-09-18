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
 * Edit Workout screen.
 *
 * Flow: load existing workout → modify body parts / exercises / sets / date →
 * Save changes (updates the existing workout record) or Cancel (discards).
 */
export function EditWorkoutScreen({ navigation, route }: any) {
  const { sessionId } = route?.params ?? {};
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;
  const insets = useSafeAreaInsets();
  const { updateSession } = useWorkoutStore();

  const sessions = useWorkoutStore((s) => s.sessions);
  const session = sessions.find((s) => s.id === sessionId);

  // Defensive initialization - don't return early before hooks
  const sessionBodyParts = session?.bodyParts ?? [];

  const today = todayISO();

  // Current editing state
  const [draft, setDraft] = useState<BodyPartInput[]>(sessionBodyParts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom exercises from library store
  const customExercises = useExerciseLibraryStore((s) => s.custom);
  const addCustomExercise = useExerciseLibraryStore((s) => s.addCustomExercise);

  // Editing exercise / set state
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [customPart, setCustomPart] = useState('');
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  // Which draft body parts are expanded for editing
  const [expandedDraftParts, setExpandedDraftParts] = useState<Set<string>>(new Set());

  // Confirmation dialogs for deletions and save changes
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'set' | 'exercise' | 'bodyPart';
    bodyPartName?: string;
    exerciseIndex?: number;
    setIndex?: number;
    onConfirm: () => void;
  } | null>(null);

  const [exercises, setExercises] = useState<
    { name: string; sets: DraftSet[] }[]
  >([]);

  const [exName, setExName] = useState('');
  const [exPickerOpen, setExPickerOpen] = useState(false);
  const [exPickerForBodyPart, setExPickerForBodyPart] = useState<string | null>(null);

  const [date, setDate] = useState<string>(session?.date ?? todayISO());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // Preset sets mapping
  const presetSetsFor = useMemo(
    () => (part: string) => EXERCISE_LIBRARY[part] ?? [],
    [],
  );

  const allExercisesFor = useMemo(
    () => (part: string) => [...(EXERCISE_LIBRARY[part] ?? []), ...(customExercises[part] ?? [])],
    [customExercises],
  );

  const resetExerciseForm = () => {
    setExName('');
    setExercises([]);
    setExPickerForBodyPart(null);
  };

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

  /** Validates and commits the in-progress body part into draft. */
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
        return [...d.slice(0, idx), entry, ...d.slice(idx + 1)];
      }
      return [...d, entry];
    });
    setError(null);
    startNewBodyPart();
    return entry;
  };

  /** Save changes — update the existing workout and navigate back. */
  const saveChanges = async () => {
    // Commit any remaining body part - capture return value to avoid stale state
    const pending = bodyPart && exercises.length > 0 ? commitBodyPart() : null;
    if (pending === null && bodyPart && exercises.length > 0) return; // validation error
    const finalDraft = pending ? [...draft, pending] : draft;

    if (finalDraft.length === 0) {
      setError('Nothing to save — add at least one exercise.');
      return;
    }

    // Count for confirmation dialog
    const totalExercises = finalDraft.reduce((a, bp) => a + bp.exercises.length, 0);
    const totalSets = finalDraft.reduce((a, bp) => a + bp.exercises.reduce((a, ex) => a + ex.sets.length, 0), 0);

    setConfirmDelete({
      type: 'bodyPart', // reuse type for confirmation
      bodyPartName: 'Save Changes',
      onConfirm: async () => {
        const dateToUse = date ?? todayISO();

        setSaving(true);
        try {
          await updateSession(sessionId, {
            date: dateToUse,
            bodyParts: finalDraft,
          });
          showToast('Workout updated');
          navigation.goBack();
        } catch (e) {
          showToast('Could not update workout — please try again');
        } finally {
          setSaving(false);
        }
      },
    });
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

  const addSet = (exIdx: number) => {
    setExercises((xs) =>
      xs.map((x, i) =>
        i === exIdx
          ? { ...x, sets: [...x.sets, { weight: '', reps: '' }] }
          : x,
      ),
    );
  };

  const duplicateLastSet = (exIdx: number) => {
    setExercises((xs) =>
      xs.map((x, i) => {
        if (i !== exIdx || x.sets.length === 0) return x;
        const last = x.sets[x.sets.length - 1];
        return { ...x, sets: [...x.sets, { ...last }] };
      }),
    );
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((xs) =>
      xs.map((x, i) =>
        i === exIdx
          ? { ...x, sets: x.sets.filter((_, j) => j !== setIdx) }
          : x,
      ),
    );
  };

  const removeExercise = (exIdx: number) => {
    setExercises((xs) => xs.filter((_, i) => i !== exIdx));
  };

  /* ------------------------------- rendering ----------------------------- */

  // Handler functions for the shared WorkoutDraftEditor component
  const handleRemoveBodyPart = (bodyPartName: string) => {
    setConfirmDelete({
      type: 'bodyPart',
      bodyPartName,
      onConfirm: () => {
        setDraft((d) => d.filter((bp) => bp.bodyPart !== bodyPartName));
      },
    });
  };

  const handleRemoveExercise = (bodyPartName: string, exerciseIndex: number) => {
    setConfirmDelete({
      type: 'exercise',
      bodyPartName,
      exerciseIndex,
      onConfirm: () => {
        setDraft((d) =>
          d.map((bp) => {
            if (bp.bodyPart !== bodyPartName) return bp;
            return { ...bp, exercises: bp.exercises.filter((_, i) => i !== exerciseIndex) };
          }),
        );
      },
    });
  };

  const handleRemoveSet = (bodyPartName: string, exerciseIndex: number, setIndex: number) => {
    setConfirmDelete({
      type: 'set',
      bodyPartName,
      exerciseIndex,
      setIndex,
      onConfirm: () => {
        setDraft((d) =>
          d.map((bp) => {
            if (bp.bodyPart !== bodyPartName) return bp;
            return {
              ...bp,
              exercises: bp.exercises.map((ex, i) => {
                if (i !== exerciseIndex) return ex;
                return { ...ex, sets: ex.sets.filter((_, j) => j !== setIndex) };
              }),
            };
          }),
        );
      },
    });
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
          Edit workout
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        contentContainerStyle={{ padding: spacing.m, paddingBottom: 120 }}
        data={[0]}
        renderItem={() => (
          <View>
            {/* Date section */}
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

            {renderDatePicker()}

            {/* Existing body parts from the workout — editable inline */}
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

            {/* Add body part button */}
            <Button
              label="Add body part"
              variant="secondary"
              onPress={startNewBodyPart}
              style={{ marginTop: spacing.m, marginBottom: spacing.m }}
            />

            {/* Active body part / exercise entry area */}
            {bodyPart && (
              <>
                <SectionTitle>Exercise entry</SectionTitle>
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
                        <Button
                          label="Duplicate last set"
                          variant="ghost"
                          size="sm"
                          onPress={() => duplicateLastSet(i)}
                          style={{ alignSelf: 'flex-start' }}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {/* Step 3 — commit this body part, save changes or cancel */}
            <Card>
              <View style={{ gap: spacing.s }}>
                <Button
                  label="Add another body part"
                  variant="secondary"
                  onPress={commitBodyPart}
                />
                <Button
                  label={saving ? 'Saving…' : 'Save Changes'}
                  onPress={saveChanges}
                  disabled={saving}
                />
              </View>
              {error ? (
                <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
                  {error}
                </Text>
              ) : null}
            </Card>
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
                    setBodyPart(p);
                    setCustomPart('');
                    setPartPickerOpen(false);
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

      {/* Exercise picker modal */}
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

      {/* Confirmation dialog for deletions and save changes */}
      <ConfirmDialog
        visible={confirmDelete !== null}
        title={
          confirmDelete?.type === 'set'
            ? 'Delete this set?'
            : confirmDelete?.type === 'exercise'
            ? 'Delete this exercise?'
            : confirmDelete?.bodyPartName === 'Save Changes'
            ? 'Save changes to this workout?'
            : 'Delete this body part?'
        }
        message={
          confirmDelete?.type === 'set'
            ? 'This will remove the set from the exercise.'
            : confirmDelete?.type === 'exercise'
            ? 'This will remove the exercise and all its sets.'
            : confirmDelete?.bodyPartName === 'Save Changes'
            ? `This will update the workout to ${draft.reduce((a, bp) => a + bp.exercises.length, 0)} exercise(s) and ${draft.reduce((a, bp) => a + bp.exercises.reduce((a, ex) => a + ex.sets.length, 0), 0)} set(s).`
            : 'This will remove the body part and all its exercises and sets.'
        }
        confirmLabel={confirmDelete?.bodyPartName === 'Save Changes' ? 'Save' : 'Delete'}
        cancelLabel="Cancel"
        destructive={confirmDelete?.bodyPartName !== 'Save Changes'}
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