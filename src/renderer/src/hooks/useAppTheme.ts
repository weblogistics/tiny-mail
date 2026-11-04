import { useCallback, useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { useSystemColorScheme, type ColorScheme } from './useSystemColorScheme'

export type ThemeSetting = AppSettings['theme']

// Single source of truth for the app's appearance, usable from any window —
// main, compose and settings all share one renderer bundle and one
// global.css, so applying 'data-theme' to <html> here affects all of them.
// Stays in sync across windows via the existing settings-updated broadcast,
// so changing it in one window updates the others live.
export function useAppTheme(): {
  theme: ThemeSetting
  effective: ColorScheme
  setTheme: (theme: ThemeSetting) => void
} {
  const [theme, setThemeState] = useState<ThemeSetting>('system')
  const systemScheme = useSystemColorScheme()

  useEffect(() => {
    window.api.settings.get().then((s) => setThemeState(s.theme))
    return window.api.events.subscribe((payload) => {
      if (payload.type === 'settings-updated') setThemeState(payload.data.theme)
    })
  }, [])

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next)
    window.api.settings.update({ theme: next })
  }, [])

  return { theme, effective: theme === 'system' ? systemScheme : theme, setTheme }
}
