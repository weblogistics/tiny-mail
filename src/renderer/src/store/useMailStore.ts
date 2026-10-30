import { create } from 'zustand'
import type {
  AccountConfig,
  ComposeDraft,
  MailboxSummary,
  MessageBody,
  MessageSummary,
  SyncProgress
} from '@shared/types'

function key(accountId: string, mailboxPath: string): string {
  return `${accountId}::${mailboxPath}`
}

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeState {
  open: boolean
  mode: ComposeMode
  draft: ComposeDraft
}

const emptyDraft = (accountId: string): ComposeDraft => ({
  accountId,
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  html: '',
  attachments: []
})

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
  compose: ComposeState | null

  init(): Promise<void>
  selectAccount(accountId: string): Promise<void>
  selectMailbox(mailboxPath: string): Promise<void>
  selectMessage(uid: number): Promise<void>
  refreshMailboxes(accountId: string): Promise<void>
  addAccount(config: Omit<AccountConfig, 'id'>, password: string): Promise<void>
  removeAccount(accountId: string): Promise<void>
  setAccountDialogOpen(open: boolean): void
  setFlags(uid: number, flags: Partial<MessageSummary['flags']>): Promise<void>
  moveMessage(uid: number, destPath: string): Promise<void>
  deleteMessage(uid: number): Promise<void>
  search(query: string): Promise<void>
  clearSearch(): void
  openCompose(mode: ComposeMode, seed?: Partial<ComposeDraft>): void
  updateCompose(patch: Partial<ComposeDraft>): void
  closeCompose(): void
  sendCompose(): Promise<void>
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
  compose: null,

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
      }
    })

    const accounts = await window.api.accounts.list()
    set({ accounts })
    if (accounts.length > 0) {
      await get().selectAccount(accounts[0].id)
    } else {
      set({ isAccountDialogOpen: true })
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

  async selectMessage(uid) {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    set({ selectedUid: uid })

    const current = get().messagesByKey[key(accountId, mailboxPath)]?.find((m) => m.uid === uid)
    if (current && !current.flags.seen) {
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
    set((s) => ({
      messagesByKey: {
        ...s.messagesByKey,
        [k]: (s.messagesByKey[k] ?? []).map((m) => (m.uid === uid ? { ...m, flags: { ...m.flags, ...flags } } : m))
      }
    }))
    await window.api.messages.setFlags(accountId, mailboxPath, uid, flags)
  },

  async moveMessage(uid, destPath) {
    const accountId = get().selectedAccountId
    const mailboxPath = get().selectedMailboxPath
    if (!accountId || !mailboxPath) return
    const k = key(accountId, mailboxPath)
    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      selectedUid: s.selectedUid === uid ? null : s.selectedUid
    }))
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
    set((s) => ({
      messagesByKey: { ...s.messagesByKey, [k]: (s.messagesByKey[k] ?? []).filter((m) => m.uid !== uid) },
      selectedUid: s.selectedUid === uid ? null : s.selectedUid
    }))
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
    set({ compose: { open: true, mode, draft: { ...emptyDraft(accountId), ...seed } } })
  },

  updateCompose(patch) {
    set((s) => (s.compose ? { compose: { ...s.compose, draft: { ...s.compose.draft, ...patch } } } : s))
  },

  closeCompose() {
    set({ compose: null })
  },

  async sendCompose() {
    const compose = get().compose
    if (!compose) return
    await window.api.compose.send(compose.draft)
    set({ compose: null })
  }
}))
