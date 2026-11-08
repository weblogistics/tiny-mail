import { describe, expect, it } from 'vitest'
import { groupMessagesByThread, normalizeThreadSubject } from './threadMessages'
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

describe('normalizeThreadSubject', () => {
  it('strips a single Re: prefix', () => {
    expect(normalizeThreadSubject('Re: Hello')).toBe('hello')
  })

  it('strips repeated and mixed Re:/Fwd: prefixes', () => {
    expect(normalizeThreadSubject('Re: Fwd: RE: Hello')).toBe('hello')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeThreadSubject('  RE:   Hello  ')).toBe('hello')
  })

  it('leaves a subject with no prefix as-is (lowercased)', () => {
    expect(normalizeThreadSubject('Quarterly Numbers')).toBe('quarterly numbers')
  })
})

describe('groupMessagesByThread', () => {
  it('groups a message and its reply into one thread', () => {
    const threads = groupMessagesByThread([
      msg({ uid: 1, subject: 'Quarterly Numbers' }),
      msg({ uid: 2, subject: 'Re: Quarterly Numbers' })
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].messages.map((m) => m.uid)).toEqual([1, 2])
  })

  it('keeps unrelated subjects as separate threads', () => {
    const threads = groupMessagesByThread([msg({ uid: 1, subject: 'A' }), msg({ uid: 2, subject: 'B' })])
    expect(threads).toHaveLength(2)
  })

  it('orders messages within a thread oldest first regardless of input order', () => {
    const threads = groupMessagesByThread([
      msg({ uid: 2, subject: 'X', date: '2026-02-01T00:00:00.000Z' }),
      msg({ uid: 1, subject: 'Re: X', date: '2026-01-01T00:00:00.000Z' })
    ])
    expect(threads[0].messages.map((m) => m.uid)).toEqual([1, 2])
  })

  it('orders messages within a thread newest first when asked to', () => {
    const threads = groupMessagesByThread(
      [
        msg({ uid: 1, subject: 'X', date: '2026-01-01T00:00:00.000Z' }),
        msg({ uid: 2, subject: 'Re: X', date: '2026-02-01T00:00:00.000Z' })
      ],
      true
    )
    expect(threads[0].messages.map((m) => m.uid)).toEqual([2, 1])
  })

  it('does not merge multiple blank-subject messages into one thread', () => {
    const threads = groupMessagesByThread([msg({ uid: 1, subject: '' }), msg({ uid: 2, subject: '' })])
    expect(threads).toHaveLength(2)
  })

  it('preserves first-seen thread order in the output', () => {
    const threads = groupMessagesByThread([
      msg({ uid: 1, subject: 'Zebra' }),
      msg({ uid: 2, subject: 'Apple' }),
      msg({ uid: 3, subject: 'Re: Zebra' })
    ])
    expect(threads.map((t) => t.messages[0].subject)).toEqual(['Zebra', 'Apple'])
  })
})
