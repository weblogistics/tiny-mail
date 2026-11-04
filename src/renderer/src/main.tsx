import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ComposeStandalone } from './ComposeStandalone'
import { SettingsStandalone } from './SettingsStandalone'
import { useAppTheme } from './hooks/useAppTheme'
import './styles/global.css'

function Root(): JSX.Element {
  // Applies the chosen appearance (data-theme on <html>) in every window —
  // main, compose and settings all mount this same Root, so this is the one
  // place that needs to run regardless of whether a given window also shows
  // its own theme-toggle button.
  useAppTheme()

  if (window.location.hash === '#compose') return <ComposeStandalone />
  if (window.location.hash === '#settings') return <SettingsStandalone />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
