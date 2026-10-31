import { useMemo, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { MessageSummary } from '@shared/types'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { MessageRow } from './MessageRow'
import { ThreadHeaderRow } from './ThreadHeaderRow'
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  filterMessages,
  getMessageComparator,
  type MessageFilterKey,
  type MessageSortKey
} from '../utils/filterAndSortMessages'
import { groupMessagesByThread } from '../utils/threadMessages'
import styles from './MessageList.module.css'

export function MessageList(): JSX.Element {
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const selectedUid = useMailStore((s) => s.selectedUid)
  const messagesByKey = useMailStore((s) => s.messagesByKey)
  const searchResults = useMailStore((s) => s.searchResults)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const syncStatus = useMailStore((s) => s.syncStatus)
  const selectMessage = useMailStore((s) => s.selectMessage)
  const setFlags = useMailStore((s) => s.setFlags)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const groupByThread = useMailStore((s) => s.settings?.groupByThread ?? false)
  const [menu, setMenu] = useState<{ x: number; y: number; msg: MessageSummary } | null>(null)
  const [filter, setFilter] = useState<MessageFilterKey>('all')
  const [sort, setSort] = useState<MessageSortKey>('date-desc')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const rawMessages = searchResults ?? (key ? messagesByKey[key] ?? [] : [])
  const sync = key ? syncStatus[key] : undefined
  const syncing = sync && !sync.done

  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = boxes.find((b) => b.specialUse === 'Archive')
  const junkBox = boxes.find((b) => b.specialUse === 'Junk')

  // Threading doesn't apply to search results — those are already a
  // relevance-ish flat list spanning whatever matched, not a mailbox view.
  const threadingActive = groupByThread && !searchResults

  const filtered = useMemo(() => filterMessages(rawMessages, filter), [rawMessages, filter])

  const items = useMemo(() => {
    const comparator = getMessageComparator(sort)
    if (!threadingActive) {
      return filtered
        .slice()
        .sort(comparator)
        .map((msg) => ({ kind: 'message' as const, msg }))
    }
    const threads = groupMessagesByThread(filtered)
    return threads
      .slice()
      .sort((a, b) => comparator(a.messages[a.messages.length - 1], b.messages[b.messages.length - 1]))
      .map((thread) =>
        thread.messages.length === 1
          ? { kind: 'message' as const, msg: thread.messages[0] }
          : { kind: 'thread' as const, thread }
      )
  }, [filtered, sort, threadingActive])

  const toggleThread = (key: string): void => {
    setExpandedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openMenu = (e: React.MouseEvent, msg: MessageSummary): void => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, msg })
  }

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: menu.msg.flags.seen ? 'Mark as Unread' : 'Mark as Read',
          onSelect: () => setFlags(menu.msg.uid, { seen: !menu.msg.flags.seen })
        },
        {
          label: menu.msg.flags.flagged ? 'Remove Flag' : 'Flag',
          onSelect: () => setFlags(menu.msg.uid, { flagged: !menu.msg.flags.flagged })
        },
        {
          label: 'Move to Archive',
          disabled: !archiveBox,
          onSelect: () => archiveBox && moveMessage(menu.msg.uid, archiveBox.path),
          separatorBefore: true
        },
        {
          label: 'Move to Junk',
          disabled: !junkBox,
          onSelect: () => junkBox && moveMessage(menu.msg.uid, junkBox.path)
        },
        {
          label: 'Delete',
          danger: true,
          onSelect: () => deleteMessage(menu.msg.uid),
          separatorBefore: true
        }
      ]
    : []

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        {searchResults ? (
          <span className={styles.headerLabel}>Results for "{searchQuery}"</span>
        ) : (
          <>
            <select className={styles.headerSelect} value={filter} onChange={(e) => setFilter(e.target.value as MessageFilterKey)}>
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className={styles.headerSelect} value={sort} onChange={(e) => setSort(e.target.value as MessageSortKey)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className={styles.headerSpacer} />
        {syncing && <span className={styles.syncing}>Updating… {sync.fetched}/{sync.total}</span>}
      </div>
      <div className={styles.scroll}>
        {items.length === 0 && (
          <div className={styles.empty}>{searchResults ? 'No results' : 'No messages'}</div>
        )}
        {items.map((item) => {
          if (item.kind === 'message') {
            return (
              <MessageRow
                key={item.msg.uid}
                msg={item.msg}
                active={item.msg.uid === selectedUid}
                draggable={!searchResults}
                onClick={() => selectMessage(item.msg.uid)}
                onContextMenu={(e) => openMenu(e, item.msg)}
              />
            )
          }
          const expanded = expandedThreads.has(item.thread.key)
          return (
            <div key={item.thread.key}>
              <ThreadHeaderRow thread={item.thread} expanded={expanded} onToggle={() => toggleThread(item.thread.key)} />
              {expanded &&
                item.thread.messages.map((msg) => (
                  <MessageRow
                    key={msg.uid}
                    msg={msg}
                    active={msg.uid === selectedUid}
                    draggable
                    indent
                    onClick={() => selectMessage(msg.uid)}
                    onContextMenu={(e) => openMenu(e, msg)}
                  />
                ))}
            </div>
          )
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  )
}
