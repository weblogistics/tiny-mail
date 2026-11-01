import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { MailboxSummary } from '@shared/types'
import { buildMailboxTree } from '../utils/mailboxTree'
import { resolveCanonicalPaths } from '@shared/resolveMailboxRole'
import { IconFolderPlus, IconGear } from './Icons'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { PromptDialog } from './PromptDialog'
import { MailboxTreeRow } from './MailboxTreeRow'
import styles from './Sidebar.module.css'

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
  const emptyMailbox = useMailStore((s) => s.emptyMailbox)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const [menu, setMenu] = useState<{ x: number; y: number; mb: MailboxSummary } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Electron doesn't implement window.prompt() (it throws), so folder
  // naming goes through this in-app dialog instead.
  const [prompt, setPrompt] = useState<{ kind: 'new' | 'rename'; mb?: MailboxSummary } | null>(null)

  const toggleCollapse = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleNewMailbox = (accountId: string): void => {
    if (accountId !== selectedAccountId) selectAccount(accountId)
    setPrompt({ kind: 'new' })
  }

  // Raw mb.specialUse can be true for several folders at once (three
  // differently-located "Sent" folders, say) — only the one that's actually
  // the resolved/canonical folder for its role should be treated as special
  // here (undeletable, offers "Empty"), same as the sidebar icon/position.
  const menuDisplayUse = menu
    ? resolveCanonicalPaths(
        mailboxesByAccount[menu.mb.accountId] ?? [],
        accounts.find((a) => a.id === menu.mb.accountId)?.mailboxRoleOverrides
      ).has(menu.mb.path)
      ? menu.mb.specialUse
      : null
    : null

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'Add Subfolder…',
          onSelect: () => setPrompt({ kind: 'new', mb: menu.mb })
        },
        {
          label: 'Rename Mailbox…',
          disabled: !!menuDisplayUse,
          onSelect: () => setPrompt({ kind: 'rename', mb: menu.mb }),
          separatorBefore: true
        },
        {
          label: 'Delete Mailbox',
          danger: true,
          disabled: !!menuDisplayUse,
          onSelect: () => {
            if (window.confirm(`Delete "${menu.mb.name}" and everything in it? This can't be undone.`)) {
              deleteMailbox(menu.mb.path)
            }
          }
        },
        ...(menuDisplayUse === 'Trash' || menuDisplayUse === 'Junk'
          ? [
              {
                label: `Empty ${menuDisplayUse === 'Trash' ? 'Trash' : 'Junk'}`,
                danger: true,
                separatorBefore: true,
                onSelect: () => {
                  if (window.confirm(`Permanently erase all messages in "${menu.mb.name}"? This can't be undone.`)) {
                    emptyMailbox(menu.mb.path)
                  }
                }
              }
            ]
          : [])
      ]
    : []

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        {accounts.map((account) => {
          const boxes = mailboxesByAccount[account.id] ?? []
          const canonicalPaths = resolveCanonicalPaths(boxes, account.mailboxRoleOverrides)
          const tree = buildMailboxTree(boxes, canonicalPaths)
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
                {tree.map((node) => (
                  <MailboxTreeRow
                    key={node.mb.path}
                    node={node}
                    depth={0}
                    activePath={account.id === selectedAccountId ? selectedMailboxPath : null}
                    collapsed={collapsed}
                    dropTarget={account.id === selectedAccountId ? dropTarget : null}
                    onToggleCollapse={toggleCollapse}
                    onSelect={(mb) => {
                      if (account.id !== selectedAccountId) selectAccount(account.id)
                      selectMailbox(mb.path)
                    }}
                    onContextMenu={(e, mb) => {
                      e.preventDefault()
                      if (account.id !== selectedAccountId) selectAccount(account.id)
                      setMenu({ x: e.clientX, y: e.clientY, mb })
                    }}
                    onDragOver={(e, mb) => {
                      if (account.id !== selectedAccountId || mb.path === selectedMailboxPath) return
                      e.preventDefault()
                      setDropTarget(mb.path)
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e, mb) => {
                      e.preventDefault()
                      setDropTarget(null)
                      const uid = Number(e.dataTransfer.getData('text/tiny-mail-uid'))
                      if (!Number.isNaN(uid) && account.id === selectedAccountId) {
                        moveMessage(uid, mb.path)
                      }
                    }}
                  />
                ))}
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
          title={prompt.mb ? `Add Subfolder to "${prompt.mb.name}"` : 'New Mailbox'}
          label="Name:"
          confirmLabel="Create"
          onSubmit={(name) => {
            createMailbox(name, prompt.mb?.path ?? null)
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
