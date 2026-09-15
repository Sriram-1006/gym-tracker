import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin async wrapper over AsyncStorage. All persistence in the app funnels
 * through here (plus the repositories below), so swapping in a real backend
 * later means reimplementing these small services only — no UI changes.
 */
export const storageService = {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
