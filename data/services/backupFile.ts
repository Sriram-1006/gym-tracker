import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Platform-safe file I/O for backup export/import.
 *
 * The persistence layer stays AsyncStorage-only; this module is purely about
 * getting a JSON string to/from the OS. Native uses Expo's DocumentPicker +
 * FileSystem, web uses the browser's File API — the native-only APIs are never
 * invoked on web.
 */

export type ExportOutcome = 'downloaded' | 'shared';

/**
 * Write `json` to a file and hand it to the user (download on web, share on native).
 *
 * `onHandedOff` fires as soon as the file is handed to the OS — right before the
 * native share sheet opens (on web: right after the download starts). Callers use
 * it to drop their loading state; the returned promise settles later, once the
 * share/download flow has actually ended.
 */
export async function saveBackupFile(
  json: string,
  filename: string,
  onHandedOff?: () => void,
): Promise<ExportOutcome> {
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    onHandedOff?.();
    return 'downloaded';
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  onHandedOff?.();
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Gym Tracker data',
  });
  return 'shared';
}

/** Ask the user for a JSON file and return its raw text, or null if cancelled. */
export async function pickBackupText(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return await new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';

      const cleanup = () => input.remove();
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        file
          .text()
          .then((text) => {
            cleanup();
            resolve(text);
          })
          .catch(() => {
            cleanup();
            resolve(null);
          });
      };

      document.body.appendChild(input);
      input.click();

      // If the picker is dismissed, `onchange` never fires. Resolve null once
      // focus returns to the window so the UI doesn't hang.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (input.parentNode) {
            cleanup();
            resolve(null);
          }
        }, 300);
      };
      window.addEventListener('focus', onFocus);
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  return file.textSync();
}
