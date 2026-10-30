import { getDb } from './database'
import type { MailboxSummary, MessageBody, MessageSummary } from '@shared/types'

export function upsertMailbox(mb: MailboxSummary): void {
  getDb()
    .prepare(
      `INSERT INTO mailboxes (accountId, path, name, specialUse, unreadCount, totalCount, flags, delimiter)
       VALUES (@accountId, @path, @name, @specialUse, @unreadCount, @totalCount, @flags, @delimiter)
       ON CONFLICT(accountId, path) DO UPDATE SET
         name = @name, specialUse = @specialUse, unreadCount = @unreadCount,
         totalCount = @totalCount, flags = @flags, delimiter = @delimiter`
    )
    .run({ ...mb, flags: JSON.stringify(mb.flags) })
}

export function listMailboxes(accountId: string): MailboxSummary[] {
  const rows = getDb()
    .prepare(`SELECT * FROM mailboxes WHERE accountId = ? ORDER BY path`)
    .all(accountId) as (Omit<MailboxSummary, 'flags'> & { flags: string })[]
  return rows.map((r) => ({ ...r, flags: JSON.parse(r.flags) }))
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

export function searchMessages(accountId: string, query: string): MessageSummary[] {
  const like = `%${query}%`
  const rows = getDb()
    .prepare(
      `SELECT * FROM messages WHERE accountId = ? AND deleted = 0
         AND (subject LIKE ? OR fromJson LIKE ? OR snippet LIKE ?)
       ORDER BY date DESC LIMIT 200`
    )
    .all(accountId, like, like, like) as MessageRow[]
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
      `INSERT INTO message_bodies (accountId, mailboxPath, uid, html, text, attachmentsJson)
       VALUES (@accountId, @mailboxPath, @uid, @html, @text, @attachmentsJson)
       ON CONFLICT(accountId, mailboxPath, uid) DO UPDATE SET
         html=@html, text=@text, attachmentsJson=@attachmentsJson`
    )
    .run({
      accountId: body.accountId,
      mailboxPath: body.mailboxPath,
      uid: body.uid,
      html: body.html,
      text: body.text,
      attachmentsJson: JSON.stringify(body.attachments)
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
    | { accountId: string; mailboxPath: string; uid: number; html: string | null; text: string | null; attachmentsJson: string }
    | undefined
  if (!row) return undefined
  return { ...row, attachments: JSON.parse(row.attachmentsJson) }
}
