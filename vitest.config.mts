import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * - Logic/store tests run in the default `node` environment.
 * - Component/screen tests opt into jsdom with a
 *   `// @vitest-environment jsdom` docblock and render through
 *   `@testing-library/react` backed by **react-native-web** (aliased below),
 *   so we exercise real user-facing behaviour without a native test runner.
 */
export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(new URL('./node_modules/react-native-web', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
