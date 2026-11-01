import { useMailStore } from '../store/useMailStore'
import { resolveMailboxRole } from '@shared/resolveMailboxRole'
import { IconArchive, IconJunk, IconTrash } from './Icons'
import styles from './BulkActionPanel.module.css'

// Shown in place of a single message whenever more than one row is
// selected (Ctrl/Cmd-click, Shift-click, or "select all") — the reading
// pane has nothing single to preview, so this takes over that space with
// actions that apply to the whole selection instead.
export function BulkActionPanel(): JSX.Element {
  const selectedUids = useMailStore((s) => s.selectedUids)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const accounts = useMailStore((s) => s.accounts)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const bulkSetFlags = useMailStore((s) => s.bulkSetFlags)
  const bulkMove = useMailStore((s) => s.bulkMove)
  const bulkDelete = useMailStore((s) => s.bulkDelete)

  const account = accounts.find((a) => a.id === selectedAccountId)
  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = resolveMailboxRole(boxes, 'Archive', account?.mailboxRoleOverrides?.Archive)
  const junkBox = resolveMailboxRole(boxes, 'Junk', account?.mailboxRoleOverrides?.Junk)

  const count = selectedUids.size

  const handleDelete = (): void => {
    if (count >= 25 && !window.confirm(`Delete ${count} messages?`)) return
    bulkDelete()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.count}>{count} Messages Selected</div>
      <div className={styles.actions}>
        <button className={styles.actionButton} onClick={() => bulkSetFlags({ seen: true })}>
          Mark as Read
        </button>
        <button className={styles.actionButton} onClick={() => bulkSetFlags({ seen: false })}>
          Mark as Unread
        </button>
        <button className={styles.actionButton} onClick={() => bulkSetFlags({ flagged: true })}>
          Flag
        </button>
        <button className={styles.actionButton} onClick={() => bulkSetFlags({ flagged: false })}>
          Remove Flag
        </button>
        <button
          className={styles.actionButton}
          disabled={!archiveBox}
          onClick={() => archiveBox && bulkMove(archiveBox.path)}
        >
          <IconArchive width={14} height={14} />
          Archive
        </button>
        <button
          className={styles.actionButton}
          disabled={!junkBox}
          onClick={() => junkBox && bulkMove(junkBox.path)}
        >
          <IconJunk width={14} height={14} />
          Move to Junk
        </button>
        <button className={`${styles.actionButton} ${styles.danger}`} onClick={handleDelete}>
          <IconTrash width={14} height={14} />
          Delete
        </button>
      </div>
    </div>
  )
}
