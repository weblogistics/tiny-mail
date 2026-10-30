import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { MailboxSummary } from '@shared/types'
import {
  IconArchive,
  IconDraft,
  IconFolderPlus,
  IconGear,
  IconInbox,
  IconJunk,
  IconMailbox,
  IconSent,
  IconTrash
} from './Icons'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { PromptDialog } from './PromptDialog'
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

const SPECIAL_ORDER: Record<string, number> = {
  Inbox: 0,
  Drafts: 1,
  Sent: 2,
  Junk: 3,
  Trash: 4,
  Archive: 5
}

function sortMailboxes(boxes: MailboxSummary[]): MailboxSummary[] {
  return [...boxes].sort((a, b) => {
    const ra = a.specialUse ? SPECIAL_ORDER[a.specialUse] ?? 6 : 6
    const rb = b.specialUse ? SPECIAL_ORDER[b.specialUse] ?? 6 : 6
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}

export function Sidebar(): JSX.Element {
  const accounts = useMailStore((s) => s.accounts)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const accountStatus = useMailStore((s) => s.accountStatus)
  const selectAccount = useMailStore((s) => s.selectAccount)
  const selectMailbox = useMailStore((s) => s.selectMailbox)
  const setAccountDialogOpen = useMailStore((s) => s.setAccountDialogOpen)
  const createMailbox = useMailStore((s) => s.createMailbox)
  const renameMailbox = useMailStore((s) => s.renameMailbox)
  const deleteMailbox = useMailStore((s) => s.deleteMailbox)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const [menu, setMenu] = useState<{ x: number; y: number; mb: MailboxSummary } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Electron doesn't implement window.prompt() (it throws), so folder
  // naming goes through this in-app dialog instead.
  const [prompt, setPrompt] = useState<{ kind: 'new' | 'rename'; mb?: MailboxSummary } | null>(null)

  const handleNewMailbox = (accountId: string): void => {
    if (accountId !== selectedAccountId) selectAccount(accountId)
    setPrompt({ kind: 'new' })
  }

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'Rename Mailbox…',
          onSelect: () => setPrompt({ kind: 'rename', mb: menu.mb })
        },
        {
          label: 'Delete Mailbox',
          danger: true,
          onSelect: () => {
            if (window.confirm(`Delete "${menu.mb.name}" and everything in it? This can't be undone.`)) {
              deleteMailbox(menu.mb.path)
            }
          }
        }
      ]
    : []

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        {accounts.map((account) => {
          const boxes = sortMailboxes(mailboxesByAccount[account.id] ?? [])
          const status = accountStatus[account.id] ?? 'offline'
          return (
            <div key={account.id} className={styles.accountSection}>
              {accounts.length > 1 && (
                <div className={styles.accountHeader}>
                  <span className={`${styles.statusDot} ${styles[status]}`} />
                  <span className={styles.accountHeaderName}>{account.displayName}</span>
                  <button
                    className={styles.newMailboxButton}
                    title="New Mailbox"
                    onClick={() => handleNewMailbox(account.id)}
                  >
                    <IconFolderPlus width={13} height={13} />
                  </button>
                </div>
              )}
              <ul className={styles.mailboxList}>
                {boxes.map((mb) => {
                  const active = account.id === selectedAccountId && mb.path === selectedMailboxPath
                  const isDropTarget = dropTarget === `${account.id}::${mb.path}`
                  return (
                    <li key={mb.path}>
                      <button
                        className={`${styles.mailboxRow} ${active ? styles.active : ''} ${isDropTarget ? styles.dropTarget : ''}`}
                        onClick={() => {
                          if (account.id !== selectedAccountId) selectAccount(account.id)
                          selectMailbox(mb.path)
                        }}
                        onContextMenu={(e) => {
                          if (mb.specialUse) return // don't let special mailboxes be renamed/deleted
                          e.preventDefault()
                          setMenu({ x: e.clientX, y: e.clientY, mb })
                        }}
                        onDragOver={(e) => {
                          if (account.id !== selectedAccountId || mb.path === selectedMailboxPath) return
                          e.preventDefault()
                          setDropTarget(`${account.id}::${mb.path}`)
                        }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDropTarget(null)
                          const uid = Number(e.dataTransfer.getData('text/tiny-mail-uid'))
                          if (!Number.isNaN(uid) && account.id === selectedAccountId) {
                            moveMessage(uid, mb.path)
                          }
                        }}
                      >
                        <span className={styles.mailboxIcon}>{mailboxIcon(mb)}</span>
                        <span className={styles.mailboxName}>{displayName(mb)}</span>
                        {mb.unreadCount > 0 && (
                          <span className={`${styles.badge} ${active ? styles.badgeActive : ''}`}>{mb.unreadCount}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {accounts.length === 1 && (
                <button className={styles.newMailboxLink} onClick={() => handleNewMailbox(account.id)}>
                  + New Mailbox
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <button className={styles.footerButton} onClick={() => setAccountDialogOpen(true)}>
          + Add Account
        </button>
        <button className={styles.footerIconButton} title="Settings" onClick={() => window.api.settings.openWindow()}>
          <IconGear width={16} height={16} />
        </button>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {prompt?.kind === 'new' && (
        <PromptDialog
          title="New Mailbox"
          label="Name:"
          confirmLabel="Create"
          onSubmit={(name) => {
            createMailbox(name)
            setPrompt(null)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}

      {prompt?.kind === 'rename' && prompt.mb && (
        <PromptDialog
          title="Rename Mailbox"
          label="Name:"
          defaultValue={prompt.mb.name}
          confirmLabel="Rename"
          onSubmit={(name) => {
            if (name !== prompt.mb!.name) renameMailbox(prompt.mb!.path, name)
            setPrompt(null)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
