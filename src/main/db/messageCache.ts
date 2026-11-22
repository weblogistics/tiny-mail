import { getDb } from './database'
import type { MailboxSummary, MessageBody, MessageSummary, SearchOptions } from '@shared/types'

// Bumped whenever a cached message_bodies row's shape can go stale in a way
// that matters beyond just missing a field (ensureColumn/NULL-coalescing in
// getMessageBody already covers that case). The one time this has mattered
// so far: attachment partId used to be a bare array index into a
// full-raw-message parse ("0", "1", ...); it's now either a real IMAP body
// section number or an explicitly-marked "legacy:<index>" one (see
// imapService.ts's getAttachmentContent/getMessageBody). A row written
// under the old scheme has neither marker, so today's code would
// misinterpret its partId as a real section number and fetch the wrong
// bytes entirely — silently "working" but handing back garbage. Rows
// written before this column existed default to 0 (see database.ts),
// which is why this starts at 1 rather than 0.
const CURRENT_BODY_VERSION = 1

export function upsertMailbox(mb: MailboxSummary): void {
  getDb()
    .prepare(
      `INSERT INTO mailboxes (accountId, path, name, specialUse, specialUseFromServer, unreadCount, totalCount, flags, delimiter)
       VALUES (@accountId, @path, @name, @specialUse, @specialUseFromServer, @unreadCount, @totalCount, @flags, @delimiter)
       ON CONFLICT(accountId, path) DO UPDATE SET
         name = @name, specialUse = @specialUse, specialUseFromServer = @specialUseFromServer,
         unreadCount = @unreadCount, totalCount = @totalCount, flags = @flags, delimiter = @delimiter`
    )
    .run({ ...mb, specialUseFromServer: mb.specialUseFromServer ? 1 : 0, flags: JSON.stringify(mb.flags) })
}

export function listMailboxes(accountId: string): MailboxSummary[] {
  const rows = getDb()
    .prepare(`SELECT * FROM mailboxes WHERE accountId = ? ORDER BY path`)
    .all(accountId) as (Omit<MailboxSummary, 'flags' | 'specialUseFromServer'> & {
    flags: string
    specialUseFromServer: number
  })[]
  return rows.map((r) => ({ ...r, flags: JSON.parse(r.flags), specialUseFromServer: !!r.specialUseFromServer }))
}

export function removeMailbox(accountId: string, path: string): void {
  getDb().prepare(`DELETE FROM mailboxes WHERE accountId = ? AND path = ?`).run(accountId, path)
  getDb().prepare(`DELETE FROM messages WHERE accountId = ? AND mailboxPath = ?`).run(accountId, path)
}

export function clearMailboxMessages(accountId: string, path: string): void {
  getDb().prepare(`DELETE FROM messages WHERE accountId = ? AND mailboxPath = ?`).run(accountId, path)
}

export function upsertMessage(msg: MessageSummary): void {
  getDb()
    .prepare(
      `INSERT INTO messages
         (accountId, mailboxPath, uid, messageId, subject, fromJson, toJson, ccJson, date,
          seen, flagged, answered, draft, deleted, hasAttachments, snippet)
       VALUES
         (@accountId, @mailboxPath, @uid, @messageId, @subject, @fromJson, @toJson, @ccJson, @date,
          @seen, @flagged, @answered, @draft, @deleted, @hasAttachments, @snippet)
       ON CONFLICT(accountId, mailboxPath, uid) DO UPDATE SET
         messageId=@messageId, subject=@subject, fromJson=@fromJson, toJson=@toJson, ccJson=@ccJson, date=@date,
         seen=@seen, flagged=@flagged, answered=@answered, draft=@draft, deleted=@deleted,
         hasAttachments=@hasAttachments, snippet=@snippet`
    )
    .run({
      accountId: msg.accountId,
      mailboxPath: msg.mailboxPath,
      uid: msg.uid,
      messageId: msg.messageId,
      subject: msg.subject,
      fromJson: JSON.stringify(msg.from),
      toJson: JSON.stringify(msg.to),
      ccJson: JSON.stringify(msg.cc),
      date: msg.date,
      seen: msg.flags.seen ? 1 : 0,
      flagged: msg.flags.flagged ? 1 : 0,
      answered: msg.flags.answered ? 1 : 0,
      draft: msg.flags.draft ? 1 : 0,
      deleted: msg.flags.deleted ? 1 : 0,
      hasAttachments: msg.hasAttachments ? 1 : 0,
      snippet: msg.snippet
    })
}

interface MessageRow {
  accountId: string
  mailboxPath: string
  uid: number
  messageId: string
  subject: string
  fromJson: string
  toJson: string
  ccJson: string
  date: string
  seen: number
  flagged: number
  answered: number
  draft: number
  deleted: number
  hasAttachments: number
  snippet: string
}

function rowToSummary(r: MessageRow): MessageSummary {
  return {
    accountId: r.accountId,
    mailboxPath: r.mailboxPath,
    uid: r.uid,
    messageId: r.messageId,
    subject: r.subject,
    from: JSON.parse(r.fromJson),
    to: JSON.parse(r.toJson),
    cc: JSON.parse(r.ccJson || '[]'),
    date: r.date,
    flags: {
      seen: !!r.seen,
      flagged: !!r.flagged,
      answered: !!r.answered,
      draft: !!r.draft,
      deleted: !!r.deleted
    },
    hasAttachments: !!r.hasAttachments,
    snippet: r.snippet
  }
}

