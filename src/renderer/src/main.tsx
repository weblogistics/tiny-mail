import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ComposeStandalone } from './ComposeStandalone'
import { SettingsStandalone } from './SettingsStandalone'
import './styles/global.css'

function Root(): JSX.Element {
  if (window.location.hash === '#compose') return <ComposeStandalone />
  if (window.location.hash === '#settings') return <SettingsStandalone />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
