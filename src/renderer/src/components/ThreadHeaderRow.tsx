import type { MessageThread } from '../utils/threadMessages'
import { IconChevronDown, IconChevronRight, IconFlagFilled } from './Icons'
import styles from './MessageList.module.css'

interface ThreadHeaderRowProps {
  thread: MessageThread
  expanded: boolean
  onToggle: () => void
}

export function ThreadHeaderRow({ thread, expanded, onToggle }: ThreadHeaderRowProps): JSX.Element {
  const latest = thread.messages[thread.messages.length - 1]
  const unreadCount = thread.messages.filter((m) => !m.flags.seen).length
  const anyFlagged = thread.messages.some((m) => m.flags.flagged)

  return (
    <button className={`${styles.threadHeader} ${unreadCount > 0 ? styles.unread : ''}`} onClick={onToggle}>
      <span className={styles.threadDisclosure}>
        {expanded ? <IconChevronDown width={11} height={11} /> : <IconChevronRight width={11} height={11} />}
      </span>
      {anyFlagged && <IconFlagFilled width={11} height={11} className={styles.flagIcon} />}
      <span className={styles.threadSubject}>{latest.subject || '(no subject)'}</span>
      <span className={styles.threadCount}>{thread.messages.length}</span>
    </button>
  )
}
