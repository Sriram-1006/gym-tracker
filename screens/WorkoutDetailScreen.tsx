import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { useWorkoutStore } from '../stores/appStores';
import { computeSessionStrength, formatDisplayDate } from '../data/repositories';
import { Card, ConfirmDialog, EmptyState, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';

export function WorkoutDetailScreen({ route, navigation }: any) {
  const theme = useTheme();
  const { colors, spacing, fontSize } = theme;
  const insets = useSafeAreaInsets();
  const sessionId: string | undefined = route?.params?.sessionId;
  const sessions = useWorkoutStore((s) => s.sessions);
  const deleteSession = useWorkoutStore((s) => s.deleteSession);

  const session = sessions.find((s) => s.id === sessionId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const performDelete = () => {
    if (!session) return;
    setConfirmOpen(false);
    void deleteSession(session.id).then(() => {
      showToast('Workout deleted');
      // The entry no longer exists; return to the refreshed list.
      navigation.goBack();
    });
  };

  const confirmDelete = () => {
    if (!session) return;
    setConfirmOpen(true);
  };

  const header = (
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
        Workout
      </Text>
      {/* Action buttons: Edit | Delete */}
      {session ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit this workout"
            onPress={() => navigation.navigate('EditWorkout', { sessionId: session.id })}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="create-outline" size={20} color={colors.accent} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete this workout"
            onPress={confirmDelete}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <EmptyState message="This workout could not be found." />
      </View>
    );
  }

  const totalSets = session.bodyParts.reduce(
    (a, bp) => a + bp.exercises.reduce((x, e) => x + e.sets.length, 0),
    0,
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: spacing.m, paddingBottom: spacing.xl }}>
        <Card>
          <View style={styles.titleLine}>
            <Ionicons
              name={session.restDay ? 'moon' : 'barbell'}
              size={16}
              color={session.restDay ? colors.accent : colors.textMuted}
            />
            <Text style={{ color: colors.text, fontSize: fontSize.header, fontWeight: '800' }}>
              {session.restDay ? 'Rest day' : formatDisplayDate(session.date)}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: fontSize.caption }}>
            {session.restDay
              ? `${formatDisplayDate(session.date)} · marked as rest`
              : `${formatDisplayDate(session.date)} · ${totalSets} set${totalSets === 1 ? '' : 's'} · ${Math.round(
                  computeSessionStrength(session),
                )} volume`}
          </Text>
        </Card>

        {!session.restDay &&
          session.bodyParts.map((bp, i) => (
            <View key={`${bp.bodyPart}-${i}`}>
              <SectionTitle>{bp.bodyPart}</SectionTitle>
              {bp.exercises.map((ex, j) => (
                <Card key={`${ex.name}-${j}`} style={{ marginBottom: spacing.s }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                    {ex.name}
                  </Text>
                  {ex.sets.map((s, k) => (
                    <Text key={k} style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: 2 }}>
                      Set {k + 1}: {s.weight} kg × {s.reps} reps
                    </Text>
                  ))}
                </Card>
              ))}
            </View>
          ))}

        {session.restDay ? (
          <Card style={{ marginTop: spacing.m }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.body }}>
              This day is marked as rest — it keeps your streak alive and is not plotted on the
              strength graph.
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      {/* In-app confirm dialog (Alert.alert is a no-op on web). */}
      <ConfirmDialog
        visible={confirmOpen}
        title="Delete this workout?"
        message={
          session.restDay
            ? "This can't be undone. This removes the rest day marker."
            : "This can't be undone. This removes the workout."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={performDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
