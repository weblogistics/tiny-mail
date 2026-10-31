import { useEffect, useState } from 'react'

export type ColorScheme = 'light' | 'dark'

function read(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// The app's own chrome already follows this via the CSS media query in
// global.css — this hook exists so the reading pane's JS-generated iframe
// srcDoc (which CSS media queries can't reach into) can know the same
// thing, to pick a sensible default for the per-message dark-mode toggle.
export function useSystemColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(read)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setScheme(read())
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return scheme
}
