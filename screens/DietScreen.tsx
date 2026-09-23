import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { useDietStore, DEFAULT_TARGETS } from '../stores/appStores';
import { formatDisplayDateShort, selectHistoricalLogs } from '../data/repositories';
import { Button, Card, EmptyState, ProgressBar, SectionTitle } from '../components/ui';
import { MacroKey } from '../data/models';
import { Ionicons } from '@expo/vector-icons';

const MACROS: { key: MacroKey; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fats', label: 'Fats' },
  { key: 'fiber', label: 'Fiber' },
];

type FormState = Record<MacroKey, string>;

const emptyForm: FormState = { protein: '', carbs: '', fats: '', fiber: '' };

function toFormValues(grams: Record<MacroKey, number>): FormState {
  return {
    protein: String(grams.protein || ''),
    carbs: String(grams.carbs || ''),
    fats: String(grams.fats || ''),
    fiber: String(grams.fiber || ''),
  };
}

/**
 * Diet screen (spec):
 *  - First-time state: "Add diet" button opens the target setup form.
 *  - After setup (one-time): macro rows with target grams, progress bar and
 *    percentage; "Edit" replaces "Add diet" and reopens the same form.
 *  - Each macro row has a "+" to log intake for today.
 */
export function DietScreen() {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;
  const insets = useSafeAreaInsets();

  const targets = useDietStore((s) => s.targets);
  const todayLog = useDietStore((s) => s.todayLog);
  const setupTargets = useDietStore((s) => s.setupTargets);
  const addToLog = useDietStore((s) => s.addToLog);
  const resetTodayLog = useDietStore((s) => s.resetTodayLog);
  const history = useDietStore((s) => s.history);
  // Previous days only — today is shown by the dedicated intake UI above.
  const historicalLogs = useMemo(() => selectHistoricalLogs(history), [history]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const [logOpenFor, setLogOpenFor] = useState<MacroKey | null>(null);
  const [logValue, setLogValue] = useState('');

  const openSetupForm = () => {
    setForm(toFormValues(DEFAULT_TARGETS));
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = () => {
    setForm(toFormValues(targets));
    setFormError(null);
    setFormOpen(true);
  };

  const saveForm = async () => {
    const parsed: Record<MacroKey, number> = {
      protein: Number(form.protein) || 0,
      carbs: Number(form.carbs) || 0,
      fats: Number(form.fats) || 0,
      fiber: Number(form.fiber) || 0,
    };
    if (parsed.protein <= 0 && parsed.carbs <= 0 && parsed.fats <= 0 && parsed.fiber <= 0) {
      setFormError('Enter a target for at least one macro.');
      return;
    }
    await setupTargets(parsed);
    setFormOpen(false);
  };

  const saveLog = async () => {
    if (!logOpenFor) return;
    const grams = Number(logValue.replace(',', '.')) || 0;
    if (grams <= 0) {
      setLogOpenFor(null);
      setLogValue('');
      return;
    }
    await addToLog({ [logOpenFor]: grams });
    setLogOpenFor(null);
    setLogValue('');
  };

  /* ------------------------------- setup form ---------------------------- */

  const renderForm = () => (
    <Card>
      <Text style={{ color: colors.text, fontSize: fontSize.body, marginBottom: spacing.s }}>
        Set your daily gram targets. You can change these later with Edit.
      </Text>
      {MACROS.map((m) => (
        <View key={m.key} style={{ marginBottom: spacing.s }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginBottom: 4 }}>
            {m.label} (g/day)
          </Text>
          <TextInput
            value={form[m.key]}
            onChangeText={(t) => setForm((f) => ({ ...f, [m.key]: t }))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={{
              minHeight: touchTarget,
              borderRadius: radius,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              paddingHorizontal: spacing.m,
              fontSize: fontSize.body,
            }}
          />
        </View>
      ))}
      {formError ? (
        <Text style={{ color: colors.destructive, fontSize: fontSize.caption, marginBottom: spacing.s }}>
          {formError}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.s }}>
        <Button label="Cancel" variant="ghost" onPress={() => setFormOpen(false)} />
        <Button label="Save targets" onPress={saveForm} style={{ flex: 1 }} />
      </View>
    </Card>
  );

  /* ------------------------------ macro rows ----------------------------- */

  const renderMacroRow = (m: { key: MacroKey; label: string }) => {
    const target = targets[m.key] || 0;
    const consumed = todayLog[m.key] || 0;
    const pct = target > 0 ? Math.round((consumed / target) * 100) : 0;
    return (
      <Card key={m.key} style={{ marginBottom: spacing.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Name + grams */}
          <View style={{ flex: 1, paddingRight: spacing.s }}>
            <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '700' }}>
              {m.label}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
              {consumed}g / {target}G
            </Text>
          </View>

          {/* Percent + quick log */}
          <Text
            style={{
              color: pct >= 100 ? colors.accent : colors.text,
              fontSize: fontSize.body,
              fontWeight: '700',
              marginRight: spacing.s,
              minWidth: 44,
              textAlign: 'right',
            }}
          >
            {pct}%
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log ${m.label} intake`}
            onPress={() => {
              setLogOpenFor(m.key);
              setLogValue('');
            }}
            style={{
              minHeight: touchTarget,
              minWidth: touchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius,
              backgroundColor: colors.accentMuted,
            }}
          >
            <Ionicons name="add" size={24} color={colors.accent} />
          </Pressable>
        </View>

        <View style={{ marginTop: spacing.s }}>
          <ProgressBar ratio={target > 0 ? consumed / target : 0} />
        </View>

        {/* Inline log input for this macro */}
        {logOpenFor === m.key ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.s }}>
            <TextInput
              value={logValue}
              onChangeText={setLogValue}
              keyboardType="decimal-pad"
              placeholder={`Grams of ${m.label.toLowerCase()}…`}
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1,
                minHeight: touchTarget,
                borderRadius: radius,
                backgroundColor: colors.surfaceAlt,
                color: colors.text,
                paddingHorizontal: spacing.m,
                fontSize: fontSize.body,
              }}
            />
            <Button label="Add" size="sm" onPress={saveLog} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel logging"
              onPress={() => {
                setLogOpenFor(null);
                setLogValue('');
              }}
              style={{
                minHeight: 36,
                minWidth: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={20} color={colors.accent} />
            </Pressable>
          </View>
        ) : null}
      </Card>
    );
  };

  /* -------------------------------- screen ------------------------------- */

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
        <Text style={{ color: colors.text, fontSize: fontSize.header, fontWeight: '800' }}>
          Diet
        </Text>
        {targets.isSetup ? (
          <Pressable
            accessibilityRole="button"
            onPress={openEditForm}
            style={{ minHeight: touchTarget, minWidth: 64, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.accent, fontSize: fontSize.body, fontWeight: '700' }}>Edit</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.m, paddingBottom: spacing.xl }}>
        {!targets.isSetup ? (
          <>
            <SectionTitle>Get started</SectionTitle>
            {formOpen ? (
              renderForm()
            ) : (
              <Card>
                <EmptyState message="You haven’t set up your diet yet. Set daily gram targets for protein, carbs, fats and fiber to start tracking." />
                <Button label="Add diet" onPress={openSetupForm} />
              </Card>
            )}
          </>
        ) : (
          <>
            {/* Edit form (also reachable after setup) */}
            {formOpen ? (
              <>
                <SectionTitle>Edit targets</SectionTitle>
                {renderForm()}
              </>
            ) : null}

            <SectionTitle>Today’s intake</SectionTitle>
            {MACROS.map(renderMacroRow)}

            <Card style={{ marginTop: spacing.s }}>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                Tap “+” on a macro row to log grams you ate. Percentages compare today’s logged
                intake against your daily target.
              </Text>
              {(todayLog.protein || todayLog.carbs || todayLog.fats || todayLog.fiber) > 0 ? (
                <Button
                  label="Reset today’s log"
                  variant="ghost"
                  size="sm"
                  onPress={() => resetTodayLog()}
                  style={{ marginTop: spacing.s, alignSelf: 'flex-start' }}
                />
              ) : null}
            </Card>

            {/* History is read-only and visually secondary to today. */}
            <SectionTitle>Diet history</SectionTitle>
            {historicalLogs.length === 0 ? (
              <Card>
                <EmptyState message="No previous diet logs yet." />
              </Card>
            ) : (
              historicalLogs.map((log) => (
                <Card key={log.date} style={{ marginBottom: spacing.s }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.body }}>
                    {formatDisplayDateShort(log.date)}
                  </Text>
                  {MACROS.map((m) => {
                    const target = targets[m.key] || 0;
                    const consumed = log[m.key] || 0;
                    const pct = target > 0 ? Math.round((consumed / target) * 100) : 0;
                    return (
                      <View
                        key={m.key}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                          {m.label}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                          {consumed} / {target}g{target > 0 ? ` · ${pct}%` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
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
});
