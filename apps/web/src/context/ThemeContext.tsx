/**
 * 主题上下文 —— light / dark / auto（DESIGN_SYSTEM §2：一套 token + 双模式）。
 *
 * - auto（默认）：跟随系统 `prefers-color-scheme`（tokens.css 的 @media 规则）；
 * - light/dark：在根元素写 `data-theme`（specificity 高于媒体查询，见 tokens.css）；
 * - 选择持久化到 localStorage。
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_KEY = 'vibe.theme';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  /** 循环切换 light → dark → auto → light */
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch {
    // localStorage 不可用 → auto
  }
  return 'auto';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 忽略写入失败
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      cycleTheme: () => setThemeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 <ThemeProvider> 内使用');
  return ctx;
}
