import type {
  AccountConfig,
  AppSettings,
  ComposeAttachment,
  ComposeDraft,
  ComposeSeed,
  Contact,
  MailboxSummary,
  MailEventPayload,
  MessageBody,
  MessageSummary
} from './types'

export interface TinyMailApi {
  accounts: {
    list(): Promise<AccountConfig[]>
    add(config: Omit<AccountConfig, 'id'>, password: string): Promise<AccountConfig>
    update(accountId: string, config: Omit<AccountConfig, 'id'>, password?: string): Promise<AccountConfig>
    remove(accountId: string): Promise<void>
    testConnection(
      config: Omit<AccountConfig, 'id'>,
      password: string
    ): Promise<{ ok: true } | { ok: false; error: string }>
  }
  mailboxes: {
    list(accountId: string): Promise<MailboxSummary[]>
    create(accountId: string, name: string, parentPath?: string | null): Promise<void>
    rename(accountId: string, path: string, newName: string): Promise<void>
    delete(accountId: string, path: string): Promise<void>
    empty(accountId: string, path: string): Promise<void>
  }
  messages: {
    list(accountId: string, mailboxPath: string): Promise<MessageSummary[]>
    search(accountId: string, query: string): Promise<MessageSummary[]>
    searchServer(accountId: string, query: string): Promise<MessageSummary[]>
    getBody(accountId: string, mailboxPath: string, uid: number): Promise<MessageBody>
    setFlags(
      accountId: string,
      mailboxPath: string,
      uid: number,
      flags: Partial<MessageSummary['flags']>
    ): Promise<void>
    move(accountId: string, mailboxPath: string, uid: number, destPath: string): Promise<void>
    delete(accountId: string, mailboxPath: string, uid: number): Promise<void>
  }
  mail: {
    sync(accountId: string, mailboxPath: string): Promise<void>
    openAttachment(accountId: string, mailboxPath: string, uid: number, partId: string): Promise<void>
    saveAttachment(accountId: string, mailboxPath: string, uid: number, partId: string): Promise<void>
  }
  compose: {
    send(draft: ComposeDraft): Promise<void>
    saveDraft(draft: ComposeDraft): Promise<void>
    pickAttachments(): Promise<ComposeAttachment[]>
    openWindow(seed: ComposeSeed): Promise<void>
    getInit(): Promise<ComposeSeed | undefined>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    openWindow(): Promise<void>
  }
  addressBook: {
    search(query: string): Promise<Contact[]>
  }
  events: {
    subscribe(listener: (payload: MailEventPayload) => void): () => void
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
  }
}

declare global {
  interface Window {
    api: TinyMailApi
  }
}
