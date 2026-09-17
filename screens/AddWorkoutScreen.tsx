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
import { Button, Card, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { Ionicons } from '@expo/vector-icons';

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

  // Current in-progress body part
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [customPart, setCustomPart] = useState('');
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  // Current in-progress exercise
  const [exercises, setExercises] = useState<{ name: string; sets: DraftSet[] }[]>([]);
  const [exName, setExName] = useState('');
  const [exPickerOpen, setExPickerOpen] = useState(false);

  // Workout date — defaults to current date if not explicitly changed
  const [date, setDate] = useState<string>(() => todayISO());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const presetSetsFor = useMemo(
    () => (part: string) => EXERCISE_LIBRARY[part] ?? [],
    [],
  );

  const resetExerciseForm = () => {
    setExName('');
    setExercises([]);
  };

  const startNewBodyPart = () => {
    setBodyPart(null);
    setCustomPart('');
    resetExerciseForm();
    setPartPickerOpen(true);
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
        return [...d.slice(0, idx), entry, ...d.slice(idx + 1)];
      }
      return [...d, entry];
    });
    setError(null);
    startNewBodyPart();
    return entry;
  };

  const saveSession = async () => {
    // A body part still open in the form counts too — commit it first.
    // (commitBodyPart returns the entry so we don't depend on async state.)
    const pending = bodyPart && exercises.length > 0 ? commitBodyPart() : null;
    const finalDraft = pending ? [...draft, pending] : draft;
    if (finalDraft.length === 0) {
      setError('Nothing to save yet — add at least one exercise.');
      return;
    }
    setSaving(true);
    try {
      await addSession({ bodyParts: finalDraft, dateISO: date });
      showToast('Workout saved');
      navigation.popToTop();
    } catch (e) {
      showToast('Could not save workout — please try again');
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------- exercise ops ---------------------------- */

  const addExercise = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setExercises((xs) => [...xs, { name: trimmed, sets: [{ weight: '', reps: '' }] }]);
    setExName('');
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

  const renderDraftSummary = () => {
    if (draft.length === 0 && exercises.length === 0) return null;
    const totalSets = draft.reduce(
      (a, bp) => a + bp.exercises.reduce((a, ex) => a + ex.sets.length, 0),
      0,
    ) + exercises.reduce((a, e) => a + e.sets.length, 0);
    return (
      <Card style={{ marginBottom: spacing.m }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
          This session so far
        </Text>
        {draft.map((bp, i) => (
          <View key={`${bp.bodyPart}-${i}`} style={{ marginTop: spacing.s }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.caption }}>
              {bp.bodyPart}
            </Text>
            {bp.exercises.map((e, j) => (
              <Text key={j} style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                • {e.name} — {e.sets.map((s) => `${s.weight}kg×${s.reps}`).join(', ')}
              </Text>
            ))}
          </View>
        ))}
        {exercises.length > 0 ? (
          <View>
            {exercises.map((e, i) => (
              <View
                key={`${e.name}-${i}`}
                style={{ marginTop: spacing.s, paddingTop: spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.caption }}>
                  {e.name}
                </Text>
                {e.sets.map((s, j) => (
                  <Text key={j} style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                    • Set {j + 1}: {s.weight}kg×{s.reps}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: spacing.s }}>
          {totalSets} set{totalSets === 1 ? '' : 's'} total
        </Text>
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
        value={new Date(date)}
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
                {new Date(date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })} {new Date(date).getFullYear()}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '700' }}>
                        Workout date
                      </Text>
                      <Pressable
                        style={{ padding: spacing.s, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius, backgroundColor: colors.surfaceAlt, minHeight: 44 }}
                        onPress={showDatePicker}
                      >
                        <Text style={{ color: colors.text }}>
                          {new Date(date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })} {new Date(date).getFullYear()}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={colors.textMuted} style={{ marginLeft: 8 }} />
                      </Pressable>
                    </View>
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

                {/* Step 2 — exercises under the body part */}
                <SectionTitle>2 · Exercises</SectionTitle>
                <Card>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setExPickerOpen(true)}
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

                {/* Step 3 — commit this body part, continue or finish */}
                <Card>
                  <View style={{ gap: spacing.s }}>
                    <Button
                      label="Add another body part"
                      variant="secondary"
                      onPress={commitBodyPart}
                    />
                    <Button
                      label={saving ? 'Saving…' : 'Finish & save workout'}
                      onPress={saveSession}
                      disabled={saving}
                    />
                  </View>
                  {error ? (
                    <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
                      {error}
                    </Text>
                  ) : null}
                </Card>
              </>
            )}

            {/* Screen 2+: Exercise entry mode */}
            {!isInitialScreen && (
              <>
                {/* Collapsed summary of committed body parts (draft) */}
                {draft.length > 0 && (
                  <Card style={{ marginBottom: spacing.m }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body, marginBottom: spacing.s }}>
                      Completed body parts
                    </Text>
                    {draft.map((bp, i) => (
                      <View key={`${bp.bodyPart}-${i}`} style={{ marginTop: spacing.s }}>
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.caption }}>
                          {bp.bodyPart}
                        </Text>
                        {bp.exercises.map((e, j) => (
                          <Text key={j} style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                            • {e.name} — {e.sets.map((s) => `${s.weight}kg×${s.reps}`).join(', ')}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </Card>
                )}

                {/* Active body part header */}
                {bodyPart && (
                  <View style={{ marginBottom: spacing.s, paddingHorizontal: spacing.xs }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                      {bodyPart}
                    </Text>
                  </View>
                )}

                {/* Active exercise entry area */}
                <Card>
                  {exercises.length > 0 ? (
                    <>
                      <SectionTitle>Exercise entry</SectionTitle>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setExPickerOpen(true)}
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
                          </View>
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      <SectionTitle>2 · Exercises</SectionTitle>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setExPickerOpen(true)}
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
                    </>
                  )}
                </Card>

                {/* Step 3 — commit this body part, continue or finish */}
                <Card>
                  <View style={{ gap: spacing.s }}>
                    <Button
                      label="Add another body part"
                      variant="secondary"
                      onPress={commitBodyPart}
                    />
                    <Button
                      label={saving ? 'Saving…' : 'Finish & save workout'}
                      onPress={saveSession}
                      disabled={saving}
                    />
                  </View>
                  {error ? (
                    <Text style={{ color: colors.destructive, marginTop: spacing.m, fontSize: fontSize.caption }}>
                      {error}
                    </Text>
                  ) : null}
                </Card>
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

      {/* Exercise picker modal (presets for the chosen body part + free text) */}
      <Modal visible={exPickerOpen} transparent animationType="fade" onRequestClose={() => setExPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setExPickerOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.title, marginBottom: spacing.m }}>
              {bodyPart ? `Exercises — ${bodyPart}` : 'Pick a body part first'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s }}>
              {(bodyPart ? presetSetsFor(bodyPart) : []).map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    setExName(name);
                    setExPickerOpen(false);
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
              onPress={() => setExPickerOpen(false)}
              style={{ marginTop: spacing.s }}
            />
          </Pressable>
        </Pressable>
      </Modal>

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