// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildForwardSeed, buildReplySeed } from './quote'
import type { MessageBody, MessageSummary } from '@shared/types'

const baseMessage: MessageSummary = {
  accountId: 'acc1',
  mailboxPath: 'INBOX',
  uid: 1,
  messageId: '<abc@example.com>',
  subject: 'Quarterly numbers',
  from: [{ name: 'Alice', address: 'alice@example.com' }],
  to: [{ name: 'Me', address: 'me@example.com' }],
  cc: [{ name: 'Bob', address: 'bob@example.com' }],
  date: '2026-01-01T12:00:00.000Z',
  flags: { seen: true, flagged: false, answered: false, draft: false, deleted: false },
  hasAttachments: false,
  snippet: ''
}

const body: MessageBody = {
  accountId: 'acc1',
  mailboxPath: 'INBOX',
  uid: 1,
  html: '<p>Here are the numbers</p>',
  text: 'Here are the numbers',
  attachments: []
}

describe('buildReplySeed', () => {
  it('addresses a plain reply to the original sender only', () => {
    const seed = buildReplySeed(baseMessage, body, 'me@example.com', false)
    expect(seed.to).toBe('alice@example.com')
    expect(seed.cc).toBe('')
  })

  it('includes original recipients and cc (minus self) for reply-all', () => {
    const seed = buildReplySeed(baseMessage, body, 'me@example.com', true)
    expect(seed.to).toBe('alice@example.com')
    expect(seed.cc).toBe('bob@example.com')
    expect(seed.cc).not.toContain('me@example.com')
  })

  it('prefixes the subject with Re: without doubling an existing prefix', () => {
    expect(buildReplySeed(baseMessage, body, undefined, false).subject).toBe('Re: Quarterly numbers')
    const alreadyRe = { ...baseMessage, subject: 'Re: Quarterly numbers' }
    expect(buildReplySeed(alreadyRe, body, undefined, false).subject).toBe('Re: Quarterly numbers')
  })

  it('threads the reply via In-Reply-To/References', () => {
    const seed = buildReplySeed(baseMessage, body, undefined, false)
    expect(seed.inReplyTo).toBe('<abc@example.com>')
    expect(seed.references).toBe('<abc@example.com>')
  })

  it('quotes the original body content', () => {
    const seed = buildReplySeed(baseMessage, body, undefined, false)
    expect(seed.html).toContain('Here are the numbers')
    expect(seed.html).toContain('Alice')
  })
})

describe('buildForwardSeed', () => {
  it('prefixes the subject with Fwd:', () => {
    expect(buildForwardSeed(baseMessage, body).subject).toBe('Fwd: Quarterly numbers')
  })

  it('includes original headers and body in the quote', () => {
    const seed = buildForwardSeed(baseMessage, body)
    expect(seed.html).toContain('alice@example.com')
    expect(seed.html).toContain('Quarterly numbers')
    expect(seed.html).toContain('Here are the numbers')
  })

  it('does not set In-Reply-To/References (forwards start a new thread)', () => {
    const seed = buildForwardSeed(baseMessage, body)
    expect(seed.inReplyTo).toBeUndefined()
    expect(seed.references).toBeUndefined()
  })
})
