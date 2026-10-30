import { useEffect } from 'react'
import { useMailStore } from './store/useMailStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { ComposeWindow } from './components/ComposeWindow'
import { AccountSetupDialog } from './components/AccountSetupDialog'

export default function App(): JSX.Element {
  const init = useMailStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  useKeyboardShortcuts()

  useEffect(() => {
    // Polling rather than IMAP IDLE: simpler and avoids issuing a second
    // command on a connection that's mid-FETCH (see the sync deadlock fix).
    const interval = setInterval(() => {
      const state = useMailStore.getState()
      for (const account of state.accounts) state.refreshMailboxes(account.id)
      state.syncSelectedMailbox()
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app-shell">
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Sidebar />
        <MessageList />
        <ReadingPane />
        <ComposeWindow />
        <AccountSetupDialog />
      </div>
    </div>
  )
}
