import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { useTheme } from '../theme/ThemeContext';
import { useThemeStore } from '../theme/themeStore';
import { useWorkoutStore } from '../stores/appStores';
import { useDietStore } from '../stores/appStores';
import { useExerciseLibraryStore } from '../stores/exerciseLibraryStore';
import { exportAllData, importAllData } from '../data/repositories';
import { Button, Card, ConfirmDialog, SectionTitle } from '../components/ui';
import { showToast } from '../components/Toast';

export function SettingsScreen({ navigation }: any) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const [importDialog, setImportDialog] = useState<{
    visible: boolean;
    payload: unknown;
  } | null>(null);

  const handleExport = async () => {
    try {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `gym-tracker-backup-${dateStr}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Backup downloaded');
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          showToast('Sharing is not available on this device');
          return;
        }
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        file.write(json);
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Gym Tracker data',
        });
        showToast('Backup shared');
      }
    } catch (e) {
      console.error('Export failed:', e);
      showToast('Export failed');
    }
  };

  const handleImportPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = new File(result.assets[0].uri);
      const content = file.textSync();
      const parsed = JSON.parse(content);
      setImportDialog({ visible: true, payload: parsed });
    } catch (e) {
      console.error('Import pick failed:', e);
      showToast('Failed to read file');
    }
  };

  const handleImportConfirm = async () => {
    if (!importDialog) return;
    try {
      const counts = await importAllData(importDialog.payload);
      await Promise.all([
        useWorkoutStore.getState().hydrate(),
        useDietStore.getState().hydrate(),
        useExerciseLibraryStore.getState().hydrate(),
        useThemeStore.getState().hydrate(),
      ]);
      setImportDialog(null);
      showToast(`Imported ${counts.workouts} workouts and ${counts.dietLogs} diet logs`);
      navigation.navigate('WorkoutTabs');
    } catch (e) {
      console.error('Import failed:', e);
      showToast(e instanceof Error ? e.message : 'Import failed');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: spacing.l,
          },
        ]}
      >
        <Text style={{ color: colors.text, fontSize: fontSize.header, fontWeight: '800' }}>
          Settings
        </Text>
      </View>

      <View style={{ flex: 1, padding: spacing.m }}>
        <Card>
          <SectionTitle>Data</SectionTitle>
          <View style={styles.buttonRow}>
            <Button
              label="Export data"
              variant="primary"
              onPress={handleExport}
              style={{ flex: 1 }}
            />
            <Button
              label="Import data"
              variant="secondary"
              onPress={handleImportPick}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={styles.caption}>
            Export creates a JSON backup of all workouts, diet data, custom exercises, and theme
            preference. Import replaces all current data with the backup contents — this cannot be
            undone.
          </Text>
        </Card>
      </View>

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
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  caption: {
    color: '#888',
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
});