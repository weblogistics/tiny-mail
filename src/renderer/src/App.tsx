import { useEffect } from 'react'
import { useMailStore } from './store/useMailStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { AccountSetupDialog } from './components/AccountSetupDialog'

export default function App(): JSX.Element {
  const init = useMailStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  useKeyboardShortcuts()

  const syncIntervalSeconds = useMailStore((s) => s.settings?.syncIntervalSeconds ?? 60)

  useEffect(() => {
    // Polling rather than IMAP IDLE: simpler and avoids issuing a second
    // command on a connection that's mid-FETCH (see the sync deadlock fix).
    const interval = setInterval(() => {
      const state = useMailStore.getState()
      for (const account of state.accounts) state.refreshMailboxes(account.id)
      state.syncSelectedMailbox()
    }, syncIntervalSeconds * 1000)
    return () => clearInterval(interval)
  }, [syncIntervalSeconds])

  return (
    <div className="app-shell">
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Sidebar />
        <MessageList />
        <ReadingPane />
        <AccountSetupDialog />
      </div>
    </div>
  )
}
