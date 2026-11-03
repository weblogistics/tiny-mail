import { useEffect, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import styles from './StatusBar.module.css'

const NOTICE_TIMEOUT_MS = 8000

function formatCount(n: number): string {
  return n.toLocaleString()
}

function formatSyncedAt(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function StatusBar(): JSX.Element {
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const messagesByKey = useMailStore((s) => s.messagesByKey)
  const syncStatus = useMailStore((s) => s.syncStatus)
  const accountStatus = useMailStore((s) => s.accountStatus)
  const accountStatusError = useMailStore((s) => s.accountStatusError)
  const isManualSyncing = useMailStore((s) => s.isManualSyncing)
  const isSearchingServer = useMailStore((s) => s.isSearchingServer)
  const searchResults = useMailStore((s) => s.searchResults)
  const lastSyncAt = useMailStore((s) => s.lastSyncAt)
  const statusNotice = useMailStore((s) => s.statusNotice)
  const setStatusNotice = useMailStore((s) => s.setStatusNotice)
  const [, setTick] = useState(0)

  // "Last checked: 3 minutes ago" is computed from a timestamp, so without
  // its own tick it would keep claiming "Just now" until something else
  // happened to re-render the bar.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  // Notices describe a moment ("that message is gone", "couldn't connect"),
  // so they expire rather than sitting there misrepresenting the current
  // state long after the fact.
  useEffect(() => {
    if (!statusNotice) return
    const timer = setTimeout(() => setStatusNotice(null), NOTICE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [statusNotice, setStatusNotice])

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const sync = key ? syncStatus[key] : undefined
  const syncing = Boolean(sync && !sync.done)
  const connection = selectedAccountId ? accountStatus[selectedAccountId] : undefined
  const connectionError = selectedAccountId ? accountStatusError[selectedAccountId] : undefined

  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const mailbox = boxes.find((b) => b.path === selectedMailboxPath)
  const loaded = key ? messagesByKey[key]?.length ?? 0 : 0

  let activity: string
  if (statusNotice) {
    activity = statusNotice
    // Actual activity always outranks a bare connection flag: a sync can
    // only be progressing over a connection that's genuinely working right
    // now, whatever a possibly-stale 'error' status claims — showing
    // "Connection error" over real download progress is exactly what made
    // it impossible to tell whether mail was still coming in.
  } else if (syncing && sync) {
    activity = sync.total ? `Downloading ${formatCount(sync.fetched)} of ${formatCount(sync.total)}…` : 'Downloading…'
  } else if (isSearchingServer) {
    activity = 'Searching the server…'
  } else if (isManualSyncing) {
    activity = 'Checking for mail…'
  } else if (connection === 'connecting') {
    activity = 'Connecting…'
  } else if (connection === 'error') {
    activity = connectionError ? `Connection error: ${connectionError}` : 'Connection error'
  } else if (lastSyncAt) {
    activity = `Last checked: ${formatSyncedAt(lastSyncAt)}`
  } else {
    activity = 'Idle'
  }

  let countLabel = ''
  if (searchResults) {
    countLabel = `${formatCount(searchResults.length)} result${searchResults.length === 1 ? '' : 's'}`
  } else if (mailbox) {
    // "Showing" rather than a bare total because the lookback setting means
    // the mailbox usually holds more than has been downloaded locally.
    const parts = [`${formatCount(mailbox.totalCount)} message${mailbox.totalCount === 1 ? '' : 's'}`]
    if (loaded && loaded < mailbox.totalCount) parts.unshift(`Showing ${formatCount(loaded)} of`)
    if (mailbox.unreadCount > 0) parts.push(`· ${formatCount(mailbox.unreadCount)} unread`)
    countLabel = parts.join(' ')
  }

  const busy = syncing || isManualSyncing || isSearchingServer || connection === 'connecting'

  return (
    <div className={styles.bar}>
      <span
        className={`${styles.dot} ${
          connection === 'error' ? styles.dotError : connection === 'online' ? styles.dotOnline : styles.dotIdle
        }`}
      />
      <span
        className={`${styles.activity} ${statusNotice ? styles.notice : ''} ${busy ? styles.busy : ''}`}
        title={connection === 'error' && connectionError ? connectionError : undefined}
      >
        {activity}
      </span>
      <span className={styles.spacer} />
      <span className={styles.counts}>{countLabel}</span>
    </div>
  )
}
