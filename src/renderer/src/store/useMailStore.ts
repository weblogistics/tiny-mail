import { create } from 'zustand'
import type {
  AccountConfig,
  AppSettings,
  ComposeDraft,
  ComposeMode,
  MailboxSummary,
  MessageBody,
  MessageSummary,
  SearchFields,
  SearchOptions,
  SyncProgress
} from '@shared/types'
import { resolveMailboxRole } from '@shared/resolveMailboxRole'

function key(accountId: string, mailboxPath: string): string {
  return `${accountId}::${mailboxPath}`
}

export function resultKey(m: MessageSummary): string {
  return `${m.accountId}:${m.mailboxPath}:${m.uid}`
}

// Drops any message a delete/move already optimistically removed locally
// but that the server hasn't confirmed gone yet, from a fresh list fetched
// out from under that in-flight action (see MailState.pendingRemovals).
function dropPending(msgs: MessageSummary[], pendingRemovals: Set<string>): MessageSummary[] {
  if (pendingRemovals.size === 0) return msgs
  return msgs.filter((m) => !pendingRemovals.has(resultKey(m)))
}

// Which message a UID refers to depends on what's on screen: server search
// results span every mailbox, so a UID shown there can belong to a folder
// other than the one selected in the sidebar. Acting on selectedMailboxPath
// in that case would hit a completely different message that merely happens
// to share the UID number, so always resolve against the displayed list and
// use the message's own accountId/mailboxPath.
function findDisplayedMessage(state: MailState, uid: number): MessageSummary | undefined {
  if (state.searchResults) return state.searchResults.find((m) => m.uid === uid)
  const { selectedAccountId, selectedMailboxPath } = state
  if (!selectedAccountId || !selectedMailboxPath) return undefined
  return state.messagesByKey[key(selectedAccountId, selectedMailboxPath)]?.find((m) => m.uid === uid)
}

function withoutMessage(list: MessageSummary[] | null, mailboxPath: string, uid: number): MessageSummary[] | null {
  return list?.filter((m) => !(m.mailboxPath === mailboxPath && m.uid === uid)) ?? null
}

// Multi-select (Ctrl/Cmd-click, Shift-click, "select all") is tracked
// separately from selectedUid (the single message shown in the reading
// pane) and keyed the same way search results are — a bulk selection can
// in principle span mailboxes, same reasoning as findDisplayedMessage.
function findDisplayedMessagesByKeys(state: MailState, keys: Set<string>): MessageSummary[] {
  if (keys.size === 0) return []
  const source = state.searchResults ?? (state.selectedAccountId && state.selectedMailboxPath
    ? state.messagesByKey[key(state.selectedAccountId, state.selectedMailboxPath)] ?? []
    : [])
  return source.filter((m) => keys.has(resultKey(m)))
}

// Bulk actions group selected messages by (accountId, mailboxPath) before
// calling the server — almost always one group in practice (a selection
// is normally made within a single mailbox view), but search results can
// span mailboxes, and grouping costs nothing when there's only one group.
function groupByMailbox(
  messages: MessageSummary[]
): Map<string, { accountId: string; mailboxPath: string; uids: number[] }> {
  const groups = new Map<string, { accountId: string; mailboxPath: string; uids: number[] }>()
  for (const m of messages) {
    const gk = key(m.accountId, m.mailboxPath)
    const existing = groups.get(gk)
    if (existing) existing.uids.push(m.uid)
    else groups.set(gk, { accountId: m.accountId, mailboxPath: m.mailboxPath, uids: [m.uid] })
  }
  return groups
}

// Local search only covers whatever's already synced, so every keystroke
// also schedules a real IMAP SEARCH across the server once typing pauses —
// debounced (rather than fired per keystroke) since it's a live round trip
// to the mail server, not a local cache lookup. Kept at module scope (not
// store state) because it's pure plumbing for that debounce/cancellation,
// not state any component needs to read.
let serverSearchTimer: ReturnType<typeof setTimeout> | null = null
let serverSearchToken = 0

type SetFn = (
  partial: Partial<MailState> | ((state: MailState) => Partial<MailState>)
) => void

