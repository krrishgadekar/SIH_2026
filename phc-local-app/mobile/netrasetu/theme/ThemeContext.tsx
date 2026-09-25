import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { light, dark, fonts, space, fontSize, Theme } from './tokens';

interface ThemeContextValue {
  theme: Theme;
  toggleContrast: () => void;
  setMode: (mode: Theme['mode']) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children, initialMode = 'light' }: { children: ReactNode; initialMode?: Theme['mode'] }) {
  const [mode, setMode] = useState<Theme['mode']>(initialMode);
  const value = useMemo<ThemeContextValue>(() => ({
    theme: { mode, c: mode === 'dark' ? dark : light, fonts, space, fontSize },
    toggleContrast: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
    setMode,
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/**
 * makeStyles(factory) -> hook returning styles for the current theme.
 * Styles are rebuilt only when the contrast mode changes.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T) {
  return function useStyles(): T {
    const { theme } = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
