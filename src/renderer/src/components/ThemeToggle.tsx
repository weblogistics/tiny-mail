import { useAppTheme, type ThemeSetting } from '../hooks/useAppTheme'
import { IconMoon, IconSun } from './Icons'

const NEXT: Record<ThemeSetting, ThemeSetting> = { system: 'light', light: 'dark', dark: 'system' }

const LABEL: Record<ThemeSetting, string> = {
  system: 'Matching your system setting',
  light: 'Light',
  dark: 'Dark'
}

interface ThemeToggleProps {
  className?: string
}

// Cycles System -> Light -> Dark -> System. The icon always reflects the
// currently *effective* appearance (so under "System" it shows whichever of
// sun/moon the OS is actually resolved to right now), while the tooltip
// spells out whether that's an explicit choice or just following the OS.
export function ThemeToggle({ className }: ThemeToggleProps): JSX.Element {
  const { theme, effective, setTheme } = useAppTheme()

  return (
    <button
      className={className}
      title={`Appearance: ${LABEL[theme]}`}
      onClick={() => setTheme(NEXT[theme])}
    >
      {effective === 'dark' ? <IconMoon /> : <IconSun />}
    </button>
  )
}