function adjustUnreadCount(set: SetFn, accountId: string, mailboxPath: string, delta: number): void {
  set((s) => {
    const boxes = s.mailboxesByAccount[accountId]
    if (!boxes) return {}
    const idx = boxes.findIndex((b) => b.path === mailboxPath)
    if (idx < 0) return {}
    const next = [...boxes]
    next[idx] = { ...next[idx], unreadCount: Math.max(0, next[idx].unreadCount + delta) }
    return { mailboxesByAccount: { ...s.mailboxesByAccount, [accountId]: next } }
  })
}

interface MailState {
  accounts: AccountConfig[]
  selectedAccountId: string | null
  mailboxesByAccount: Record<string, MailboxSummary[]>
  selectedMailboxPath: string | null
  messagesByKey: Record<string, MessageSummary[]>
  // UIDs optimistically removed locally (delete/move in flight) but not yet
  // confirmed gone server-side. A concurrent sync's own messages.list()
  // refetch overwrites messagesByKey wholesale — without this, that refetch
  // would momentarily resurrect a message someone just deleted or moved,
  // since the real server-side delete is serialized behind the sync on the
  // same IMAP connection and hasn't actually removed it from the cache yet.
  pendingRemovals: Set<string>
  selectedUid: number | null
  bodyCache: Record<string, MessageBody>
  syncStatus: Record<string, SyncProgress>
  accountStatus: Record<string, 'connecting' | 'online' | 'offline' | 'error'>
  // The actual error text for an account currently in 'error' status —
  // tracked separately so the status bar can show *why*, not just that
  // something failed. Cleared whenever that account reaches 'online' again.
  accountStatusError: Record<string, string | undefined>
  searchQuery: string
  searchResults: MessageSummary[] | null
  isSearchingServer: boolean
  // Advanced search options, persisted across searches within the session
  // (not saved to disk) so repeated searches keep whatever scope the user
  // last chose rather than resetting every time.
  searchScope: 'current' | 'all'
  searchSinceDays: number | null
  searchFields: SearchFields
  searchHasAttachment: boolean
  // Bulk selection, independent of selectedUid (the single message shown in
  // the reading pane) — a plain click sets selectedUid and clears this; a
  // Ctrl/Cmd-click, Shift-click or "select all" populates this without
  // touching selectedUid, and the reading pane switches to a bulk-action
  // summary instead of a single message whenever this holds more than one.
  selectedUids: Set<string>
  isAccountDialogOpen: boolean
  settings: AppSettings | null
  // Set the instant a manual "Get Mail" starts, so the status bar reacts to
  // the click itself rather than waiting for the first sync-progress event
  // (which can be seconds later, or never when nothing needs downloading).
  isManualSyncing: boolean
  lastSyncAt: number | null
  statusNotice: string | null

  init(): Promise<void>
  selectAccount(accountId: string): Promise<void>
  selectMailbox(mailboxPath: string): Promise<void>
  syncSelectedMailbox(): Promise<void>
  selectMessage(uid: number): Promise<void>
  refreshMailboxes(accountId: string): Promise<void>
  refreshAccounts(): Promise<void>
  addAccount(config: Omit<AccountConfig, 'id'>, password: string): Promise<void>
  removeAccount(accountId: string): Promise<void>
  setAccountDialogOpen(open: boolean): void
  setFlags(uid: number, flags: Partial<MessageSummary['flags']>): Promise<void>
  moveMessage(uid: number, destPath: string): Promise<void>
  deleteMessage(uid: number): Promise<void>
  toggleMultiSelect(msg: MessageSummary): void
  setMultiSelection(keys: string[]): void
  clearMultiSelection(): void
  bulkSetFlags(flags: Partial<MessageSummary['flags']>): Promise<void>
  bulkMove(destPath: string): Promise<void>
  bulkDelete(): Promise<void>
  getMail(): Promise<void>
  setStatusNotice(notice: string | null): void
  search(query: string): Promise<void>
  clearSearch(): void
  setSearchScope(scope: 'current' | 'all'): void
  setSearchSinceDays(days: number | null): void
  setSearchFields(fields: SearchFields): void
  setSearchHasAttachment(value: boolean): void
  openCompose(mode: ComposeMode, seed?: Partial<ComposeDraft>): void
  createMailbox(name: string, parentPath?: string | null): Promise<void>
  renameMailbox(path: string, newName: string): Promise<void>
  deleteMailbox(path: string): Promise<void>
  emptyMailbox(path: string): Promise<void>
}

