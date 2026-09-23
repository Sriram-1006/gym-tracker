import { afterEach, vi } from 'vitest';

/**
 * Global test setup.
 *
 * Only native-only / platform-specific modules are stubbed here. Logic and
 * store tests run in the `node` environment and never touch these, so the
 * stubs are inert for them.
 */

// Icon font component — rendering glyphs adds no value to behaviour tests.
vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// Safe-area insets are native; return sensible desktop values in tests.
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
  SafeAreaView: ({ children }: { children?: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The native date picker has no DOM implementation; the shared DatePickerField
// uses its own web branch, so a null component is enough here.
vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}));

// Reset the DOM between component tests (only meaningful in jsdom).
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
