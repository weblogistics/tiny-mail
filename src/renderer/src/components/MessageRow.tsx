import type { MessageSummary } from '@shared/types'
import { IconFlagFilled, IconPaperclip } from './Icons'
import { formatMessageDate } from '../utils/formatDate'
import styles from './MessageList.module.css'

function senderLabel(msg: MessageSummary): string {
  const from = msg.from[0]
  if (!from) return '(unknown sender)'
  return from.name || from.address
}

interface MessageRowProps {
  msg: MessageSummary
  active: boolean
  draggable: boolean
  indent?: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function MessageRow({ msg, active, draggable, indent, onClick, onContextMenu }: MessageRowProps): JSX.Element {
  return (
    <button
      className={`${styles.row} ${active ? styles.active : ''} ${!msg.flags.seen ? styles.unread : ''} ${indent ? styles.indented : ''} ${msg.flags.flagged ? styles.flaggedRow : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/tiny-mail-uid', String(msg.uid))
      }}
    >
      <span className={styles.dotColumn}>{!msg.flags.seen && <span className={styles.unreadDot} />}</span>
      <span className={styles.main}>
        <span className={styles.topLine}>
          <span className={styles.sender}>{senderLabel(msg)}</span>
          <span className={styles.date}>{formatMessageDate(msg.date)}</span>
        </span>
        <span className={styles.subjectLine}>
          {msg.flags.flagged && <IconFlagFilled width={14} height={14} className={styles.flagIcon} />}
          <span className={styles.subject}>{msg.subject || '(no subject)'}</span>
          {msg.hasAttachments && <IconPaperclip width={12} height={12} className={styles.attachIcon} />}
        </span>
        <span className={styles.snippet}>{msg.snippet}</span>
      </span>
    </button>
  )
}