// Shared by the public bulkMove action and bulkDelete's "route to Trash"
// step (which needs to move a subset of the selection without disturbing
// whatever's actually selected at that moment) — takes the message list
// explicitly rather than reading selectedUids itself.
async function performBulkMove(set: SetFn, selected: MessageSummary[], destPath: string): Promise<void> {
  if (selected.length === 0) return
  const groups = groupByMailbox(selected)
  const removedKeys = new Set(selected.map(resultKey))

  set((s) => {
    const nextMessagesByKey = { ...s.messagesByKey }
    for (const g of groups.values()) {
      const k = key(g.accountId, g.mailboxPath)
      nextMessagesByKey[k] = (nextMessagesByKey[k] ?? []).filter((m) => !removedKeys.has(resultKey(m)))
    }
    const nextPending = new Set(s.pendingRemovals)
    for (const k of removedKeys) nextPending.add(k)
    return {
      messagesByKey: nextMessagesByKey,
      searchResults: s.searchResults?.filter((m) => !removedKeys.has(resultKey(m))) ?? null,
      selectedUid: selected.some((m) => m.uid === s.selectedUid) ? null : s.selectedUid,
      selectedUids: new Set<string>(),
      pendingRemovals: nextPending
    }
  })

  for (const m of selected) {
    if (!m.flags.seen) adjustUnreadCount(set, m.accountId, m.mailboxPath, -1)
  }

  try {
    await Promise.all(
      [...groups.values()].map((g) => window.api.messages.bulkMove(g.accountId, g.mailboxPath, g.uids, destPath))
    )
    for (const g of groups.values()) window.api.mail.sync(g.accountId, destPath).catch(() => void 0)
  } catch (err) {
    set({ statusNotice: `Couldn't move some messages: ${err instanceof Error ? err.message : String(err)}` })
    for (const g of groups.values()) window.api.mail.sync(g.accountId, g.mailboxPath).catch(() => void 0)
    throw err
  } finally {
    // Whether the move succeeded or failed, these messages are no longer
    // "an in-flight removal a refetch must not undo" — on success the
    // server-side move is done; on failure the recovery resync just kicked
    // off above needs to be free to bring them back.
    set((s) => {
      const nextPending = new Set(s.pendingRemovals)
      for (const k of removedKeys) nextPending.delete(k)
      return { pendingRemovals: nextPending }
    })
  }
}

