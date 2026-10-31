import type { MailboxSummary } from '@shared/types'
import type { MailboxTreeNode } from '../utils/mailboxTree'
import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconDraft,
  IconInbox,
  IconJunk,
  IconMailbox,
  IconSent,
  IconTrash
} from './Icons'
import styles from './Sidebar.module.css'

function mailboxIcon(mb: MailboxSummary): JSX.Element {
  switch (mb.specialUse) {
    case 'Inbox':
      return <IconInbox width={15} height={15} />
    case 'Sent':
      return <IconSent width={15} height={15} />
    case 'Drafts':
      return <IconDraft width={15} height={15} />
    case 'Trash':
      return <IconTrash width={15} height={15} />
    case 'Junk':
      return <IconJunk width={15} height={15} />
    case 'Archive':
      return <IconArchive width={15} height={15} />
    default:
      return <IconMailbox width={15} height={15} />
  }
}

function displayName(mb: MailboxSummary): string {
  if (mb.specialUse === 'Inbox') return 'Inbox'
  return mb.name
}

interface MailboxTreeRowProps {
  node: MailboxTreeNode
  depth: number
  activePath: string | null
  collapsed: Set<string>
  dropTarget: string | null
  onToggleCollapse: (path: string) => void
  onSelect: (mb: MailboxSummary) => void
  onContextMenu: (e: React.MouseEvent, mb: MailboxSummary) => void
  onDragOver: (e: React.DragEvent, mb: MailboxSummary) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, mb: MailboxSummary) => void
}

export function MailboxTreeRow({
  node,
  depth,
  activePath,
  collapsed,
  dropTarget,
  onToggleCollapse,
  onSelect,
  onContextMenu,
  onDragOver,
  onDragLeave,
  onDrop
}: MailboxTreeRowProps): JSX.Element {
  const { mb, children } = node
  const active = mb.path === activePath
  const isDropTarget = dropTarget === mb.path
  const isCollapsed = collapsed.has(mb.path)
  const hasChildren = children.length > 0

  return (
    <li>
      <button
        className={`${styles.mailboxRow} ${active ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => onSelect(mb)}
        onContextMenu={(e) => onContextMenu(e, mb)}
        onDragOver={(e) => onDragOver(e, mb)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, mb)}
      >
        <span
          className={`${styles.disclosure} ${hasChildren ? styles.disclosureVisible : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse(mb.path)
          }}
        >
          {hasChildren && (isCollapsed ? <IconChevronRight width={11} height={11} /> : <IconChevronDown width={11} height={11} />)}
        </span>
        <span className={styles.mailboxIcon}>{mailboxIcon(mb)}</span>
        <span className={styles.mailboxName}>{displayName(mb)}</span>
        {mb.unreadCount > 0 && (
          <span className={`${styles.badge} ${active ? styles.badgeActive : ''}`}>{mb.unreadCount}</span>
        )}
      </button>
      {hasChildren && !isCollapsed && (
        <ul className={styles.mailboxList}>
          {children.map((child) => (
            <MailboxTreeRow
              key={child.mb.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              collapsed={collapsed}
              dropTarget={dropTarget}
              onToggleCollapse={onToggleCollapse}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
