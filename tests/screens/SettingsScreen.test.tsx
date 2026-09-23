// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const { storage } = vi.hoisted(() => ({ storage: new Map<string, string>() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

// Platform-specific file APIs are mocked so the tests never touch the FS.
vi.mock('../../data/services/backupFile', () => ({
  saveBackupFile: vi.fn(async () => 'downloaded'),
  pickBackupText: vi.fn(async () => null),
}));

import { renderThemed, fakeNavigation } from '../helpers/render';
import { SettingsScreen } from '../../screens/SettingsScreen';
import { saveBackupFile, pickBackupText } from '../../data/services/backupFile';
import { useWorkoutStore, useDietStore } from '../../stores/appStores';
import { useExerciseLibraryStore } from '../../stores/exerciseLibraryStore';
import { useThemeStore } from '../../theme/themeStore';

const VALID_BACKUP = {
  exportVersion: 1,
  exportedAt: '2026-09-20T10:00:00.000Z',
  data: {
    workouts: [
      {
        id: 'w_imported',
        date: '2026-09-11',
        restDay: false,
        createdAt: 1,
        bodyParts: [
          { bodyPart: 'Chest', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] }] },
        ],
      },
    ],
    dietTargets: { protein: 140, carbs: 250, fats: 70, fiber: 30, isSetup: true },
    dietLogs: [{ date: '2026-09-10', protein: 80, carbs: 100, fats: 20, fiber: 10 }],
    customExercises: { Chest: ['Custom Fly'] },
    themeMode: 'dark',
  },
};

beforeEach(() => {
  storage.clear();
  // Expected error paths are logged; keep the output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(saveBackupFile).mockClear();
  vi.mocked(pickBackupText).mockReset();
  vi.mocked(pickBackupText).mockResolvedValue(null);
  useWorkoutStore.setState({ sessions: [], hydrated: false });
  useDietStore.setState({
    targets: { protein: 0, carbs: 0, fats: 0, fiber: 0, isSetup: false },
    todayLog: { date: '2026-09-20', protein: 0, carbs: 0, fats: 0, fiber: 0 },
    history: [],
    hydrated: false,
  });
  useExerciseLibraryStore.setState({ custom: {}, hydrated: false });
  useThemeStore.setState({ mode: 'light', hydrated: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  const navigation = fakeNavigation();
  renderThemed(<SettingsScreen navigation={navigation} />);
  return { navigation };
}

describe('SettingsScreen', () => {
  it('renders with the custom header and a working Back button', () => {
    const { navigation } = setup();
    expect(screen.getByText('Settings')).toBeTruthy();
    fireEvent.click(screen.getByText('‹ Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('exports a backup through the file service', async () => {
    setup();
    fireEvent.click(screen.getByText('Export data'));

    await waitFor(() => expect(saveBackupFile).toHaveBeenCalledTimes(1));
    const [json, filename] = vi.mocked(saveBackupFile).mock.calls[0];
    expect(filename).toMatch(/^gym-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json).exportVersion).toBe(1);
  });

  it('rejects an invalid JSON file without touching data', async () => {
    vi.mocked(pickBackupText).mockResolvedValue('{ not json');
    setup();
    fireEvent.click(screen.getByText('Import data'));

    await waitFor(() => expect(pickBackupText).toHaveBeenCalled());
    expect(screen.queryByText('Import backup?')).toBeNull();
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('rejects a structurally invalid backup before confirmation', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(
      JSON.stringify({ exportVersion: 1, exportedAt: '2026-09-20T10:00:00.000Z', data: { workouts: 'nope' } }),
    );
    setup();
    fireEvent.click(screen.getByText('Import data'));

    await waitFor(() => expect(pickBackupText).toHaveBeenCalled());
    expect(screen.queryByText('Import backup?')).toBeNull();
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('requires confirmation and does nothing on Cancel', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import data'));

    await waitFor(() => expect(screen.getByText('Import backup?')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));

    expect(storage.has('workouts.sessions.v1')).toBe(false);
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('imports valid data and hydrates every store', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import data'));
    await waitFor(() => expect(screen.getByText('Import backup?')).toBeTruthy());
    fireEvent.click(screen.getByText('Import'));

    await waitFor(() => expect(useWorkoutStore.getState().sessions).toHaveLength(1));
    expect(useWorkoutStore.getState().sessions[0].id).toBe('w_imported');
    expect(useDietStore.getState().targets.protein).toBe(140);
    expect(useDietStore.getState().history).toHaveLength(1);
    expect(useExerciseLibraryStore.getState().custom.Chest).toEqual(['Custom Fly']);
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});
