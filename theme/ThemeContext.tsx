import React, { createContext, useContext } from 'react';

import { Theme } from './theme';

export const ThemeContext = createContext<Theme>(undefined as unknown as Theme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useThemeColors() {
  return useTheme().colors;
}
