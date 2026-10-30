import type {
  AccountConfig,
  ComposeDraft,
  MailboxSummary,
  MailEventPayload,
  MessageBody,
  MessageSummary
} from './types'

export interface TinyMailApi {
  accounts: {
    list(): Promise<AccountConfig[]>
    add(config: Omit<AccountConfig, 'id'>, password: string): Promise<AccountConfig>
    remove(accountId: string): Promise<void>
    testConnection(
      config: Omit<AccountConfig, 'id'>,
      password: string
    ): Promise<{ ok: true } | { ok: false; error: string }>
  }
  mailboxes: {
    list(accountId: string): Promise<MailboxSummary[]>
  }
  messages: {
    list(accountId: string, mailboxPath: string): Promise<MessageSummary[]>
    search(accountId: string, query: string): Promise<MessageSummary[]>
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
  }
  compose: {
    send(draft: ComposeDraft): Promise<void>
    saveDraft(draft: ComposeDraft): Promise<void>
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
