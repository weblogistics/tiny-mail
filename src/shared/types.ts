export interface AccountConfig {
  id: string
  displayName: string
  email: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  color: string
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

export type MailEventPayload =
  | { type: 'sync-progress'; data: SyncProgress }
  | { type: 'mailbox-updated'; data: MailboxSummary }
  | { type: 'new-message'; data: MessageSummary }
  | { type: 'account-status'; data: { accountId: string; status: 'connecting' | 'online' | 'offline' | 'error'; error?: string } }
