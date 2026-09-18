import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, SectionTitle } from './ui';
import { useTheme } from '../theme/ThemeContext';
import { BodyPartInput } from '../stores/appStores';

export interface WorkoutDraftEditorProps {
  draft: BodyPartInput[];
  expandedParts: Set<string>;
  onToggleExpansion: (bodyPartName: string) => void;
  onRemoveBodyPart: (bodyPartName: string) => void;
  onRemoveExercise: (bodyPartName: string, exerciseIndex: number) => void;
  onRemoveSet: (bodyPartName: string, exerciseIndex: number, setIndex: number) => void;
  onAddSet: (bodyPartName: string, exerciseIndex: number) => void;
  onUpdateSet: (bodyPartName: string, exerciseIndex: number, setIndex: number, patch: { weight?: number; reps?: number }) => void;
  onAddExercise: (bodyPartName: string, exerciseName: string) => void;
  openExercisePicker: (bodyPartName: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
  radius: number;
  touchTarget: number;
}

function formatSet(set: { weight: number; reps: number }) {
  return `${set.weight}kg × ${set.reps}`;
}

function ExerciseItem({
  bpName,
  ex,
  exIdx,
  onRemoveExercise,
  onRemoveSet,
  onAddSet,
  onUpdateSet,
  colors,
  spacing,
  fontSize,
  radius,
  touchTarget,
}: {
  bpName: string;
  ex: { name: string; sets: { weight: number; reps: number }[] };
  exIdx: number;
  onRemoveExercise: (bpName: string, exIdx: number) => void;
  onRemoveSet: (bpName: string, exIdx: number, setIdx: number) => void;
  onAddSet: (bpName: string, exIdx: number) => void;
  onUpdateSet: (bpName: string, exIdx: number, setIdx: number, patch: { weight?: number; reps?: number }) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
  radius: number;
  touchTarget: number;
}) {
  return (
    <View
      key={`${ex.name}-${exIdx}`}
      style={{ marginTop: spacing.m, paddingTop: spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
          {ex.name}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => onRemoveExercise(bpName, exIdx)} hitSlop={8}>
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
            value={String(s.weight)}
            onChangeText={(t: string) => {
              const num = Number(t) || 0;
              onUpdateSet(bpName, exIdx, j, { weight: num });
            }}
            keyboardType="decimal-pad"
            placeholder="kg"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.setInput,
              { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius },
            ]}
          />
          <TextInput
            value={String(s.reps)}
            onChangeText={(t: string) => {
              const num = Number(t) || 0;
              onUpdateSet(bpName, exIdx, j, { reps: num });
            }}
            keyboardType="number-pad"
            placeholder="reps"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.setInput,
              { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: radius },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove set ${j + 1}`}
            onPress={() => onRemoveSet(bpName, exIdx, j)}
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
          onPress={() => onAddSet(bpName, exIdx)}
          style={{ alignSelf: 'flex-start' }}
        />
      </View>
    </View>
  );
}

function ExpandedBodyPartCard({
  bp,
  index,
  onRemoveBodyPart,
  onRemoveExercise,
  onRemoveSet,
  onAddSet,
  onUpdateSet,
  onAddExercise,
  openExercisePicker,
  colors,
  spacing,
  fontSize,
  radius,
  touchTarget,
}: {
  bp: BodyPartInput;
  index: number;
  onRemoveBodyPart: (bodyPartName: string) => void;
  onRemoveExercise: (bodyPartName: string, exerciseIndex: number) => void;
  onRemoveSet: (bodyPartName: string, exerciseIndex: number, setIndex: number) => void;
  onAddSet: (bodyPartName: string, exerciseIndex: number) => void;
  onUpdateSet: (bodyPartName: string, exerciseIndex: number, setIndex: number, patch: { weight?: number; reps?: number }) => void;
  onAddExercise: (bodyPartName: string, exerciseName: string) => void;
  openExercisePicker: (bodyPartName: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
  radius: number;
  touchTarget: number;
}) {
  return (
    <View key={`${bp.bodyPart}-${index}`} style={{ marginBottom: spacing.m }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.s }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
            {bp.bodyPart}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onRemoveBodyPart(bp.bodyPart)}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={22} color={colors.destructive} />
          </Pressable>
        </View>

        {bp.exercises.map((ex, i) => (
          <ExerciseItem
            key={`${ex.name}-${i}`}
            bpName={bp.bodyPart}
            ex={ex}
            exIdx={i}
            onRemoveExercise={onRemoveExercise}
            onRemoveSet={onRemoveSet}
            onAddSet={onAddSet}
            onUpdateSet={onUpdateSet}
            colors={colors}
            spacing={spacing}
            fontSize={fontSize}
            radius={radius}
            touchTarget={touchTarget}
          />
        ))}

        {bp.exercises.length === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, textAlign: 'center', padding: spacing.m }}>
            No exercises yet
          </Text>
        )}

        {/* Add exercise at the bottom of expanded card */}
        <View style={{ marginTop: spacing.m, paddingTop: spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openExercisePicker(bp.bodyPart)}
            style={{
              minHeight: touchTarget,
              borderRadius: radius,
              backgroundColor: colors.surfaceAlt,
              justifyContent: 'center',
              paddingHorizontal: spacing.m,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Ionicons name="add" size={20} color={colors.accent} style={{ marginRight: spacing.s }} />
            <Text style={{ color: colors.text, fontSize: fontSize.body }}>Add exercise</Text>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

function CollapsedBodyPartRow({
  bp,
  index,
  onPress,
  colors,
  spacing,
  fontSize,
}: {
  bp: BodyPartInput;
  index: number;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  spacing: ReturnType<typeof useTheme>['spacing'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
}) {
  const totalSets = bp.exercises.reduce((a, ex) => a + ex.sets.length, 0);
  return (
    <Pressable
      key={`${bp.bodyPart}-${index}`}
      onPress={onPress}
      style={{ marginTop: spacing.s, paddingVertical: spacing.s }}
      hitSlop={16}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
            {bp.bodyPart}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
            {bp.exercises.length} exercise{bp.exercises.length !== 1 ? 's' : ''} · {totalSets} set{totalSets !== 1 ? 's' : ''}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

export function WorkoutDraftEditor({
  draft,
  expandedParts,
  onToggleExpansion,
  onRemoveBodyPart,
  onRemoveExercise,
  onRemoveSet,
  onAddSet,
  onUpdateSet,
  onAddExercise,
  openExercisePicker,
  colors,
  spacing,
  fontSize,
  radius,
  touchTarget,
}: WorkoutDraftEditorProps) {
  if (draft.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.m }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body, marginBottom: spacing.s }}>
        Body parts in this session
      </Text>
      {draft.map((bp, i) =>
        expandedParts.has(bp.bodyPart) ? (
          <ExpandedBodyPartCard
            key={`${bp.bodyPart}-${i}`}
            bp={bp}
            index={i}
            onRemoveBodyPart={onRemoveBodyPart}
            onRemoveExercise={onRemoveExercise}
            onRemoveSet={onRemoveSet}
            onAddSet={onAddSet}
            onUpdateSet={onUpdateSet}
            onAddExercise={onAddExercise}
            openExercisePicker={openExercisePicker}
            colors={colors}
            spacing={spacing}
            fontSize={fontSize}
            radius={radius}
            touchTarget={touchTarget}
          />
        ) : (
          <CollapsedBodyPartRow
            key={`${bp.bodyPart}-${i}`}
            bp={bp}
            index={i}
            onPress={() => onToggleExpansion(bp.bodyPart)}
            colors={colors}
            spacing={spacing}
            fontSize={fontSize}
          />
        ),
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  setInput: {
    minHeight: 44,
    paddingHorizontal: 10,
    fontSize: 15,
    flex: 1,
  },
});