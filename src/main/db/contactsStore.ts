import { getDb } from './database'
import type { Contact, MessageAddress, MessageSummary } from '@shared/types'

function isValidAddress(address: string): boolean {
  // Deliberately loose — just enough to filter out the empty/malformed
  // envelope entries real-world messages sometimes contain, not a full
  // RFC 5322 validator.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
}

export function upsertContact(address: string, name: string, seenAt: string): void {
  const normalized = address.trim().toLowerCase()
  if (!isValidAddress(normalized)) return

  getDb()
    .prepare(
      `INSERT INTO contacts (address, name, lastSeen)
       VALUES (@address, @name, @lastSeen)
       ON CONFLICT(address) DO UPDATE SET
         name = CASE WHEN @name != '' THEN @name ELSE name END,
         lastSeen = CASE WHEN @lastSeen > lastSeen THEN @lastSeen ELSE lastSeen END`
    )
    .run({ address: normalized, name: name.trim(), lastSeen: seenAt })
}

// Only Inbox/Sent are indexed, per the user's request — not every folder
// (drafts, trash, mailing-list archives, etc. would pollute the address
// book with addresses that aren't real correspondents).
export function indexContactsFromMessage(msg: MessageSummary): void {
  const addresses: MessageAddress[] = [...msg.from, ...msg.to, ...msg.cc]
  for (const a of addresses) {
    if (a.address) upsertContact(a.address, a.name, msg.date)
  }
}

export function searchContacts(query: string, limit = 20): Contact[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const like = `${trimmed.toLowerCase()}%`
  const rows = getDb()
    .prepare(
      `SELECT address, name FROM contacts
       WHERE address LIKE @like OR LOWER(name) LIKE @like
       ORDER BY lastSeen DESC
       LIMIT @limit`
    )
    .all({ like, limit }) as Contact[]
  return rows
}
