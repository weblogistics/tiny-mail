// 'ssl' = implicit TLS (connect straight into a TLS handshake, e.g. ports
// 993/465). 'starttls' = connect in plain text and explicitly upgrade
// (e.g. ports 143/587) — this is what most "submission port" SMTP servers
// expect. 'none' = never encrypt, including refusing an opportunistic
// upgrade even if the server offers one.
export type ConnectionSecurity = 'ssl' | 'starttls' | 'none'

export interface AccountConfig {
  id: string
  displayName: string
  email: string
  imapHost: string
  imapPort: number
  imapSecurity: ConnectionSecurity
  smtpHost: string
  smtpPort: number
  smtpSecurity: ConnectionSecurity
  username: string
  color: string
  signature: string
}

// A password is only included when the user is changing it; omitting it
// during an update leaves the stored credential untouched.
export interface AccountUpdate {
  id: string
  config: Omit<AccountConfig, 'id'>
  password?: string
}

// Credentials are kept separate from AccountConfig so they never round-trip
// through the renderer or get logged alongside account metadata.
export interface AccountCredentialsInput {
  password: string
}

export type SpecialUse = 'Inbox' | 'Sent' | 'Drafts' | 'Trash' | 'Junk' | 'Archive' | null

export interface MailboxSummary {
  accountId: string
  path: string
  name: string
  specialUse: SpecialUse
  unreadCount: number
  totalCount: number
  flags: string[]
  delimiter: string
}

export interface MessageAddress {
  name: string
  address: string
}

export interface MessageFlags {
  seen: boolean
  flagged: boolean
  answered: boolean
  draft: boolean
  deleted: boolean
}

export interface MessageSummary {
  accountId: string
  mailboxPath: string
  uid: number
  messageId: string
  subject: string
  from: MessageAddress[]
  to: MessageAddress[]
  cc: MessageAddress[]
  date: string
  flags: MessageFlags
  hasAttachments: boolean
  snippet: string
}

export interface MessageAttachment {
  filename: string
  contentType: string
  size: number
  partId: string
  contentId?: string
  inline: boolean
}

export interface MessageBody {
  accountId: string
  mailboxPath: string
  uid: number
  html: string | null
  text: string | null
  attachments: MessageAttachment[]
}

export interface ComposeDraft {
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  inReplyTo?: string
  references?: string
  attachments: ComposeAttachment[]
}

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export interface ComposeSeed {
  accountId: string
  mode: ComposeMode
  draft: Partial<ComposeDraft>
}

export interface ComposeAttachment {
  filename: string
  contentType: string
  path: string
  size: number
}

export interface SyncProgress {
  accountId: string
  mailboxPath: string
  fetched: number
  total: number
  done: boolean
}

export interface AppSettings {
  markAsReadBehavior: 'instant' | 'never'
  loadRemoteImagesByDefault: boolean
  syncIntervalSeconds: number
}

export type MailEventPayload =
  | { type: 'sync-progress'; data: SyncProgress }
  | { type: 'mailbox-updated'; data: MailboxSummary }
  | { type: 'new-message'; data: MessageSummary }
  | { type: 'account-status'; data: { accountId: string; status: 'connecting' | 'online' | 'offline' | 'error'; error?: string } }
  | { type: 'settings-updated'; data: AppSettings }
  | { type: 'accounts-changed'; data: null }
