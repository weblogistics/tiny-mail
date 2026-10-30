import { useEffect } from 'react'
import { useMailStore } from './store/useMailStore'
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