export function listMessages(accountId: string, mailboxPath: string): MessageSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM messages WHERE accountId = ? AND mailboxPath = ? AND deleted = 0 ORDER BY date DESC`
    )
    .all(accountId, mailboxPath) as MessageRow[]
  return rows.map(rowToSummary)
}

// The local-cache pass only ever searches the snippet (not a full body) for
// its "body" field — the messages table never stores full message text,
// only the ~220-char preview every row already carries, so this is a cheap
// best-effort match that shows up instantly while the real, thorough
// searchServer() pass (imapService.ts, a true IMAP BODY search) is still in
// flight.
export function searchMessages(accountId: string, query: string, options: SearchOptions): MessageSummary[] {
  const conditions = ['accountId = ?', 'deleted = 0']
  const params: unknown[] = [accountId]

  if (options.mailboxPath) {
    conditions.push('mailboxPath = ?')
    params.push(options.mailboxPath)
  }
  if (options.sinceDays != null) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - options.sinceDays)
    conditions.push('date >= ?')
    params.push(cutoff.toISOString())
  }
  if (options.hasAttachment) {
    conditions.push('hasAttachments = 1')
  }

  const like = `%${query}%`
  const fieldClauses: string[] = []
  if (options.fields.subject) {
    fieldClauses.push('subject LIKE ?')
    params.push(like)
  }
  if (options.fields.from) {
    fieldClauses.push('fromJson LIKE ?')
    params.push(like)
  }
  if (options.fields.to) {
    fieldClauses.push('toJson LIKE ?')
    params.push(like)
  }
  if (options.fields.body) {
    fieldClauses.push('snippet LIKE ?')
    params.push(like)
  }
  // No field selected means there's nothing to match against — rather than
  // silently falling back to "match everything" or "match nothing via an
  // always-false clause", just report no results.
  if (fieldClauses.length === 0) return []

  conditions.push(`(${fieldClauses.join(' OR ')})`)

  const rows = getDb()
    .prepare(`SELECT * FROM messages WHERE ${conditions.join(' AND ')} ORDER BY date DESC LIMIT 200`)
    .all(...params) as MessageRow[]
  return rows.map(rowToSummary)
}

export function setMessageFlags(
  accountId: string,
  mailboxPath: string,
  uid: number,
  flags: Partial<MessageSummary['flags']>
): void {
  const existing = getDb()
    .prepare(`SELECT * FROM messages WHERE accountId = ? AND mailboxPath = ? AND uid = ?`)
    .get(accountId, mailboxPath, uid) as MessageRow | undefined
  if (!existing) return
  const merged = { ...rowToSummary(existing).flags, ...flags }
  getDb()
    .prepare(
      `UPDATE messages SET seen=@seen, flagged=@flagged, answered=@answered, draft=@draft, deleted=@deleted
       WHERE accountId=@accountId AND mailboxPath=@mailboxPath AND uid=@uid`
    )
    .run({
      accountId,
      mailboxPath,
      uid,
      seen: merged.seen ? 1 : 0,
      flagged: merged.flagged ? 1 : 0,
      answered: merged.answered ? 1 : 0,
      draft: merged.draft ? 1 : 0,
      deleted: merged.deleted ? 1 : 0
    })
}

export function removeMessage(accountId: string, mailboxPath: string, uid: number): void {
  getDb()
    .prepare(`DELETE FROM messages WHERE accountId = ? AND mailboxPath = ? AND uid = ?`)
    .run(accountId, mailboxPath, uid)
}

export function saveMessageBody(body: MessageBody): void {
  getDb()
    .prepare(
      `INSERT INTO message_bodies (accountId, mailboxPath, uid, html, text, attachmentsJson, replyToJson, returnPath, rawHeaders, bodyVersion)
       VALUES (@accountId, @mailboxPath, @uid, @html, @text, @attachmentsJson, @replyToJson, @returnPath, @rawHeaders, @bodyVersion)
       ON CONFLICT(accountId, mailboxPath, uid) DO UPDATE SET
         html=@html, text=@text, attachmentsJson=@attachmentsJson,
         replyToJson=@replyToJson, returnPath=@returnPath, rawHeaders=@rawHeaders, bodyVersion=@bodyVersion`
    )
    .run({
      accountId: body.accountId,
      mailboxPath: body.mailboxPath,
      uid: body.uid,
      html: body.html,
      text: body.text,
      attachmentsJson: JSON.stringify(body.attachments),
      replyToJson: JSON.stringify(body.replyTo),
      returnPath: body.returnPath,
      rawHeaders: body.rawHeaders,
      bodyVersion: CURRENT_BODY_VERSION
    })
}

export function getMessageBody(
  accountId: string,
  mailboxPath: string,
  uid: number
): MessageBody | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM message_bodies WHERE accountId = ? AND mailboxPath = ? AND uid = ?`)
    .get(accountId, mailboxPath, uid) as
    | {
        accountId: string
        mailboxPath: string
        uid: number
        html: string | null
        text: string | null
        attachmentsJson: string
        replyToJson: string | null
        returnPath: string | null
        rawHeaders: string | null
        bodyVersion: number
      }
    | undefined
  if (!row) return undefined
  // Treated exactly like a cache miss (not returned, caller re-fetches and
  // overwrites this row) rather than patched in place — see
  // CURRENT_BODY_VERSION above for why a stale row can't just be trusted
  // with its existing fields.
  if (row.bodyVersion !== CURRENT_BODY_VERSION) return undefined
  return {
    accountId: row.accountId,
    mailboxPath: row.mailboxPath,
    uid: row.uid,
    html: row.html,
    text: row.text,
    attachments: JSON.parse(row.attachmentsJson),
    // Cached rows written before this column existed have NULL here — treat
    // the same as "none captured" rather than crashing JSON.parse(null).
    replyTo: row.replyToJson ? JSON.parse(row.replyToJson) : [],
    returnPath: row.returnPath,
    rawHeaders: row.rawHeaders ?? ''
  }
}
