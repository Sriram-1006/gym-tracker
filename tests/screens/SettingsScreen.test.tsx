// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const { storage, failOn } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  failOn: { key: null as string | null },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failOn.key === key) throw new Error('simulated write failure');
      storage.set(key, value);
    },
    removeItem: async (key: string) => void storage.delete(key),
  },
}));

// Platform-specific file APIs are mocked so the tests never touch the FS.
vi.mock('../../data/services/backupFile', () => ({
  saveBackupFile: vi.fn(),
  pickBackupText: vi.fn(),
}));

// Toasts are module-level events; spy on the emitter to assert user feedback.
vi.mock('../../components/Toast', () => ({
  showToast: vi.fn(),
}));

import { renderThemed, fakeNavigation } from '../helpers/render';
import { SettingsScreen } from '../../screens/SettingsScreen';
import { saveBackupFile, pickBackupText } from '../../data/services/backupFile';
import { showToast } from '../../components/Toast';
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

const EXISTING_WORKOUT = {
  id: 'keep',
  date: '2026-01-01',
  restDay: false,
  createdAt: 1,
  bodyParts: [],
};

beforeEach(() => {
  storage.clear();
  failOn.key = null;
  // Expected error paths are logged; keep the output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(saveBackupFile).mockReset();
  vi.mocked(saveBackupFile).mockResolvedValue('downloaded');
  vi.mocked(pickBackupText).mockReset();
  vi.mocked(pickBackupText).mockResolvedValue(null);
  vi.mocked(showToast).mockClear();
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

/** The value cell sitting next to a label in the import confirmation summary. */
function summaryValue(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe('SettingsScreen', () => {
  it('renders with the custom header and a working Back button', () => {
    const { navigation } = setup();
    expect(screen.getByText('Settings')).toBeTruthy();
    fireEvent.click(screen.getByText('‹ Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('export flow', () => {
  it('generates a backup file with a dated filename', async () => {
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    await waitFor(() => expect(saveBackupFile).toHaveBeenCalledTimes(1));
    const [json, filename] = vi.mocked(saveBackupFile).mock.calls[0];
    expect(filename).toMatch(/^gym-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json).exportVersion).toBe(1);
  });

  it('shows an exporting state while the backup file is being generated', async () => {
    let finish!: (outcome: 'shared') => void;
    vi.mocked(saveBackupFile).mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    expect(screen.getByText('Exporting backup...')).toBeTruthy();
    expect(screen.queryByText('Save your workout and diet data as a backup file')).toBeNull();

    await waitFor(() => expect(saveBackupFile).toHaveBeenCalledTimes(1));
    finish('shared');
    await waitFor(() => expect(screen.queryByText('Exporting backup...')).toBeNull());
    expect(screen.getByText('Save your workout and diet data as a backup file')).toBeTruthy();
  });

  it('stops loading once the share sheet opens and returns the row to normal when it closes', async () => {
    let finishShare!: (outcome: 'shared') => void;
    vi.mocked(saveBackupFile).mockImplementation((_json, _filename, onHandedOff) => {
      onHandedOff?.();
      return new Promise((resolve) => { finishShare = resolve; });
    });
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    expect(screen.getByText('Exporting backup...')).toBeTruthy();

    // The OS has the file now: no spinner while the sheet is on screen.
    await waitFor(() => expect(screen.queryByText('Exporting backup...')).toBeNull());
    expect(screen.getByText('Save your workout and diet data as a backup file')).toBeTruthy();
    expect(showToast).not.toHaveBeenCalled();

    // Share flow ended (shared or cancelled): the row is interactive again.
    finishShare('shared');
    await waitFor(() => {
      fireEvent.click(screen.getByText('Export Data'));
      expect(saveBackupFile).toHaveBeenCalledTimes(2);
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows no error when the share sheet is closed without sharing', async () => {
    vi.mocked(saveBackupFile).mockResolvedValue('shared');
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    await waitFor(() => expect(saveBackupFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Exporting backup...')).toBeNull());
    expect(screen.getByText('Save your workout and diet data as a backup file')).toBeTruthy();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('reports a browser download with a single toast', async () => {
    vi.mocked(saveBackupFile).mockResolvedValue('downloaded');
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Backup downloaded'));
  });

  it('shows a clear error and never claims success when export fails', async () => {
    vi.mocked(saveBackupFile).mockRejectedValue(new Error('Sharing is not available'));
    setup();
    fireEvent.click(screen.getByText('Export Data'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      "Couldn't export your backup. Please try again.",
    ));
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('import flow', () => {
  it('uses the file picker and rejects an invalid JSON file without touching data', async () => {
    vi.mocked(pickBackupText).mockResolvedValue('{ not json');
    setup();
    fireEvent.click(screen.getByText('Import Data'));

    await waitFor(() => expect(pickBackupText).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('Invalid Gym Tracker backup file.');
    expect(screen.queryByText('Import Backup?')).toBeNull();
    expect(storage.has('workouts.sessions.v1')).toBe(false);
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
  });

  it('rejects a structurally invalid backup before confirmation', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(
      JSON.stringify({ exportVersion: 1, exportedAt: '2026-09-20T10:00:00.000Z', data: { workouts: 'nope' } }),
    );
    setup();
    fireEvent.click(screen.getByText('Import Data'));

    await waitFor(() => expect(pickBackupText).toHaveBeenCalled());
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Invalid Gym Tracker backup file.'));
    expect(screen.queryByText('Import Backup?')).toBeNull();
    expect(storage.has('workouts.sessions.v1')).toBe(false);
  });

  it('requires confirmation and does nothing on Cancel', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import Data'));

    await waitFor(() => expect(screen.getByText('Import Backup?')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));

    expect(storage.has('workouts.sessions.v1')).toBe(false);
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows a summary of what the backup contains before importing', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import Data'));

    await waitFor(() => expect(screen.getByText('Import Backup?')).toBeTruthy());
    expect(summaryValue('Workouts')).toBe('1');
    expect(summaryValue('Diet logs')).toBe('1');
    expect(summaryValue('Custom exercises')).toBe('1');
    expect(screen.getByText('Your current app data will be replaced by this backup.')).toBeTruthy();
    // Nothing has been written yet — the user still has to confirm.
    expect(storage.has('workouts.sessions.v1')).toBe(false);
  });

  it('imports valid data, hydrates every store and confirms success', async () => {
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import Data'));
    await waitFor(() => expect(screen.getByText('Import Backup?')).toBeTruthy());
    fireEvent.click(screen.getByText('Import'));

    await waitFor(() => expect(useWorkoutStore.getState().sessions).toHaveLength(1));
    expect(useWorkoutStore.getState().sessions[0].id).toBe('w_imported');
    expect(useDietStore.getState().targets.protein).toBe(140);
    expect(useDietStore.getState().history).toHaveLength(1);
    expect(useExerciseLibraryStore.getState().custom.Chest).toEqual(['Custom Fly']);
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(showToast).toHaveBeenCalledWith('Backup imported successfully.');
    expect(JSON.parse(storage.get('diet.targets.v1')!)).toMatchObject({ protein: 140 });

    // The confirmation is dismissed once the import lands: a stray second tap
    // on Import cannot run the import again.
    fireEvent.click(screen.getByText('Import'));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('does not report success and keeps existing data when the import write fails', async () => {
    storage.set('workouts.sessions.v1', JSON.stringify([EXISTING_WORKOUT]));
    failOn.key = 'diet.logs.v1';
    vi.mocked(pickBackupText).mockResolvedValue(JSON.stringify(VALID_BACKUP));
    setup();
    fireEvent.click(screen.getByText('Import Data'));
    await waitFor(() => expect(screen.getByText('Import Backup?')).toBeTruthy());
    fireEvent.click(screen.getByText('Import'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Import failed while writing data. Your previous data was kept.',
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith('Backup imported successfully.');
    expect(JSON.parse(storage.get('workouts.sessions.v1')!)).toEqual([EXISTING_WORKOUT]);
    expect(useWorkoutStore.getState().sessions).toHaveLength(0);
    // The dialog stays open so the user can retry.
    expect(screen.getByText('Import Backup?')).toBeTruthy();
  });
});
