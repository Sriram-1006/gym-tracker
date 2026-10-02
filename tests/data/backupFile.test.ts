import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentAsync } = vi.hoisted(() => ({
  getDocumentAsync: vi.fn<(options: Record<string, unknown>) => Promise<unknown>>(),
}));

// Native path only: the web branch never reaches DocumentPicker.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: (options: Record<string, unknown>) => getDocumentAsync(options),
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;
    constructor(public uri: string) {}
    delete() {}
    create() {}
    write() {}
    textSync() {
      return 'FILE_TEXT';
    }
  },
  Paths: { cache: '/cache' },
}));

import { pickBackupText } from '../../data/services/backupFile';

beforeEach(() => {
  getDocumentAsync.mockReset();
});

describe('pickBackupText (native)', () => {
  it('lets the user choose any file — content is validated after picking', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true });

    await pickBackupText();

    // The old `application/json` filter hid backups whose provider reported a
    // different (or no) MIME type; Settings deep-validates the text anyway.
    expect(getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: '*/*', copyToCacheDirectory: true }),
    );
  });

  it('returns null when the picker is cancelled', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true });

    await expect(pickBackupText()).resolves.toBeNull();
    expect(getDocumentAsync).toHaveBeenCalledTimes(1);
  });

  it('returns the picked file text', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/gym-tracker-backup.json' }],
    });

    await expect(pickBackupText()).resolves.toBe('FILE_TEXT');
  });
});
