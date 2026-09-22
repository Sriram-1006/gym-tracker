import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { useThemeStore } from '../theme/themeStore';
import { useWorkoutStore } from '../stores/appStores';
import {
  computeSessionStrength,
  computeStreak,
  computeStrengthSeries,
  todayISO,
} from '../data/repositories';
import { WorkoutSession } from '../data/models';
import { Button, Card, ConfirmDialog, EmptyState, ModalSheet, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';
import { StrengthChart } from '../components/StrengthChart';

type DialogRequest = {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Optional for OK-only dialogs. */
  onConfirm?: () => void;
};

export function WorkoutHomeScreen({ navigation }: any) {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius } = theme;
  const insets = useSafeAreaInsets();
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const sessions = useWorkoutStore((s) => s.sessions);
  const toggleRestDay = useWorkoutStore((s) => s.toggleRestDay);
  const deleteSession = useWorkoutStore((s) => s.deleteSession);

  const today = todayISO();

  const strengthSeries = useMemo(() => computeStrengthSeries(sessions), [sessions]);
  const streak = useMemo(() => computeStreak(sessions, today), [sessions, today]);

  const todayIsRest = sessions.some((s) => s.date === today && s.restDay);
  const todayHasWorkout = sessions.some((s) => s.date === today && !s.restDay);

  const [formulaOpen, setFormulaOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);

  const summaryOf = (s: WorkoutSession) => {
    if (s.restDay) return 'Rest day';
    const totalSets = s.bodyParts.reduce(
      (acc, bp) => acc + bp.exercises.reduce((a, ex) => a + ex.sets.length, 0),
      0,
    );
    const parts = s.bodyParts.map((bp) => bp.bodyPart).join(', ');
    return `${parts || '—'} · ${totalSets} set${totalSets === 1 ? '' : 's'} · ${Math.round(
      computeSessionStrength(s),
    )} vol`;
};

/* ------------------------------- actions ------------------------------- */

  const handleRestPress = () => {
    if (todayIsRest) {
      // Un-marking = removing the rest marker; no confirmation needed.
      const marker = sessions.find((s) => s.date === today && s.restDay);
      if (marker) {
        void deleteSession(marker.id).then(() => showToast('Rest day unmarked'));
      }
      return;
    }
    if (todayHasWorkout) {
      setDialog({
        title: 'Cannot mark rest day',
        message:
          'You already logged a workout today. A day cannot be both a workout and a rest day.',
        confirmLabel: 'OK',
      });
      return;
    }
    setDialog({
      title: 'Mark today as a rest day?',
      message: 'Rest days keep your streak alive but add no volume.',
      confirmLabel: 'Mark rest day',
      onConfirm: () => {
        setDialog(null);
        void toggleRestDay(today).then((err) => {
          // Store-level guard is the source of truth; surface any rejection.
          if (err) showToast(err);
          else showToast('Today marked as rest');
        });
      },
    });
  };

  /* ------------------------------ rendering ------------------------------ */

  const renderItem = ({ item }: { item: WorkoutSession }) => (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View workout from ${item.date}`}
        onPress={() => navigation.navigate('WorkoutDetail', { sessionId: item.id })}
        style={styles.rowMain}
      >
        <View style={styles.rowTitleLine}>
          <Ionicons
            name={item.restDay ? 'moon' : 'barbell'}
            size={14}
            color={item.restDay ? colors.accent : colors.textMuted}
          />
          <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '700' }}>
            {item.restDay ? 'Rest day' : item.date}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 }}>
          {item.restDay ? `${item.date} · marked as rest` : summaryOf(item)}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header: app name + theme toggle (spec) */}
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
        <Text style={{ color: colors.text, fontSize: fontSize.header, fontWeight: '800' }}>
          Gym Tracker
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => navigation.navigate('Settings')}
            style={styles.iconButton}
          >
            <Ionicons name="settings-outline" size={20} color={colors.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle dark or light theme"
            onPress={toggleMode}
            style={styles.iconButton}
          >
            <Ionicons name={theme.mode === 'dark' ? 'sunny' : 'moon'} size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <FlatList
        contentContainerStyle={{ padding: spacing.m, paddingBottom: spacing.xl }}
        data={sessions}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={
          <View>
            <View style={styles.sectionTitleRow}>
              <SectionTitle>Strength</SectionTitle>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="How the strength score is calculated"
                onPress={() => setFormulaOpen(true)}
                style={styles.infoButton}
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <Card>
              <StrengthChart data={strengthSeries} />
            </Card>

            <SectionTitle>Streak</SectionTitle>
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flexShrink: 1, paddingRight: spacing.s }}>
                  <View style={styles.streakLine}>
                    <Ionicons name="flame" size={22} color={colors.accent} />
                    <Text
                      style={{ color: colors.text, fontSize: fontSize.header, fontWeight: '800' }}
                    >
                      {streak.current} day{streak.current === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 }}>
                    {streak.activeToday
                      ? 'Trained today — keep it going!'
                      : 'Rest days don’t break your streak.'}
                  </Text>
                </View>
                <Button
                  label={todayIsRest ? 'Unmark today as rest' : 'Mark today as rest day'}
                  variant={todayIsRest ? 'secondary' : 'ghost'}
                  onPress={handleRestPress}
                />
              </View>
            </Card>

            <SectionTitle>Previous workouts</SectionTitle>
          </View>
        }
        ListEmptyComponent={
          <EmptyState message="No workouts yet. Tap “Add workout” to log your first session." />
        }
        renderItem={renderItem}
      />

      <View
        style={[
          styles.footerCta,
          { paddingBottom: spacing.m + insets.bottom * 0, paddingHorizontal: spacing.m },
        ]}
      >
        <Button label="+ Add workout" onPress={() => navigation.navigate('AddWorkout')} />
      </View>

      {/* In-app confirm dialog (Alert.alert is a no-op on web). */}
      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel ?? 'OK'}
        destructive={dialog?.destructive}
        onConfirm={() => dialog?.onConfirm?.()}
        onCancel={() => setDialog(null)}
      />

      {/* Formula documentation — one tap away, but out of the main empty state. */}
      <ModalSheet visible={formulaOpen} onClose={() => setFormulaOpen(false)} title="Strength score">
        <Text style={{ color: colors.textMuted, fontSize: fontSize.body, lineHeight: 22 }}>
          A day's score is your total training volume: the sum of weight × reps across every set
          you logged that day. Heavier weights and more work both raise the score. Rest days are
          not plotted.
        </Text>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rowMain: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -28,
  },
  streakLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerCta: {
    paddingTop: 8,
  },
});
