/**
 * ThemeToggle —— 主题切换（light / dark / auto）。
 * 用三枚图标按钮表达三种模式，aria-pressed 表示当前选中（颜色非唯一载体）。
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'auto', label: '跟随系统', icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="主题切换">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className="theme-toggle__btn"
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
