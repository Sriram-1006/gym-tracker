import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { useThemeStore } from '../theme/themeStore';
import { useWorkoutStore, useDietStore, useCurrentDraftStore } from '../stores/appStores';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { exportAllData, importAllData, validateBackupPayload, type BackupPayload } from '../data/repositories';
import { pickBackupText, saveBackupFile } from '../data/services/backupFile';
import { Card, ConfirmDialog, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';

/**
 * Settings screen — custom header (never the native one), safe-area aware and
 * themed like every other screen. Back returns to whatever screen opened it.
 *
 * The DATA & BACKUP section runs the two OS-driven flows:
 *  - Export: build the JSON backup, then hand the file to the system share
 *    sheet (native) or a browser download (web) — the app never picks a
 *    destination. The loading state covers file generation only: it ends as
 *    soon as the OS takes over, and closing the share sheet is not an error.
 *  - Import: system file picker → read → validate → summary confirmation →
 *    replace data. Nothing is written before the user confirms.
 */

type BackupStatus = 'idle' | 'exporting' | 'sharing' | 'reading' | 'importing';

const EXPORT_ERROR = "Couldn't export your backup. Please try again.";
const INVALID_BACKUP_ERROR = 'Invalid Gym Tracker backup file.';

export function SettingsScreen({ navigation }: any) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const [importDialog, setImportDialog] = useState<BackupPayload | null>(null);
  const [status, setStatus] = useState<BackupStatus>('idle');
  const busy = status !== 'idle';

  const handleExport = async () => {
    if (busy) return;
    setStatus('exporting');
    try {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const dateStr = payload.exportedAt.split('T')[0] ?? 'backup';
      const filename = `gym-tracker-backup-${dateStr}.json`;
      // As soon as the OS has the file (share sheet open / download started)
      // the loading state ends; cancelling the sheet is not an error — the
      // promise just settles without us reporting anything.
      const outcome = await saveBackupFile(json, filename, () => setStatus('sharing'));
      // Native: the share sheet itself is the confirmation — no second popup.
      // Web: the download is silent, so a single toast confirms it happened.
      if (outcome === 'downloaded') showToast('Backup downloaded');
    } catch (e) {
      console.error('Export failed:', e);
      showToast(EXPORT_ERROR);
    } finally {
      setStatus('idle');
    }
  };

  const handleImportPick = async () => {
    if (busy) return;
    setStatus('reading');
    try {
      const text = await pickBackupText();
      if (text == null) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
        // Validate BEFORE the confirmation dialog so an invalid file can never
        // touch existing data. Any parse/validation problem gets one clear
        // message; the specific reason goes to the console.
        validateBackupPayload(parsed);
      } catch (e) {
        console.error('Invalid backup file:', e);
        showToast(INVALID_BACKUP_ERROR);
        return;
      }
      setImportDialog(parsed);
    } catch (e) {
      console.error('Import pick failed:', e);
      showToast(e instanceof Error ? e.message : 'Failed to read file');
    } finally {
      setStatus('idle');
    }
  };

  const handleImportConfirm = async () => {
    if (!importDialog || status === 'importing') return;
    setStatus('importing');
    try {
      await importAllData(importDialog);
      await Promise.all([
        useWorkoutStore.getState().hydrate(),
        useDietStore.getState().hydrate(),
        useExerciseLibraryStore.getState().hydrate(),
        useCurrentDraftStore.getState().hydrate(),
        useThemeStore.getState().hydrate(),
      ]);
      setImportDialog(null);
      showToast('Backup imported successfully.');
    } catch (e) {
      // Never report success here: importAllData only throws when the data
      // was left unchanged (or rolled back).
      console.error('Import failed:', e);
      showToast(e instanceof Error ? e.message : 'Import failed. Your existing data was kept.');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Custom header — matches the rest of the app. */}
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
          onPress={() => navigation.goBack()}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>‹ Back</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: fontSize.title, fontWeight: '800' }}>
          Settings
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.m, paddingBottom: spacing.xl }}>
        <SectionTitle>{'Data & backup'}</SectionTitle>
        <View style={{ gap: spacing.s }}>
          <BackupActionCard
            title="Export Data"
            description="Save your workout and diet data as a backup file"
            busy={status === 'exporting'}
            busyLabel="Exporting backup..."
            disabled={busy}
            onPress={handleExport}
          />
          <BackupActionCard
            title="Import Data"
            description="Restore your data from a backup file"
            busy={status === 'reading' || status === 'importing'}
            busyLabel={status === 'importing' ? 'Importing backup...' : 'Reading backup file...'}
            disabled={busy}
            onPress={handleImportPick}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={importDialog !== null}
        title="Import Backup?"
        confirmLabel={status === 'importing' ? 'Importing…' : 'Import'}
        cancelLabel="Cancel"
        destructive={true}
        onConfirm={handleImportConfirm}
        onCancel={() => {
          if (status === 'importing') return;
          setImportDialog(null);
        }}
      >
        {importDialog ? <BackupSummary payload={importDialog} /> : null}
      </ConfirmDialog>
    </View>
  );
}

/** One tappable DATA & BACKUP row: title, description and a trailing chevron. */
function BackupActionCard({
  title,
  description,
  busy,
  busyLabel,
  disabled,
  onPress,
}: {
  title: string;
  description: string;
  busy: boolean;
  busyLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={disabled || busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionRow,
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '700' }}>
            {title}
          </Text>
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.xs }}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: fontSize.caption, flexShrink: 1 }}>
                {busyLabel}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.caption,
                lineHeight: 18,
                marginTop: spacing.xs,
              }}
            >
              {description}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </Card>
  );
}

/**
 * Counts shown in the import confirmation (label left, value right) so the
 * user can see what they are about to import before replacing their data.
 */
function BackupSummary({ payload }: { payload: BackupPayload }) {
  const { colors, spacing, fontSize } = useTheme();
  const customExercises = Object.values(payload.data.customExercises).reduce(
    (total, names) => total + names.length,
    0,
  );
  const rows: Array<[string, number]> = [
    ['Workouts', payload.data.workouts.length],
    ['Diet logs', payload.data.dietLogs.length],
    ['Custom exercises', customExercises],
  ];
  return (
    <View>
      {rows.map(([label, value]) => (
        <View
          key={label}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: fontSize.body }}>{label}</Text>
          <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '700' }}>{value}</Text>
        </View>
      ))}
      <Text
        style={{
          color: colors.textMuted,
          fontSize: fontSize.caption,
          lineHeight: 18,
          marginTop: spacing.s,
        }}
      >
        Your current app data will be replaced by this backup.
      </Text>
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
});
