import { describe, expect, it } from 'vitest'
import { buildMailboxTree } from './mailboxTree'
import type { MailboxSummary } from '@shared/types'

function box(path: string, overrides: Partial<MailboxSummary> = {}): MailboxSummary {
  return {
    accountId: 'acc1',
    path,
    name: path.split('/').pop() || path,
    specialUse: null,
    unreadCount: 0,
    totalCount: 0,
    flags: [],
    delimiter: '/',
    ...overrides
  }
}

describe('buildMailboxTree', () => {
  it('nests a folder under its real parent folder', () => {
    const tree = buildMailboxTree([box('Archive'), box('Archive/2024')])
    expect(tree).toHaveLength(1)
    expect(tree[0].mb.path).toBe('Archive')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].mb.path).toBe('Archive/2024')
  })

  it('nests multiple levels deep', () => {
    const tree = buildMailboxTree([box('Archive'), box('Archive/2024'), box('Archive/2024/Receipts')])
    expect(tree[0].children[0].children[0].mb.path).toBe('Archive/2024/Receipts')
  })

  it('treats a folder as top-level when its parent segment is not itself a real mailbox', () => {
    // "Archive" never appears as its own mailbox here, only "Archive/2024" does.
    const tree = buildMailboxTree([box('Archive/2024')])
    expect(tree).toHaveLength(1)
    expect(tree[0].mb.path).toBe('Archive/2024')
    expect(tree[0].children).toHaveLength(0)
  })

  it('respects the per-mailbox delimiter rather than assuming "/"', () => {
    const tree = buildMailboxTree([box('Archive', { delimiter: '.' }), box('Archive.2024', { delimiter: '.' })])
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].mb.path).toBe('Archive.2024')
  })

  it('orders special-use mailboxes before custom ones, then alphabetically', () => {
    const tree = buildMailboxTree([
      box('Zebra'),
      box('Apple'),
      box('INBOX', { specialUse: 'Inbox', name: 'INBOX' }),
      box('Sent', { specialUse: 'Sent' }),
      box('Trash', { specialUse: 'Trash' })
    ])
    expect(tree.map((n) => n.mb.path)).toEqual(['INBOX', 'Sent', 'Trash', 'Apple', 'Zebra'])
  })

  it('sorts children alphabetically too', () => {
    const tree = buildMailboxTree([box('Archive'), box('Archive/Zebra'), box('Archive/Apple')])
    expect(tree[0].children.map((n) => n.mb.path)).toEqual(['Archive/Apple', 'Archive/Zebra'])
  })
})