export const useMailStore = create<MailState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  mailboxesByAccount: {},
  selectedMailboxPath: null,
  messagesByKey: {},
  pendingRemovals: new Set<string>(),
  selectedUid: null,
  bodyCache: {},
  syncStatus: {},
  accountStatus: {},
  accountStatusError: {},
  searchQuery: '',
  searchResults: null,
  isSearchingServer: false,
  searchScope: 'current',
  searchSinceDays: null,
  searchFields: { subject: true, from: true, to: true, body: true },
  searchHasAttachment: false,
  selectedUids: new Set<string>(),
  isAccountDialogOpen: false,
  settings: null,
  isManualSyncing: false,
  lastSyncAt: null,
  statusNotice: null,

  async init() {
    window.api.events.subscribe((payload) => {
      if (payload.type === 'sync-progress') {
        set((s) => ({ syncStatus: { ...s.syncStatus, [key(payload.data.accountId, payload.data.mailboxPath)]: payload.data } }))
        // Only refetch the list once a sync actually finishes, not on every
        // intermediate tick (there's one per message during the snippet
        // backfill phase — hundreds on a big first sync). The messages
        // themselves are already upserted before any of these ticks fire;
        // all a tick adds is a snippet for one more row, which isn't worth
        // a full list refetch, and refetching repeatedly throughout a long
        // sync is also what let a delete/move made mid-sync keep getting
        // visibly undone by a refetch that ran before the delete/move's own
        // IMAP command — queued behind the same sync on the same mailbox
        // lock — had actually completed.
        if (
          payload.data.done &&
          payload.data.accountId === get().selectedAccountId &&
          payload.data.mailboxPath === get().selectedMailboxPath
        ) {
          window.api.messages.list(payload.data.accountId, payload.data.mailboxPath).then((msgs) => {
            const k = key(payload.data.accountId, payload.data.mailboxPath)
            set((s) => ({ messagesByKey: { ...s.messagesByKey, [k]: dropPending(msgs, s.pendingRemovals) } }))
          })
        }
      } else if (payload.type === 'mailbox-updated') {
        set((s) => {
          const list = s.mailboxesByAccount[payload.data.accountId] ?? []
          const idx = list.findIndex((m) => m.path === payload.data.path)
          const next = idx >= 0 ? [...list.slice(0, idx), payload.data, ...list.slice(idx + 1)] : [...list, payload.data]
          return { mailboxesByAccount: { ...s.mailboxesByAccount, [payload.data.accountId]: next } }
        })
      } else if (payload.type === 'message-removed') {
        const { accountId, mailboxPath, uid } = payload.data
        const k = key(accountId, mailboxPath)
        const removed = get().messagesByKey[k]?.find((m) => m.uid === uid)
        set((s) => ({
          messagesByKey: {
            ...s.messagesByKey,
            [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid)
          },
          searchResults:
            s.searchResults?.filter(
              (m) => !(m.accountId === accountId && m.mailboxPath === mailboxPath && m.uid === uid)
            ) ?? null,
          selectedUid: s.selectedUid === uid ? null : s.selectedUid,
          statusNotice: 'That message is no longer on the server — the list has been updated.'
        }))
        if (removed && !removed.flags.seen) {
          adjustUnreadCount(set, accountId, mailboxPath, -1)
        }
      } else if (payload.type === 'account-status') {
        set((s) => ({
          accountStatus: { ...s.accountStatus, [payload.data.accountId]: payload.data.status },
          accountStatusError: { ...s.accountStatusError, [payload.data.accountId]: payload.data.error }
        }))
      } else if (payload.type === 'settings-updated') {
        set({ settings: payload.data })
      } else if (payload.type === 'accounts-changed') {
        get().refreshAccounts()
      }
    })

    window.api.settings.get().then((settings) => set({ settings }))

    const accounts = await window.api.accounts.list()
    set({ accounts })
    if (accounts.length > 0) {
      await get().selectAccount(accounts[0].id)
    } else {
      set({ isAccountDialogOpen: true })
    }
  },

  async refreshAccounts() {
    const accounts = await window.api.accounts.list()
    const stillSelected = accounts.some((a) => a.id === get().selectedAccountId)
    set({ accounts })
    if (!stillSelected) {
      if (accounts.length > 0) await get().selectAccount(accounts[0].id)
      else set({ selectedAccountId: null, selectedMailboxPath: null, selectedUid: null, isAccountDialogOpen: true })
    }
  },

  async selectAccount(accountId) {
    set({
      selectedAccountId: accountId,
      selectedMailboxPath: null,
      selectedUid: null,
      searchResults: null,
      selectedUids: new Set()
    })
    await get().refreshMailboxes(accountId)
    const boxes = get().mailboxesByAccount[accountId] ?? []
    const inbox = boxes.find((b) => b.specialUse === 'Inbox') ?? boxes[0]
    if (inbox) await get().selectMailbox(inbox.path)
  },

  async refreshMailboxes(accountId) {
    const boxes = await window.api.mailboxes.list(accountId)
    set((s) => ({ mailboxesByAccount: { ...s.mailboxesByAccount, [accountId]: boxes } }))
  },

  async selectMailbox(mailboxPath) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    set({ selectedMailboxPath: mailboxPath, selectedUid: null, searchResults: null, selectedUids: new Set() })
    const cached = await window.api.messages.list(accountId, mailboxPath)
    set((s) => ({ messagesByKey: { ...s.messagesByKey, [key(accountId, mailboxPath)]: dropPending(cached, s.pendingRemovals) } }))
    window.api.mail.sync(accountId, mailboxPath).catch(() => void 0)
  },

  async syncSelectedMailbox() {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    await window.api.mail.sync(accountId, mailboxPath)
    set({ lastSyncAt: Date.now() })
  },

  // What the "Get Mail" button runs. Unlike the background poll this reports
  // itself to the status bar from the click onwards, so the button always
  // visibly does something even when there turns out to be no new mail.
  async getMail() {
    const accountId = get().selectedAccountId
    if (!accountId || get().isManualSyncing) return
    set({ isManualSyncing: true, statusNotice: null })
    try {
      await get().refreshMailboxes(accountId)
      await get().syncSelectedMailbox()
      set({ lastSyncAt: Date.now() })
    } catch (err) {
      set({ statusNotice: `Couldn't check for mail: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      set({ isManualSyncing: false })
    }
  },

  setStatusNotice(notice) {
    set({ statusNotice: notice })
  },

  async selectMessage(uid) {
    // A plain click/selection always means "focus just this one" — any
    // multi-selection from a previous Ctrl/Cmd-click or Shift-click no
    // longer applies.
    set({ selectedUid: uid, selectedUids: new Set() })
    const current = findDisplayedMessage(get(), uid)
    if (!current) return
    const { accountId, mailboxPath } = current

    if (!current.flags.seen && get().settings?.markAsReadBehavior !== 'never') {
      await get().setFlags(uid, { seen: true })
    }

    const bodyKey = `${accountId}::${mailboxPath}::${uid}`
    if (!get().bodyCache[bodyKey]) {
      try {
        const body = await window.api.messages.getBody(accountId, mailboxPath, uid)
        set((s) => ({ bodyCache: { ...s.bodyCache, [bodyKey]: body } }))
      } catch (err) {
        // A message that's gone from the server already removed itself from
        // the list via the 'message-removed' event, so say nothing extra
        // here. Anything else is a genuine fetch failure worth surfacing
        // rather than leaving the reading pane mysteriously empty.
        if (!String(err).includes('TINY_MAIL_MESSAGE_GONE')) {
          set({
            statusNotice: `Couldn't load that message: ${err instanceof Error ? err.message : String(err)}`
          })
        }
      }
    }
  },

  async addAccount(config, password) {
    const account = await window.api.accounts.add(config, password)
    set((s) => ({ accounts: [...s.accounts, account], isAccountDialogOpen: false }))
    await get().selectAccount(account.id)
  },

  async removeAccount(accountId) {
    await window.api.accounts.remove(accountId)
    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== accountId) }))
    if (get().selectedAccountId === accountId) {
      const remaining = get().accounts
      if (remaining.length > 0) await get().selectAccount(remaining[0].id)
      else set({ selectedAccountId: null, selectedMailboxPath: null, selectedUid: null })
    }
  },

  setAccountDialogOpen(open) {
    set({ isAccountDialogOpen: open })
  },

  async setFlags(uid, flags) {
    const before = findDisplayedMessage(get(), uid)
    if (!before) return
    const { accountId, mailboxPath } = before
    const k = key(accountId, mailboxPath)

    const apply = (m: MessageSummary): MessageSummary =>
      m.mailboxPath === mailboxPath && m.uid === uid ? { ...m, flags: { ...m.flags, ...flags } } : m

    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).map(apply) },
      searchResults: s.searchResults?.map(apply) ?? null
    }))

    if (typeof flags.seen === 'boolean' && flags.seen !== before.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, flags.seen ? -1 : 1)
    }

    await window.api.messages.setFlags(accountId, mailboxPath, uid, flags)
  },

  async moveMessage(uid, destPath) {
    const moved = findDisplayedMessage(get(), uid)
    if (!moved) return
    const { accountId, mailboxPath } = moved
    if (mailboxPath === destPath) return
    const k = key(accountId, mailboxPath)
    const wasSelected = get().selectedUid === uid
    const wasInSearch = Boolean(get().searchResults)

    // Optimistic removal from the source list — rolled back below if the
    // server-side move actually fails, instead of just leaving the message
    // looking vanished (it hadn't actually gone anywhere). Tracked in
    // pendingRemovals too so a concurrent sync's own list refetch (which
    // overwrites this same list from the DB) can't resurrect it before the
    // move's own IMAP command — queued behind that sync on the same
    // mailbox lock — has actually gone through.
    const rKey = resultKey(moved)
    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      searchResults: withoutMessage(s.searchResults, mailboxPath, uid),
      selectedUid: wasSelected ? null : s.selectedUid,
      pendingRemovals: new Set(s.pendingRemovals).add(rKey)
    }))
    if (!moved.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, -1)
    }

    try {
      await window.api.messages.move(accountId, mailboxPath, uid, destPath)
    } catch (err) {
      set((s) => {
        const next = new Set(s.pendingRemovals)
        next.delete(rKey)
        return {
          messagesByKey: { ...s.messagesByKey, [k]: [...(s.messagesByKey[k] ?? []), moved] },
          searchResults: wasInSearch ? [...(s.searchResults ?? []), moved] : s.searchResults,
          selectedUid: wasSelected ? uid : s.selectedUid,
          pendingRemovals: next
        }
      })
      if (!moved.flags.seen) adjustUnreadCount(set, accountId, mailboxPath, 1)
      set({ statusNotice: `Couldn't move that message: ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    set((s) => {
      const next = new Set(s.pendingRemovals)
      next.delete(rKey)
      return { pendingRemovals: next, statusNotice: `Moved to ${destPath}` }
    })

    // The message gets a new UID in the destination mailbox, which we don't
    // know locally (IMAP MOVE/COPY doesn't hand it back in a form we parse
    // here) — pull the destination from the server instead of guessing.
    window.api.mail.sync(accountId, destPath).catch(() => void 0)
  },

  async deleteMessage(uid) {
    const removed = findDisplayedMessage(get(), uid)
    if (!removed) return
    const { accountId, mailboxPath } = removed
    const boxes = get().mailboxesByAccount[accountId] ?? []
    const overrides = get().accounts.find((a) => a.id === accountId)?.mailboxRoleOverrides
    const trash = resolveMailboxRole(boxes, 'Trash', overrides?.Trash)
    if (trash && trash.path !== mailboxPath) {
      await get().moveMessage(uid, trash.path)
      return
    }
    const k = key(accountId, mailboxPath)
    const rKey = resultKey(removed)

    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      searchResults: withoutMessage(s.searchResults, mailboxPath, uid),
      selectedUid: s.selectedUid === uid ? null : s.selectedUid,
      pendingRemovals: new Set(s.pendingRemovals).add(rKey)
    }))

    if (!removed.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, -1)
    }

    try {
      await window.api.messages.delete(accountId, mailboxPath, uid)
    } catch (err) {
      set((s) => {
        const next = new Set(s.pendingRemovals)
        next.delete(rKey)
        return {
          messagesByKey: { ...s.messagesByKey, [k]: [...(s.messagesByKey[k] ?? []), removed] },
          pendingRemovals: next
        }
      })
      if (!removed.flags.seen) adjustUnreadCount(set, accountId, mailboxPath, 1)
      set({ statusNotice: `Couldn't delete that message: ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    set((s) => {
      const next = new Set(s.pendingRemovals)
      next.delete(rKey)
      return { pendingRemovals: next }
    })
  },

  toggleMultiSelect(msg) {
    const k = resultKey(msg)
    set((s) => {
      // Ctrl/Cmd-clicking right after a plain click (selectedUids still
      // empty) should extend that single selection to two, not replace it —
      // standard desktop behavior ("click A, then Ctrl-click B" selects
      // both). Seed the set from whatever was plain-selected first.
      let base = s.selectedUids
      if (base.size === 0 && s.selectedUid != null) {
        const current = findDisplayedMessage(s, s.selectedUid)
        if (current) base = new Set([resultKey(current)])
      }
      const next = new Set(base)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return { selectedUids: next }
    })
  },

  setMultiSelection(keys) {
    set({ selectedUids: new Set(keys) })
  },

  clearMultiSelection() {
    set({ selectedUids: new Set() })
  },

  async bulkSetFlags(flags) {
    const selected = findDisplayedMessagesByKeys(get(), get().selectedUids)
    if (selected.length === 0) return
    const groups = groupByMailbox(selected)
    const selectedKeys = new Set(selected.map(resultKey))

    set((s) => {
      const nextMessagesByKey = { ...s.messagesByKey }
      for (const g of groups.values()) {
        const k = key(g.accountId, g.mailboxPath)
        const uidSet = new Set(g.uids)
        nextMessagesByKey[k] = (nextMessagesByKey[k] ?? []).map((m) =>
          uidSet.has(m.uid) ? { ...m, flags: { ...m.flags, ...flags } } : m
        )
      }
      return {
        messagesByKey: nextMessagesByKey,
        searchResults:
          s.searchResults?.map((m) => (selectedKeys.has(resultKey(m)) ? { ...m, flags: { ...m.flags, ...flags } } : m)) ??
          null
      }
    })

    if (typeof flags.seen === 'boolean') {
      for (const m of selected) {
        if (flags.seen !== m.flags.seen) adjustUnreadCount(set, m.accountId, m.mailboxPath, flags.seen ? -1 : 1)
      }
    }

    try {
      await Promise.all(
        [...groups.values()].map((g) => window.api.messages.bulkSetFlags(g.accountId, g.mailboxPath, g.uids, flags))
      )
    } catch (err) {
      set({ statusNotice: `Couldn't update some messages: ${err instanceof Error ? err.message : String(err)}` })
      for (const g of groups.values()) window.api.mail.sync(g.accountId, g.mailboxPath).catch(() => void 0)
    }
  },

  async bulkMove(destPath) {
    const selected = findDisplayedMessagesByKeys(get(), get().selectedUids)
    if (selected.length === 0) return
    try {
      await performBulkMove(set, selected, destPath)
      set({ statusNotice: `Moved ${selected.length} message${selected.length === 1 ? '' : 's'} to ${destPath}` })
    } catch {
      // performBulkMove already set an error statusNotice.
    }
  },

  // Routes each selected message to its own account's Trash, same as the
  // single-message deleteMessage — except when a message is already
  // sitting in Trash, which really does delete it permanently. A selection
  // can span accounts (a multi-account search result), so messages headed
  // to Trash are grouped by account first, since each account resolves its
  // own Trash folder independently.
  async bulkDelete() {
    const selected = findDisplayedMessagesByKeys(get(), get().selectedUids)
    if (selected.length === 0) return

    const toPurge: MessageSummary[] = []
    const toTrashByAccount = new Map<string, { trashPath: string; msgs: MessageSummary[] }>()
    for (const m of selected) {
      const boxes = get().mailboxesByAccount[m.accountId] ?? []
      const overrides = get().accounts.find((a) => a.id === m.accountId)?.mailboxRoleOverrides
      const trash = resolveMailboxRole(boxes, 'Trash', overrides?.Trash)
      if (trash && trash.path !== m.mailboxPath) {
        const entry = toTrashByAccount.get(m.accountId) ?? { trashPath: trash.path, msgs: [] }
        entry.msgs.push(m)
        toTrashByAccount.set(m.accountId, entry)
      } else {
        toPurge.push(m)
      }
    }

    try {
      for (const { trashPath, msgs } of toTrashByAccount.values()) {
        await performBulkMove(set, msgs, trashPath)
      }

      if (toPurge.length > 0) {
        const groups = groupByMailbox(toPurge)
        const removedKeys = new Set(toPurge.map(resultKey))
        set((s) => {
          const nextMessagesByKey = { ...s.messagesByKey }
          for (const g of groups.values()) {
            const k = key(g.accountId, g.mailboxPath)
            nextMessagesByKey[k] = (nextMessagesByKey[k] ?? []).filter((m) => !removedKeys.has(resultKey(m)))
          }
          const nextPending = new Set(s.pendingRemovals)
          for (const rk of removedKeys) nextPending.add(rk)
          return {
            messagesByKey: nextMessagesByKey,
            searchResults: s.searchResults?.filter((m) => !removedKeys.has(resultKey(m))) ?? null,
            selectedUid: toPurge.some((m) => m.uid === s.selectedUid) ? null : s.selectedUid,
            selectedUids: new Set<string>(),
            pendingRemovals: nextPending
          }
        })
        for (const m of toPurge) {
          if (!m.flags.seen) adjustUnreadCount(set, m.accountId, m.mailboxPath, -1)
        }
        try {
          await Promise.all(
            [...groups.values()].map((g) => window.api.messages.bulkDelete(g.accountId, g.mailboxPath, g.uids))
          )
        } finally {
          set((s) => {
            const nextPending = new Set(s.pendingRemovals)
            for (const rk of removedKeys) nextPending.delete(rk)
            return { pendingRemovals: nextPending }
          })
        }
      }

      set({ statusNotice: `Deleted ${selected.length} message${selected.length === 1 ? '' : 's'}` })
    } catch (err) {
      set({ statusNotice: `Couldn't delete some messages: ${err instanceof Error ? err.message : String(err)}` })
      const groups = groupByMailbox(selected)
      for (const g of groups.values()) window.api.mail.sync(g.accountId, g.mailboxPath).catch(() => void 0)
    }
  },

  async search(query) {
    const accountId = get().selectedAccountId
    set({ searchQuery: query })
    if (serverSearchTimer) clearTimeout(serverSearchTimer)

    const trimmed = query.trim()
    if (!accountId || !trimmed) {
      serverSearchToken++
      set({ searchResults: null, isSearchingServer: false })
      return
    }

    const s0 = get()
    const options: SearchOptions = {
      mailboxPath: s0.searchScope === 'current' ? s0.selectedMailboxPath : null,
      sinceDays: s0.searchSinceDays,
      fields: s0.searchFields,
      hasAttachment: s0.searchHasAttachment
    }

    const results = await window.api.messages.search(accountId, trimmed, options)
    set({ searchResults: results })

    const myToken = ++serverSearchToken
    serverSearchTimer = setTimeout(async () => {
      set({ isSearchingServer: true })
      try {
        const serverResults = await window.api.messages.searchServer(accountId, trimmed, options)
        // The query may have changed (or search may have been cleared)
        // while this round trip was in flight — drop stale results.
        if (myToken !== serverSearchToken) return
        set((s) => {
          const seen = new Set((s.searchResults ?? []).map(resultKey))
          const merged = [...(s.searchResults ?? [])]
          for (const m of serverResults) {
            const k = resultKey(m)
            if (!seen.has(k)) {
              seen.add(k)
              merged.push(m)
            }
          }
          merged.sort((a, b) => (a.date < b.date ? 1 : -1))
          return { searchResults: merged }
        })
      } finally {
        if (myToken === serverSearchToken) set({ isSearchingServer: false })
      }
    }, 500)
  },

  clearSearch() {
    if (serverSearchTimer) clearTimeout(serverSearchTimer)
    serverSearchToken++
    set({ searchQuery: '', searchResults: null, isSearchingServer: false })
  },

  setSearchScope(scope) {
    set({ searchScope: scope })
    const { searchQuery, search } = get()
    if (searchQuery.trim()) search(searchQuery)
  },

  setSearchSinceDays(days) {
    set({ searchSinceDays: days })
    const { searchQuery, search } = get()
    if (searchQuery.trim()) search(searchQuery)
  },

  setSearchFields(fields) {
    set({ searchFields: fields })
    const { searchQuery, search } = get()
    if (searchQuery.trim()) search(searchQuery)
  },

  setSearchHasAttachment(value) {
    set({ searchHasAttachment: value })
    const { searchQuery, search } = get()
    if (searchQuery.trim()) search(searchQuery)
  },

  openCompose(mode, seed) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    window.api.compose.openWindow({ accountId, mode, draft: seed ?? {} })
  },

  async createMailbox(name, parentPath) {
    const accountId = get().selectedAccountId
    if (!accountId || !name.trim()) return
    try {
      await window.api.mailboxes.create(accountId, name.trim(), parentPath)
    } catch (err) {
      window.alert(`Couldn't create that mailbox: ${err instanceof Error ? err.message : String(err)}`)
    }
    await get().refreshMailboxes(accountId)
  },

  async renameMailbox(path, newName) {
    const accountId = get().selectedAccountId
    if (!accountId || !newName.trim()) return
    try {
      await window.api.mailboxes.rename(accountId, path, newName.trim())
    } catch (err) {
      window.alert(`Couldn't rename that mailbox: ${err instanceof Error ? err.message : String(err)}`)
    }
    await get().refreshMailboxes(accountId)
  },

  async deleteMailbox(path) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    if (get().selectedMailboxPath === path) set({ selectedMailboxPath: null, selectedUid: null })
    try {
      await window.api.mailboxes.delete(accountId, path)
    } catch (err) {
      window.alert(`Couldn't delete that mailbox: ${err instanceof Error ? err.message : String(err)}`)
    }
    await get().refreshMailboxes(accountId)
  },

  async emptyMailbox(path) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    try {
      await window.api.mailboxes.empty(accountId, path)
    } catch (err) {
      window.alert(`Couldn't empty that mailbox: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (get().selectedMailboxPath === path) {
      set((s) => ({ messagesByKey: { ...s.messagesByKey, [key(accountId, path)]: [] }, selectedUid: null }))
    }
    await get().refreshMailboxes(accountId)
  }
}))
