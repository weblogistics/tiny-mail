import { ImapFlow, type MailboxObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { AccountStore } from '../accounts/accountStore'
import {
  getMessageBody,
  listMailboxes as cachedListMailboxes,
  listMessages as cachedListMessages,
  removeMailbox as removeCachedMailbox,
  removeMessage,
  saveMessageBody,
  setMessageFlags,
  upsertMailbox,
  upsertMessage
} from '../db/messageCache'
import { analyzeBodyStructure } from './bodyStructure'
import type {
  MailboxSummary,
  MailEventPayload,
  MessageAddress,
  MessageAttachment,
  MessageBody,
  MessageSummary,
  SpecialUse
} from '@shared/types'

type Emit = (payload: MailEventPayload) => void

const SPECIAL_USE_MAP: Record<string, SpecialUse> = {
  '\\Inbox': 'Inbox',
  '\\Sent': 'Sent',
  '\\Drafts': 'Drafts',
  '\\Trash': 'Trash',
  '\\Junk': 'Junk',
  '\\Archive': 'Archive'
}

function toAddresses(list?: { name?: string; address?: string }[]): MessageAddress[] {
  if (!list) return []
  return list.map((a) => ({ name: a.name || '', address: a.address || '' }))
}

// Many self-hosted/smaller IMAP servers don't advertise RFC 6154 SPECIAL-USE
// flags, so fall back to recognizing common folder names.
const NAME_FALLBACK_PATTERNS: [RegExp, SpecialUse][] = [
  [/^inbox$/i, 'Inbox'],
  [/^(sent|sent items|sent mail|sent messages)$/i, 'Sent'],
  [/^(drafts?)$/i, 'Drafts'],
  [/^(trash|deleted items|deleted messages)$/i, 'Trash'],
  [/^(junk|spam|bulk mail)$/i, 'Junk'],
  [/^(archive|all mail)$/i, 'Archive']
]

function inferSpecialUseFromName(name: string): SpecialUse {
  for (const [pattern, use] of NAME_FALLBACK_PATTERNS) {
    if (pattern.test(name)) return use
  }
  return null
}

export class ImapService {
  private clients = new Map<string, ImapFlow>()

  constructor(
    private accountStore: AccountStore,
    private emit: Emit
  ) {}

  private async getClient(accountId: string): Promise<ImapFlow> {
    const existing = this.clients.get(accountId)
    if (existing && existing.usable) return existing

    const account = this.accountStore.get(accountId)
    if (!account) throw new Error(`Unknown account: ${accountId}`)
    const password = this.accountStore.getPassword(accountId)

    this.emit({ type: 'account-status', data: { accountId, status: 'connecting' } })

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: { user: account.username, pass: password },
      logger: false
    })

    client.on('error', (err: Error) => {
      this.emit({ type: 'account-status', data: { accountId, status: 'error', error: err.message } })
    })

    try {
      await client.connect()
    } catch (err) {
      this.emit({
        type: 'account-status',
        data: { accountId, status: 'error', error: err instanceof Error ? err.message : String(err) }
      })
      throw err
    }

    this.emit({ type: 'account-status', data: { accountId, status: 'online' } })
    this.clients.set(accountId, client)
    return client
  }

  async testConnection(accountId: string): Promise<void> {
    const client = await this.getClient(accountId)
    await client.noop()
  }

  async listMailboxes(accountId: string): Promise<MailboxSummary[]> {
    const client = await this.getClient(accountId)
    const list = await client.list()

    const summaries: MailboxSummary[] = []
    for (const mailbox of list) {
      const specialUseRaw = (mailbox.specialUse || '') as string
      const specialUse =
        SPECIAL_USE_MAP[specialUseRaw] ??
        (mailbox.flags?.has('\\Inbox') ? 'Inbox' : null) ??
        inferSpecialUseFromName(mailbox.name)

      let unreadCount = 0
      let totalCount = 0
      try {
        const status = await client.status(mailbox.path, { messages: true, unseen: true })
        unreadCount = status.unseen ?? 0
        totalCount = status.messages ?? 0
      } catch {
        // Some servers refuse STATUS on \Noselect mailboxes; leave counts at 0.
      }

      const summary: MailboxSummary = {
        accountId,
        path: mailbox.path,
        name: mailbox.name,
        specialUse,
        unreadCount,
        totalCount,
        flags: Array.from(mailbox.flags ?? []),
        delimiter: mailbox.delimiter || '/'
      }
      summaries.push(summary)
      upsertMailbox(summary)
    }
    return summaries
  }

  getCachedMailboxes(accountId: string): MailboxSummary[] {
    return cachedListMailboxes(accountId)
  }

  getCachedMessages(accountId: string, mailboxPath: string): MessageSummary[] {
    return cachedListMessages(accountId, mailboxPath)
  }

  async syncMailbox(accountId: string, mailboxPath: string, limit = 200): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const mailbox = client.mailbox as MailboxObject
      const total = mailbox.exists
      if (total === 0) {
        this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched: 0, total: 0, done: true } })
        return
      }

      const start = Math.max(1, total - limit + 1)
      const range = `${start}:*`

      // A message's content (and so its snippet) never changes once fetched,
      // only its flags do. Re-downloading every snippet on every sync/poll
      // was both wasteful and, worse, visibly clobbered the cached preview
      // text with '' for an instant before refilling it — the "list flashes
      // blank then repopulates" bug. So: look up what's cached first, keep
      // an existing snippet as-is, and only fetch one for messages that
      // don't have one yet.
      const existingByUid = new Map(cachedListMessages(accountId, mailboxPath).map((m) => [m.uid, m]))

      // Phase 1: drain the FETCH command fully before issuing any other
      // command on this connection. ImapFlow serializes commands on a
      // connection, so calling client.download() mid-iteration here would
      // queue behind this still-open FETCH and deadlock forever (fetch is
      // waiting to be iterated further, download is waiting for fetch to
      // finish) with no error or timeout.
      interface PendingMessage {
        uid: number
        summary: MessageSummary
        snippetPartId: string | null
      }
      const pending: PendingMessage[] = []

      for await (const msg of client.fetch(
        range,
        { envelope: true, flags: true, bodyStructure: true, uid: true },
        { uid: false }
      )) {
        const { hasAttachments, snippetPartId } = analyzeBodyStructure(msg.bodyStructure as never)
        const existing = existingByUid.get(msg.uid)
        const summary: MessageSummary = {
          accountId,
          mailboxPath,
          uid: msg.uid,
          messageId: msg.envelope?.messageId || '',
          subject: msg.envelope?.subject || '(no subject)',
          from: toAddresses(msg.envelope?.from),
          to: toAddresses(msg.envelope?.to),
          cc: toAddresses(msg.envelope?.cc),
          date: (msg.envelope?.date || new Date()).toISOString(),
          flags: {
            seen: msg.flags?.has('\\Seen') ?? false,
            flagged: msg.flags?.has('\\Flagged') ?? false,
            answered: msg.flags?.has('\\Answered') ?? false,
            draft: msg.flags?.has('\\Draft') ?? false,
            deleted: msg.flags?.has('\\Deleted') ?? false
          },
          hasAttachments,
          snippet: existing?.snippet ?? ''
        }
        if (!existing || !existing.snippet) {
          pending.push({ uid: msg.uid, summary, snippetPartId })
        }
        upsertMessage(summary)
      }

      // Phase 2: the FETCH command is closed now, so it's safe to issue
      // DOWNLOAD commands on the same connection to backfill snippets —
      // only for messages that didn't already have one cached.
      let fetched = 0
      for (const item of pending) {
        if (item.snippetPartId) {
          try {
            const { content } = await client.download(String(item.uid), item.snippetPartId, {
              uid: true,
              maxBytes: 2000
            })
            const chunks: Buffer[] = []
            for await (const chunk of content) chunks.push(chunk as Buffer)
            item.summary.snippet = Buffer.concat(chunks)
              .toString('utf-8')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 220)
            upsertMessage(item.summary)
          } catch {
            // Leave snippet blank; the message itself synced fine.
          }
        }
        fetched += 1
        this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched, total, done: false } })
      }

      this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched: pending.length, total, done: true } })
    } finally {
      lock.release()
    }
  }

  async getMessageBody(accountId: string, mailboxPath: string, uid: number): Promise<MessageBody> {
    const cached = getMessageBody(accountId, mailboxPath, uid)
    if (cached) return cached

    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    let parsed: Awaited<ReturnType<typeof simpleParser>>
    try {
      const { content } = await client.download(String(uid), undefined, { uid: true })
      parsed = await simpleParser(content)
    } finally {
      lock.release()
    }

    const attachments: MessageAttachment[] = (parsed.attachments || []).map((a, idx) => ({
      filename: a.filename || `attachment-${idx + 1}`,
      contentType: a.contentType,
      size: a.size,
      partId: String(idx),
      contentId: a.cid,
      inline: a.contentDisposition === 'inline'
    }))

    const body: MessageBody = {
      accountId,
      mailboxPath,
      uid,
      html: typeof parsed.html === 'string' ? parsed.html : null,
      text: parsed.text || null,
      attachments
    }
    saveMessageBody(body)
    return body
  }

  async setFlags(
    accountId: string,
    mailboxPath: string,
    uid: number,
    flags: Partial<MessageSummary['flags']>
  ): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const add: string[] = []
      const remove: string[] = []
      if (flags.seen === true) add.push('\\Seen')
      if (flags.seen === false) remove.push('\\Seen')
      if (flags.flagged === true) add.push('\\Flagged')
      if (flags.flagged === false) remove.push('\\Flagged')
      if (flags.answered === true) add.push('\\Answered')
      if (flags.draft === true) add.push('\\Draft')
      if (flags.draft === false) remove.push('\\Draft')

      if (add.length) await client.messageFlagsAdd({ uid: String(uid) }, add)
      if (remove.length) await client.messageFlagsRemove({ uid: String(uid) }, remove)

      setMessageFlags(accountId, mailboxPath, uid, flags)
    } finally {
      lock.release()
    }
  }

  async moveMessage(accountId: string, mailboxPath: string, uid: number, destPath: string): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageMove({ uid: String(uid) }, destPath)
      removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  async deleteMessage(accountId: string, mailboxPath: string, uid: number): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageDelete({ uid: String(uid) })
      removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  // Top-level only: a folder's hierarchy delimiter is server-specific ('/'
  // vs '.', etc.), so creating *nested* folders safely means knowing that
  // delimiter, which ImapFlow's array path form handles for a single new
  // name without us needing to know it at all.
  async createMailbox(accountId: string, name: string): Promise<void> {
    const client = await this.getClient(accountId)
    await client.mailboxCreate([name])
    await this.listMailboxes(accountId)
  }

  async renameMailbox(accountId: string, path: string, newName: string): Promise<void> {
    const client = await this.getClient(accountId)
    const delimiter = cachedListMailboxes(accountId).find((m) => m.path === path)?.delimiter || '/'
    const segments = path.split(delimiter)
    segments[segments.length - 1] = newName
    const newPath = segments.join(delimiter)

    await client.mailboxRename(path, newPath)
    removeCachedMailbox(accountId, path)
    await this.listMailboxes(accountId)
  }

  async deleteMailbox(accountId: string, path: string): Promise<void> {
    const client = await this.getClient(accountId)
    await client.mailboxDelete(path)
    removeCachedMailbox(accountId, path)
    await this.listMailboxes(accountId)
  }

  async appendMessage(
    accountId: string,
    mailboxPath: string,
    raw: Buffer,
    flags: string[]
  ): Promise<void> {
    const client = await this.getClient(accountId)
    await client.append(mailboxPath, raw, flags)
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.logout()
      } catch {
        // ignore
      }
    }
    this.clients.clear()
  }
}
