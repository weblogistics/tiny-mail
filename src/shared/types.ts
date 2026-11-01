// 'ssl' = implicit TLS (connect straight into a TLS handshake, e.g. ports
// 993/465). 'starttls' = connect in plain text and explicitly upgrade
// (e.g. ports 143/587) — this is what most "submission port" SMTP servers
// expect. 'none' = never encrypt, including refusing an opportunistic
// upgrade even if the server offers one.
export type ConnectionSecurity = 'ssl' | 'starttls' | 'none'

// The special-use roles a mailbox can be assigned to beyond ordinary
// folders. Excludes 'Inbox': IMAP guarantees exactly one INBOX per account,
// so there's never ambiguity to resolve or override there.
export type MailboxRole = 'Sent' | 'Drafts' | 'Trash' | 'Junk' | 'Archive'

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
  // Which physical mailbox to treat as "the" Sent/Trash/etc folder when
  // more than one plausibly matches — common on a server that doesn't
  // advertise IMAP SPECIAL-USE flags, where name-pattern matching alone can
  // tag several differently-located folders the same way (a top-level
  // "Sent" and a per-correspondent "Sent" folder are both named "Sent").
  // A role absent from this map means "resolve it automatically" — see
  // resolveMailboxRole.
  mailboxRoleOverrides: Partial<Record<MailboxRole, string>>
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
  // Whether specialUse came from the server's own IMAP SPECIAL-USE flag
  // (authoritative) rather than Tiny Mail guessing from the mailbox's name
  // (a fallback for servers that don't advertise SPECIAL-USE at all, and
  // the reason more than one mailbox can end up with the same specialUse —
  // see resolveMailboxRole, which uses this to make sure a real flag always
  // outranks a coincidentally-named look-alike when choosing between them).
  specialUseFromServer: boolean
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
  // Separate from `from` on MessageSummary because they're different trust
  // signals: From is whatever the message claims (trivially spoofable),
  // Reply-To is where a reply actually goes (a classic phishing mismatch —
  // display name says your bank, Reply-To is an attacker's inbox), and
  // Return-Path is the SMTP envelope sender the receiving server actually
  // recorded, which is harder to fake than either header.
  replyTo: MessageAddress[]
  returnPath: string | null
  // The raw header block exactly as received (folding and casing intact),
  // for "View Headers" — Authentication-Results (SPF/DKIM/DMARC) and the
  // Received chain only exist here, not in any parsed field above.
  rawHeaders: string
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
  size: number
  // A regular "attach a file" entry has `path` pointing at a file on disk.
  // An inline image inserted into the compose body instead carries its
  // bytes directly as `contentBase64` (there's no file — it came from a
  // data: URL the user pasted/inserted) plus a `cid` that the HTML
  // references via `cid:<cid>` so the mail client renders it inline rather
  // than listing it as a separate attachment.
  path?: string
  contentBase64?: string
  cid?: string
  inline?: boolean
}

export interface Contact {
  address: string
  name: string
}

export interface SyncProgress {
  accountId: string
  mailboxPath: string
  fetched: number
  total: number
  done: boolean
}

// 'interval' polls on a timer (syncIntervalSeconds); 'push' relies on the
// IMAP server notifying the open connection as new mail arrives (IDLE),
// skipping the timer entirely. Push only covers whichever mailbox is
// currently open per account — the one you're looking at — not every
// folder at once, since IMAP only lets one mailbox be selected per
// connection at a time.
export type SyncMode = 'interval' | 'push'

export interface AppSettings {
  markAsReadBehavior: 'instant' | 'never'
  loadRemoteImagesByDefault: boolean
  syncMode: SyncMode
  syncIntervalSeconds: number
  groupByThread: boolean
  // How far back to download message history per mailbox, in days.
  // 0 means "All Mail" — no date cutoff, every message in the mailbox.
  syncLookbackDays: number
}

export type MailEventPayload =
  | { type: 'sync-progress'; data: SyncProgress }
  | { type: 'mailbox-updated'; data: MailboxSummary }
  | { type: 'new-message'; data: MessageSummary }
  | { type: 'message-removed'; data: { accountId: string; mailboxPath: string; uid: number } }
  | { type: 'account-status'; data: { accountId: string; status: 'connecting' | 'online' | 'offline' | 'error'; error?: string } }
  | { type: 'settings-updated'; data: AppSettings }
  | { type: 'accounts-changed'; data: null }
