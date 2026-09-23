import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';

import { ThemeContext } from '../../theme/ThemeContext';
import { getTheme, type ThemeMode } from '../../theme/theme';

/** Render a component/screen inside the themed context it expects. */
export function renderThemed(ui: React.ReactElement, mode: ThemeMode = 'light'): RenderResult {
  return render(<ThemeContext.Provider value={getTheme(mode)}>{ui}</ThemeContext.Provider>);
}

/** Minimal React Navigation prop stub for screens. */
export function fakeNavigation(overrides: Record<string, unknown> = {}) {
  return {
    goBack: vi.fn(),
    navigate: vi.fn(),
    popToTop: vi.fn(),
    push: vi.fn(),
    setOptions: vi.fn(),
    addListener: vi.fn(() => () => {}),
    ...overrides,
  };
}
