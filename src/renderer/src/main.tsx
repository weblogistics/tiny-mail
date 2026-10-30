import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ComposeStandalone } from './ComposeStandalone'
import './styles/global.css'

const isComposeWindow = window.location.hash === '#compose'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isComposeWindow ? <ComposeStandalone /> : <App />}</React.StrictMode>
)
