import { useMailStore } from '../store/useMailStore'
import type { MailboxSummary } from '@shared/types'
import { IconArchive, IconDraft, IconInbox, IconJunk, IconMailbox, IconSent, IconTrash } from './Icons'
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
                  {account.displayName}
                </div>
              )}
              <ul className={styles.mailboxList}>
                {boxes.map((mb) => {
                  const active = account.id === selectedAccountId && mb.path === selectedMailboxPath
                  return (
                    <li key={mb.path}>
                      <button
                        className={`${styles.mailboxRow} ${active ? styles.active : ''}`}
                        onClick={() => {
                          if (account.id !== selectedAccountId) selectAccount(account.id)
                          selectMailbox(mb.path)
                        }}
                      >
                        <span className={styles.mailboxIcon}>{mailboxIcon(mb)}</span>
                        <span className={styles.mailboxName}>{mb.name}</span>
                        {mb.unreadCount > 0 && (
                          <span className={`${styles.badge} ${active ? styles.badgeActive : ''}`}>{mb.unreadCount}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      <button className={styles.addAccount} onClick={() => setAccountDialogOpen(true)}>
        + Add Account
      </button>
    </div>
  )
}
