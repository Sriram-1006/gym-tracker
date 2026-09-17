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

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Text style={{ color: colors.text, fontSize: fontSize.body, textAlign: 'center' }}>
          Workout not found
        </Text>
      </View>
    );
  }

  const today = todayISO();

  // Current editing state
  const [draft, setDraft] = useState<BodyPartInput[]>(session.bodyParts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing exercise / set state
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [customPart, setCustomPart] = useState('');
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  const [exercises, setExercises] = useState<
    { name: string; sets: DraftSet[] }[]
  >([]);

  const [exName, setExName] = useState('');
  const [exPickerOpen, setExPickerOpen] = useState(false);

  const [date, setDate] = useState<string>(session.date);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // Preset sets mapping
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
    // Commit any remaining body part
    if (bodyPart) {
      await commitBodyPart();
    }
    if (error) return;

    const dateToUse = date ?? todayISO();

    setSaving(true);
    try {
      await updateSession(sessionId, {
        date: dateToUse,
        bodyParts: draft,
      });
      showToast('Workout updated');
      navigation.goBack();
    } catch (e) {
      showToast('Could not update workout — please try again');
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

  const loadBodyPartForEdit = (bp: BodyPartInput) => {
    setBodyPart(bp.bodyPart);
    setCustomPart('');
    setExercises(bp.exercises.map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) })) })));
    // Remove from draft since we're editing it
    setDraft((d) => d.filter((x) => x.bodyPart !== bp.bodyPart));
  };

  const renderDraftSummary = () => {
    if (draft.length === 0 && exercises.length === 0) return null;
    const totalSets = draft.reduce(
      (a, bp) => a + bp.exercises.reduce((a, ex) => a + ex.sets.length, 0),
      0,
    ) + exercises.reduce(
      (a, e) => a + e.sets.length,
      0,
    );
    return (
      <Card style={{ marginBottom: spacing.m }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
          This session
        </Text>
        {draft.map((bp, i) => (
          <Pressable
            key={`${bp.bodyPart}-${i}`}
            onPress={() => loadBodyPartForEdit(bp)}
            style={{ marginTop: spacing.s, paddingVertical: spacing.xs }}
            hitSlop={16}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.accent, fontWeight: '700', fontSize: fontSize.caption }}>
                {bp.bodyPart}
              </Text>
              <Ionicons name="create-outline" size={18} color={colors.textMuted} />
            </View>
            {bp.exercises.map((e, j) => (
              <Text key={j} style={{ color: colors.textMuted, fontSize: fontSize.caption, marginLeft: 4 }}>
                • {e.name} — {e.sets.map((s) => `${s.weight}kg×${s.reps}`).join(', ')}
              </Text>
            ))}
          </Pressable>
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
            </Card>

            {renderDatePicker()}

            {/* Body parts */}
            <SectionTitle>1 · Body part</SectionTitle>
            <Card>
              <Pressable
                accessibilityRole="button"
                onPress={() => setBodyPart(null)}
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
              <TextInput
                value={customPart}
                onChangeText={(t) => {
                  setCustomPart(t);
                  setBodyPart(t.trim() ? t.trim() : null);
                }}
                placeholder="…or type a custom body part"
                placeholderTextColor={colors.textMuted}
                style={{
                  marginTop: spacing.s,
                  minHeight: touchTarget,
                  borderRadius: radius,
                  backgroundColor: colors.surfaceAlt,
                  color: colors.text,
                  paddingHorizontal: spacing.m,
                  fontSize: fontSize.body,
                }}
              />
            </Card>

            {/* Exercises under the current body part */}
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
                  {exName || 'Add exercise…'}
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

            {/* Step 3 — commit this body part, continue or finish */}
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