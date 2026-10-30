import { create } from 'zustand'
import type {
  AccountConfig,
  AppSettings,
  ComposeDraft,
  ComposeMode,
  MailboxSummary,
  MessageBody,
  MessageSummary,
  SyncProgress
} from '@shared/types'

function key(accountId: string, mailboxPath: string): string {
  return `${accountId}::${mailboxPath}`
}

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
  selectedUid: number | null
  bodyCache: Record<string, MessageBody>
  syncStatus: Record<string, SyncProgress>
  accountStatus: Record<string, 'connecting' | 'online' | 'offline' | 'error'>
  searchQuery: string
  searchResults: MessageSummary[] | null
  isAccountDialogOpen: boolean
  settings: AppSettings | null

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
  search(query: string): Promise<void>
  clearSearch(): void
  openCompose(mode: ComposeMode, seed?: Partial<ComposeDraft>): void
  createMailbox(name: string): Promise<void>
  renameMailbox(path: string, newName: string): Promise<void>
  deleteMailbox(path: string): Promise<void>
}

export const useMailStore = create<MailState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  mailboxesByAccount: {},
  selectedMailboxPath: null,
  messagesByKey: {},
  selectedUid: null,
  bodyCache: {},
  syncStatus: {},
  accountStatus: {},
  searchQuery: '',
  searchResults: null,
  isAccountDialogOpen: false,
  settings: null,

  async init() {
    window.api.events.subscribe((payload) => {
      if (payload.type === 'sync-progress') {
        set((s) => ({ syncStatus: { ...s.syncStatus, [key(payload.data.accountId, payload.data.mailboxPath)]: payload.data } }))
        if (payload.data.accountId === get().selectedAccountId && payload.data.mailboxPath === get().selectedMailboxPath) {
          window.api.messages.list(payload.data.accountId, payload.data.mailboxPath).then((msgs) => {
            set((s) => ({ messagesByKey: { ...s.messagesByKey, [key(payload.data.accountId, payload.data.mailboxPath)]: msgs } }))
          })
        }
      } else if (payload.type === 'mailbox-updated') {
        set((s) => {
          const list = s.mailboxesByAccount[payload.data.accountId] ?? []
          const idx = list.findIndex((m) => m.path === payload.data.path)
          const next = idx >= 0 ? [...list.slice(0, idx), payload.data, ...list.slice(idx + 1)] : [...list, payload.data]
          return { mailboxesByAccount: { ...s.mailboxesByAccount, [payload.data.accountId]: next } }
        })
      } else if (payload.type === 'account-status') {
        set((s) => ({ accountStatus: { ...s.accountStatus, [payload.data.accountId]: payload.data.status } }))
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
    set({ selectedAccountId: accountId, selectedMailboxPath: null, selectedUid: null, searchResults: null })
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
    set({ selectedMailboxPath: mailboxPath, selectedUid: null, searchResults: null })
    const cached = await window.api.messages.list(accountId, mailboxPath)
    set((s) => ({ messagesByKey: { ...s.messagesByKey, [key(accountId, mailboxPath)]: cached } }))
    window.api.mail.sync(accountId, mailboxPath).catch(() => void 0)
  },

  async syncSelectedMailbox() {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    await window.api.mail.sync(accountId, mailboxPath)
  },

  async selectMessage(uid) {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    set({ selectedUid: uid })

    const current = get().messagesByKey[key(accountId, mailboxPath)]?.find((m) => m.uid === uid)
    if (current && !current.flags.seen && get().settings?.markAsReadBehavior !== 'never') {
      await get().setFlags(uid, { seen: true })
    }

    const bodyKey = `${accountId}::${mailboxPath}::${uid}`
    if (!get().bodyCache[bodyKey]) {
      const body = await window.api.messages.getBody(accountId, mailboxPath, uid)
      set((s) => ({ bodyCache: { ...s.bodyCache, [bodyKey]: body } }))
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
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    const k = key(accountId, mailboxPath)
    const before = get().messagesByKey[k]?.find((m) => m.uid === uid)

    set((s) => ({
      messagesByKey: {
        ...s.messagesByKey,
        [k]: (s.messagesByKey[k] ?? []).map((m) => (m.uid === uid ? { ...m, flags: { ...m.flags, ...flags } } : m))
      }
    }))

    if (before && typeof flags.seen === 'boolean' && flags.seen !== before.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, flags.seen ? -1 : 1)
    }

    await window.api.messages.setFlags(accountId, mailboxPath, uid, flags)
  },

  async moveMessage(uid, destPath) {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    const k = key(accountId, mailboxPath)
    const moved = get().messagesByKey[k]?.find((m) => m.uid === uid)

    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      selectedUid: s.selectedUid === uid ? null : s.selectedUid
    }))

    if (moved && !moved.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, -1)
    }

    await window.api.messages.move(accountId, mailboxPath, uid, destPath)
  },

  async deleteMessage(uid) {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    const boxes = get().mailboxesByAccount[accountId] ?? []
    const trash = boxes.find((b) => b.specialUse === 'Trash')
    if (trash && trash.path !== mailboxPath) {
      await get().moveMessage(uid, trash.path)
      return
    }
    const k = key(accountId, mailboxPath)
    const removed = get().messagesByKey[k]?.find((m) => m.uid === uid)

    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      selectedUid: s.selectedUid === uid ? null : s.selectedUid
    }))

    if (removed && !removed.flags.seen) {
      adjustUnreadCount(set, accountId, mailboxPath, -1)
    }

    await window.api.messages.delete(accountId, mailboxPath, uid)
  },

  async search(query) {
    const accountId = get().selectedAccountId
    set({ searchQuery: query })
    if (!accountId || !query.trim()) {
      set({ searchResults: null })
      return
    }
    const results = await window.api.messages.search(accountId, query)
    set({ searchResults: results })
  },

  clearSearch() {
    set({ searchQuery: '', searchResults: null })
  },

  openCompose(mode, seed) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    window.api.compose.openWindow({ accountId, mode, draft: seed ?? {} })
  },

  async createMailbox(name) {
    const accountId = get().selectedAccountId
    if (!accountId || !name.trim()) return
    await window.api.mailboxes.create(accountId, name.trim())
    await get().refreshMailboxes(accountId)
  },

  async renameMailbox(path, newName) {
    const accountId = get().selectedAccountId
    if (!accountId || !newName.trim()) return
    await window.api.mailboxes.rename(accountId, path, newName.trim())
    await get().refreshMailboxes(accountId)
  },

  async deleteMailbox(path) {
    const accountId = get().selectedAccountId
    if (!accountId) return
    if (get().selectedMailboxPath === path) set({ selectedMailboxPath: null, selectedUid: null })
    await window.api.mailboxes.delete(accountId, path)
    await get().refreshMailboxes(accountId)
  }
}))
