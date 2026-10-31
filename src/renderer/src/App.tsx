import { useEffect } from 'react'
import { useMailStore } from './store/useMailStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { StatusBar } from './components/StatusBar'
import { AccountSetupDialog } from './components/AccountSetupDialog'

export default function App(): JSX.Element {
  const init = useMailStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  useKeyboardShortcuts()

  const syncMode = useMailStore((s) => s.settings?.syncMode ?? 'interval')
  const syncIntervalSeconds = useMailStore((s) => s.settings?.syncIntervalSeconds ?? 60)

  useEffect(() => {
    // In 'push' mode the main process is already watching the selected
    // mailbox via IMAP IDLE (see ImapService.watchForNewMail) and pushes a
    // sync-progress event the moment new mail actually arrives, instead of
    // waiting for a timer — so skip polling for messages, but still check
    // less urgent things (mailbox list / unread counts across every
    // folder, not just the one being watched) periodically, and fall back
    // to a long-interval poll as a safety net in case IDLE silently died
    // or the server doesn't support it.
    const effectiveSeconds = syncMode === 'push' ? 300 : syncIntervalSeconds
    const interval = setInterval(() => {
      const state = useMailStore.getState()
      for (const account of state.accounts) state.refreshMailboxes(account.id)
      if (syncMode !== 'push') state.syncSelectedMailbox()
    }, effectiveSeconds * 1000)
    return () => clearInterval(interval)
  }, [syncMode, syncIntervalSeconds])

  return (
    <div className="app-shell">
      <Toolbar />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <Sidebar />
        <MessageList />
        <ReadingPane />
        <AccountSetupDialog />
      </div>
      <StatusBar />
    </div>
  )
}
