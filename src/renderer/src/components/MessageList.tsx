import { useMailStore } from '../store/useMailStore'
import type { MessageSummary } from '@shared/types'
import { IconFlagFilled, IconPaperclip } from './Icons'
import { formatMessageDate } from '../utils/formatDate'
import styles from './MessageList.module.css'

function senderLabel(msg: MessageSummary): string {
  const from = msg.from[0]
  if (!from) return '(unknown sender)'
  return from.name || from.address
}

export function MessageList(): JSX.Element {
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const selectedUid = useMailStore((s) => s.selectedUid)
  const messagesByKey = useMailStore((s) => s.messagesByKey)
  const searchResults = useMailStore((s) => s.searchResults)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const syncStatus = useMailStore((s) => s.syncStatus)
  const selectMessage = useMailStore((s) => s.selectMessage)

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const messages = searchResults ?? (key ? messagesByKey[key] ?? [] : [])
  const sync = key ? syncStatus[key] : undefined
  const syncing = sync && !sync.done

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <span>{searchResults ? `Results for "${searchQuery}"` : 'Date'}</span>
        {syncing && <span className={styles.syncing}>Updating… {sync.fetched}/{sync.total}</span>}
      </div>
      <div className={styles.scroll}>
        {messages.length === 0 && (
          <div className={styles.empty}>{searchResults ? 'No results' : 'No messages'}</div>
        )}
        {messages.map((msg) => {
          const active = msg.uid === selectedUid
          return (
            <button
              key={msg.uid}
              className={`${styles.row} ${active ? styles.active : ''} ${!msg.flags.seen ? styles.unread : ''}`}
              onClick={() => selectMessage(msg.uid)}
            >
              <span className={styles.dotColumn}>{!msg.flags.seen && <span className={styles.unreadDot} />}</span>
              <span className={styles.main}>
                <span className={styles.topLine}>
                  <span className={styles.sender}>{senderLabel(msg)}</span>
                  <span className={styles.date}>{formatMessageDate(msg.date)}</span>
                </span>
                <span className={styles.subjectLine}>
                  {msg.flags.flagged && <IconFlagFilled width={11} height={11} className={styles.flagIcon} />}
                  <span className={styles.subject}>{msg.subject || '(no subject)'}</span>
                  {msg.hasAttachments && <IconPaperclip width={12} height={12} className={styles.attachIcon} />}
                </span>
                <span className={styles.snippet}>{msg.snippet}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
