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
  multiSelected: boolean
  draggable: boolean
  indent?: boolean
  onClick: (e: React.MouseEvent) => void
  onCheckboxClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function MessageRow({
  msg,
  active,
  multiSelected,
  draggable,
  indent,
  onClick,
  onCheckboxClick,
  onContextMenu
}: MessageRowProps): JSX.Element {
  return (
    <button
      className={`${styles.row} ${active ? styles.active : ''} ${multiSelected ? styles.multiSelected : ''} ${!msg.flags.seen ? styles.unread : ''} ${indent ? styles.indented : ''} ${msg.flags.flagged ? styles.flaggedRow : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/tiny-mail-uid', String(msg.uid))
      }}
    >
      <span className={styles.dotColumn}>
        {!msg.flags.seen && <span className={styles.unreadDot} />}
        <span
          className={`${styles.checkbox} ${multiSelected ? styles.checkboxChecked : ''}`}
          onClick={onCheckboxClick}
          role="checkbox"
          aria-checked={multiSelected}
          aria-label={multiSelected ? 'Deselect message' : 'Select message'}
        >
          {multiSelected && '✓'}
        </span>
      </span>
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
