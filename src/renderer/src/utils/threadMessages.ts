import type { MessageSummary } from '@shared/types'

export interface MessageThread {
  key: string
  // Oldest first, matching how an expanded conversation reads top-to-bottom.
  messages: MessageSummary[]
}

// Not full RFC 5256 References-chain threading (that needs In-Reply-To/
// References headers we don't currently fetch, and not every IMAP server
// even supports server-side THREAD/SORT) — this groups by normalized
// subject instead, which is a reasonable client-side approximation that
// works against any server.
export function normalizeThreadSubject(subject: string): string {
  let s = subject.trim()
  for (;;) {
    const next = s.replace(/^(re|fwd?|fw)\s*:\s*/i, '')
    if (next === s) break
    s = next.trim()
  }
  return s.toLowerCase()
}

export function groupMessagesByThread(messages: MessageSummary[]): MessageThread[] {
  const order: string[] = []
  const byKey = new Map<string, MessageSummary[]>()

  for (const m of messages) {
    const normalized = normalizeThreadSubject(m.subject)
    // A blank/placeholder subject shouldn't merge unrelated messages into
    // one giant thread, so each gets its own key.
    const key = normalized ? normalized : `__singleton__:${m.accountId}:${m.mailboxPath}:${m.uid}`
    const existing = byKey.get(key)
    if (existing) {
      existing.push(m)
    } else {
      byKey.set(key, [m])
      order.push(key)
    }
  }

  return order.map((key) => ({
    key,
    messages: [...byKey.get(key)!].sort((a, b) => a.date.localeCompare(b.date))
  }))
}
