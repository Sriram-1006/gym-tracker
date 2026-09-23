import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { useThemeStore } from '../theme/themeStore';
import { useWorkoutStore, useDietStore, useCurrentDraftStore } from '../stores/appStores';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { exportAllData, importAllData, validateBackupPayload } from '../data/repositories';
import { pickBackupText, saveBackupFile } from '../data/services/backupFile';
import { Button, Card, ConfirmDialog, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';

/**
 * Settings screen — custom header (never the native one), safe-area aware and
 * themed like every other screen. Back returns to whatever screen opened it.
 */
export function SettingsScreen({ navigation }: any) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const [importDialog, setImportDialog] = useState<{
    visible: boolean;
    payload: unknown;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    try {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const dateStr = payload.exportedAt.split('T')[0] ?? 'backup';
      const filename = `gym-tracker-backup-${dateStr}.json`;
      const outcome = await saveBackupFile(json, filename);
      showToast(outcome === 'downloaded' ? 'Backup downloaded' : 'Backup shared');
    } catch (e) {
      console.error('Export failed:', e);
      showToast(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const handleImportPick = async () => {
    try {
      const text = await pickBackupText();
      if (text == null) return;
      const parsed: unknown = JSON.parse(text);
      // Validate BEFORE the confirmation dialog so an invalid file can never
      // touch existing data (and the user gets a precise reason).
      validateBackupPayload(parsed);
      setImportDialog({ visible: true, payload: parsed });
    } catch (e) {
      console.error('Import pick failed:', e);
      showToast(
        e instanceof SyntaxError
          ? 'That file is not valid JSON'
          : e instanceof Error
          ? e.message
          : 'Failed to read file',
      );
    }
  };

  const handleImportConfirm = async () => {
    if (!importDialog) return;
    setBusy(true);
    try {
      const counts = await importAllData(importDialog.payload);
      await Promise.all([
        useWorkoutStore.getState().hydrate(),
        useDietStore.getState().hydrate(),
        useExerciseLibraryStore.getState().hydrate(),
        useCurrentDraftStore.getState().hydrate(),
        useThemeStore.getState().hydrate(),
      ]);
      setImportDialog(null);
      showToast(`Imported ${counts.workouts} workouts and ${counts.dietLogs} diet logs`);
    } catch (e) {
      console.error('Import failed:', e);
      showToast(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
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
        <Card>
          <SectionTitle>Data</SectionTitle>
          <View style={styles.buttonRow}>
            <Button
              label="Export data"
              variant="primary"
              onPress={handleExport}
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              label="Import data"
              variant="secondary"
              onPress={handleImportPick}
              disabled={busy}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginTop: spacing.m, lineHeight: 18 }}>
            Export creates a JSON backup of all workouts, diet data, custom exercises, and your
            theme preference. Import replaces all current data with the backup contents — this
            cannot be undone, and a failed import leaves your existing data untouched.
          </Text>
        </Card>
      </ScrollView>

      <ConfirmDialog
        visible={importDialog?.visible ?? false}
        title="Import backup?"
        message="Importing will replace ALL current workouts, diet data, and custom exercises with the contents of this file. This cannot be undone. Continue?"
        confirmLabel="Import"
        cancelLabel="Cancel"
        destructive={true}
        onConfirm={handleImportConfirm}
        onCancel={() => setImportDialog(null)}
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
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
