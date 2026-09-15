export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentText: string;
  accentMuted: string;
  progressTrack: string;
  destructive: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: {
    xs: number;
    s: number;
    m: number;
    l: number;
    xl: number;
  };
  fontSize: {
    caption: number;
    body: number;
    title: number;
    header: number;
  };
  touchTarget: number;
  radius: number;
}

const shared = {
  spacing: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  fontSize: { caption: 12, body: 15, title: 18, header: 24 },
  // Every button, row and tab respects this minimum (spec: min 44px).
  touchTarget: 44,
  radius: 12,
};

export const lightTheme: Theme = {
  mode: 'light',
  ...shared,
  colors: {
    background: '#f4f5f7',
    surface: '#ffffff',
    surfaceAlt: '#eceef1',
    text: '#111827',
    // #4b5563 = gray-600: ≥4.5:1 on white/#f4f5f7 surfaces (gray-500 #6b7280
    // sat below 4.5:1 on white — too light for secondary body text).
    textMuted: '#4b5563',
    border: '#d7dbe0',
    accent: '#2563eb',
    accentText: '#ffffff',
    accentMuted: '#bfdbfe',
    progressTrack: '#e5e7eb',
    // #b91c1c = red-700: white "Delete"/"accentText" label clears 4.5:1;
    // red-600 #dc2626 did not.
    destructive: '#b91c1c',
  },
};

export const darkTheme: Theme = {
  mode: 'dark',
  ...shared,
  colors: {
    background: '#0f1115',
    surface: '#1a1d23',
    surfaceAlt: '#242830',
    text: '#f3f4f6',
    textMuted: '#9ca3af',
    border: '#33383f',
    accent: '#60a5fa',
    accentText: '#0f1115',
    accentMuted: '#1e3a5f',
    progressTrack: '#2a2e36',
    destructive: '#f87171',
  },
};

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}

export const defaultThemeMode: ThemeMode = 'light';
