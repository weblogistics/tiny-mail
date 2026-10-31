import { describe, expect, it } from 'vitest'
import { filterAndSortMessages } from './filterAndSortMessages'
import type { MessageSummary } from '@shared/types'

function msg(overrides: Partial<MessageSummary>): MessageSummary {
  return {
    accountId: 'acc1',
    mailboxPath: 'INBOX',
    uid: 1,
    messageId: '<1@x>',
    subject: 'Subject',
    from: [{ name: 'Alice', address: 'alice@example.com' }],
    to: [],
    cc: [],
    date: '2026-01-01T00:00:00.000Z',
    flags: { seen: true, flagged: false, answered: false, draft: false, deleted: false },
    hasAttachments: false,
    snippet: '',
    ...overrides
  }
}

describe('filterAndSortMessages', () => {
  it('filters to unread only', () => {
    const messages = [msg({ uid: 1, flags: { ...msg({}).flags, seen: true } }), msg({ uid: 2, flags: { ...msg({}).flags, seen: false } })]
    const result = filterAndSortMessages(messages, 'unread', 'date-desc')
    expect(result.map((m) => m.uid)).toEqual([2])
  })

  it('filters to flagged only', () => {
    const messages = [msg({ uid: 1, flags: { ...msg({}).flags, flagged: false } }), msg({ uid: 2, flags: { ...msg({}).flags, flagged: true } })]
    const result = filterAndSortMessages(messages, 'flagged', 'date-desc')
    expect(result.map((m) => m.uid)).toEqual([2])
  })

  it('filters to messages with attachments only', () => {
    const messages = [msg({ uid: 1, hasAttachments: false }), msg({ uid: 2, hasAttachments: true })]
    const result = filterAndSortMessages(messages, 'attachments', 'date-desc')
    expect(result.map((m) => m.uid)).toEqual([2])
  })

  it('"all" filter keeps every message', () => {
    const messages = [msg({ uid: 1 }), msg({ uid: 2 })]
    expect(filterAndSortMessages(messages, 'all', 'date-desc')).toHaveLength(2)
  })

  it('sorts newest first by default', () => {
    const messages = [
      msg({ uid: 1, date: '2026-01-01T00:00:00.000Z' }),
      msg({ uid: 2, date: '2026-03-01T00:00:00.000Z' })
    ]
    expect(filterAndSortMessages(messages, 'all', 'date-desc').map((m) => m.uid)).toEqual([2, 1])
  })

  it('sorts oldest first', () => {
    const messages = [
      msg({ uid: 1, date: '2026-03-01T00:00:00.000Z' }),
      msg({ uid: 2, date: '2026-01-01T00:00:00.000Z' })
    ]
    expect(filterAndSortMessages(messages, 'all', 'date-asc').map((m) => m.uid)).toEqual([2, 1])
  })

  it('sorts by sender name case-insensitively', () => {
    const messages = [
      msg({ uid: 1, from: [{ name: 'zelda', address: 'z@x.com' }] }),
      msg({ uid: 2, from: [{ name: 'Anna', address: 'a@x.com' }] })
    ]
    expect(filterAndSortMessages(messages, 'all', 'sender').map((m) => m.uid)).toEqual([2, 1])
  })

  it('sorts by subject case-insensitively', () => {
    const messages = [msg({ uid: 1, subject: 'zebra' }), msg({ uid: 2, subject: 'Apple' })]
    expect(filterAndSortMessages(messages, 'all', 'subject').map((m) => m.uid)).toEqual([2, 1])
  })

  it('does not mutate the input array', () => {
    const messages = [msg({ uid: 1, date: '2026-01-01T00:00:00.000Z' }), msg({ uid: 2, date: '2026-03-01T00:00:00.000Z' })]
    const original = [...messages]
    filterAndSortMessages(messages, 'all', 'date-asc')
    expect(messages).toEqual(original)
  })
})
