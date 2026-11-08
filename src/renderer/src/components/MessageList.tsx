import { useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore, resultKey } from '../store/useMailStore'
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
import { buildForwardSeed, buildReplySeed } from '../utils/quote'
import { isOutgoingMailbox } from '../utils/isOutgoingMailbox'
import { isTypingTarget } from '../hooks/useKeyboardShortcuts'
import { resolveMailboxRole } from '@shared/resolveMailboxRole'
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
  const selectedUids = useMailStore((s) => s.selectedUids)
  const toggleMultiSelect = useMailStore((s) => s.toggleMultiSelect)
  const setMultiSelection = useMailStore((s) => s.setMultiSelection)
  const bulkSetFlags = useMailStore((s) => s.bulkSetFlags)
  const bulkMove = useMailStore((s) => s.bulkMove)
  const bulkDelete = useMailStore((s) => s.bulkDelete)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const accounts = useMailStore((s) => s.accounts)
  const openCompose = useMailStore((s) => s.openCompose)
  const groupByThread = useMailStore((s) => s.settings?.groupByThread ?? false)
  const isSearchingServer = useMailStore((s) => s.isSearchingServer)
  const setStatusNotice = useMailStore((s) => s.setStatusNotice)
  const [menu, setMenu] = useState<{ x: number; y: number; msg: MessageSummary } | null>(null)
  const [filter, setFilter] = useState<MessageFilterKey>('all')
  const [sort, setSort] = useState<MessageSortKey>('date-desc')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  // Shift-click range-select anchor — purely a UI interaction detail of
  // this component's own click handling, not something any other
  // component needs, so it stays local rather than living in the store.
  const lastSelectedKeyRef = useRef<string | null>(null)

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const rawMessages = searchResults ?? (key ? messagesByKey[key] ?? [] : [])
  const sync = key ? syncStatus[key] : undefined
  const syncing = sync && !sync.done

  const account = accounts.find((a) => a.id === selectedAccountId)
  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = resolveMailboxRole(boxes, 'Archive', account?.mailboxRoleOverrides?.Archive)
  const junkBox = resolveMailboxRole(boxes, 'Junk', account?.mailboxRoleOverrides?.Junk)
  const selfEmail = account?.email.toLowerCase()

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
    const threads = groupMessagesByThread(filtered, sort === 'date-desc')
    return threads
      .slice()
      .sort((a, b) => comparator(a.messages[a.messages.length - 1], b.messages[b.messages.length - 1]))
      .map((thread) =>
        thread.messages.length === 1
          ? { kind: 'message' as const, msg: thread.messages[0] }
          : { kind: 'thread' as const, thread }
      )
  }, [filtered, sort, threadingActive])

  // The flat order rows actually render in right now — what shift-click
  // range-select operates over. A collapsed thread's child messages aren't
  // individually clickable, so (matching what you can actually shift-click)
  // they're excluded from the range entirely rather than silently included.
  const orderedKeys = useMemo(() => {
    const keys: string[] = []
    for (const item of items) {
      if (item.kind === 'message') {
        keys.push(resultKey(item.msg))
      } else if (expandedThreads.has(item.thread.key)) {
        for (const msg of item.thread.messages) keys.push(resultKey(msg))
      }
    }
    return keys
  }, [items, expandedThreads])

  const handleRowClick = (e: React.MouseEvent, msg: MessageSummary): void => {
    const k = resultKey(msg)
    if (e.shiftKey && lastSelectedKeyRef.current) {
      const fromIdx = orderedKeys.indexOf(lastSelectedKeyRef.current)
      const toIdx = orderedKeys.indexOf(k)
      if (fromIdx >= 0 && toIdx >= 0) {
        const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        setMultiSelection(orderedKeys.slice(start, end + 1))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      toggleMultiSelect(msg)
      lastSelectedKeyRef.current = k
      return
    }
    selectMessage(msg.uid)
    lastSelectedKeyRef.current = k
  }

  const handleCheckboxClick = (e: React.MouseEvent, msg: MessageSummary): void => {
    e.stopPropagation()
    toggleMultiSelect(msg)
    lastSelectedKeyRef.current = resultKey(msg)
  }

  // Ctrl/Cmd+A selects every message currently matching the active
  // filter/search — not literally every message in the mailbox, which
  // would silently select rows the user can't even see if, say, the
  // filter is set to "Unread". Scoped to this component (rather than the
  // app-wide keyboard hook) specifically so it can respect that filter.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isTypingTarget(e.target)) {
        e.preventDefault()
        setMultiSelection(filtered.map(resultKey))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, setMultiSelection])

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

  // Mirrors the same gone-message handling as selectMessage() in the store:
  // a message removed from the server already reports itself via the
  // 'message-removed' event and disappears from the list, so repeating
  // that here would be redundant noise. Anything else is a genuine failure
  // worth surfacing — this menu has no reading pane to silently leave
  // empty, so without this the compose window would just never open.
  const reportBodyFetchFailure = (err: unknown): void => {
    if (!String(err).includes('TINY_MAIL_MESSAGE_GONE')) {
      setStatusNotice(`Couldn't load that message: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Right-click Reply/Reply All/Forward act on whichever message was
  // clicked, independent of what's currently open in the reading pane —
  // so the quoted body is fetched directly rather than relying on
  // selectMessage() having already cached it (the message may never have
  // been opened at all). Uses msg's own accountId/mailboxPath rather than
  // the sidebar selection since this menu also fires from search results,
  // which can span mailboxes (and in principle accounts) other than
  // whichever is currently selected.
  const replyFromMenu = async (msg: MessageSummary, all: boolean): Promise<void> => {
    try {
      const body = await window.api.messages.getBody(msg.accountId, msg.mailboxPath, msg.uid)
      const isOutgoing = isOutgoingMailbox(boxes, msg.mailboxPath)
      openCompose(all ? 'replyAll' : 'reply', buildReplySeed(msg, body, selfEmail, all, isOutgoing))
    } catch (err) {
      reportBodyFetchFailure(err)
    }
  }

  const forwardFromMenu = async (msg: MessageSummary): Promise<void> => {
    try {
      const body = await window.api.messages.getBody(msg.accountId, msg.mailboxPath, msg.uid)
      openCompose('forward', buildForwardSeed(msg, body))
    } catch (err) {
      reportBodyFetchFailure(err)
    }
  }

  // Right-clicking a row that's already part of a multi-selection acts on
  // the whole selection (standard desktop convention); right-clicking
  // anything else acts on just that one message, same as before — even if
  // a different multi-selection happens to exist at the time, since
  // right-clicking outside it is a clear signal you mean just this row.
  const menuTargetsSelection = menu ? selectedUids.size > 1 && selectedUids.has(resultKey(menu.msg)) : false

  const bulkMenuItems: ContextMenuItem[] = menuTargetsSelection
    ? [
        { label: 'Mark as Read', onSelect: () => bulkSetFlags({ seen: true }) },
        { label: 'Mark as Unread', onSelect: () => bulkSetFlags({ seen: false }) },
        {
          label: 'Move to Archive',
          disabled: !archiveBox,
          onSelect: () => archiveBox && bulkMove(archiveBox.path),
          separatorBefore: true
        },
        {
          label: 'Move to Junk',
          disabled: !junkBox,
          onSelect: () => junkBox && bulkMove(junkBox.path)
        },
        {
          label: `Delete ${selectedUids.size} Messages`,
          danger: true,
          onSelect: () => bulkDelete(),
          separatorBefore: true
        }
      ]
    : []

  const singleMenuItems: ContextMenuItem[] = menu
    ? [
        { label: 'Reply', onSelect: () => replyFromMenu(menu.msg, false) },
        { label: 'Reply All', onSelect: () => replyFromMenu(menu.msg, true) },
        { label: 'Forward', onSelect: () => forwardFromMenu(menu.msg) },
        {
          label: menu.msg.flags.seen ? 'Mark as Unread' : 'Mark as Read',
          onSelect: () => setFlags(menu.msg.uid, { seen: !menu.msg.flags.seen }),
          separatorBefore: true
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

  const menuItems = menuTargetsSelection ? bulkMenuItems : singleMenuItems

  const allVisibleSelected = filtered.length > 0 && filtered.every((m) => selectedUids.has(resultKey(m)))
  const someVisibleSelected = selectedUids.size > 0 && !allVisibleSelected

  return (
    <div className={`${styles.list} ${selectedUids.size > 0 ? styles.selecting : ''}`}>
      <div className={styles.header}>
        <span
          className={`${styles.headerCheckbox} ${allVisibleSelected ? styles.checkboxChecked : ''} ${someVisibleSelected ? styles.checkboxIndeterminate : ''}`}
          role="checkbox"
          aria-checked={someVisibleSelected ? 'mixed' : allVisibleSelected}
          title={allVisibleSelected || someVisibleSelected ? 'Deselect all' : 'Select all'}
          onClick={() => setMultiSelection(allVisibleSelected || someVisibleSelected ? [] : filtered.map(resultKey))}
        >
          {allVisibleSelected && '✓'}
          {someVisibleSelected && '–'}
        </span>
        {selectedUids.size > 0 ? (
          <span className={styles.headerLabel}>{selectedUids.size} selected</span>
        ) : searchResults ? (
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
        {searchResults && isSearchingServer && <span className={styles.syncing}>Searching server…</span>}
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
                multiSelected={selectedUids.has(resultKey(item.msg))}
                draggable={!searchResults}
                onClick={(e) => handleRowClick(e, item.msg)}
                onCheckboxClick={(e) => handleCheckboxClick(e, item.msg)}
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
                    multiSelected={selectedUids.has(resultKey(msg))}
                    draggable
                    indent
                    onClick={(e) => handleRowClick(e, msg)}
                    onCheckboxClick={(e) => handleCheckboxClick(e, msg)}
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
