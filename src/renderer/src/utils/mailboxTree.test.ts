import { describe, expect, it } from 'vitest'
import { buildMailboxTree } from './mailboxTree'
import type { MailboxSummary } from '@shared/types'

function box(path: string, overrides: Partial<MailboxSummary> = {}): MailboxSummary {
  return {
    accountId: 'acc1',
    path,
    name: path.split('/').pop() || path,
    specialUse: null,
    specialUseFromServer: false,
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

  it('defaults displayUse to each mailbox\'s own specialUse when canonicalPaths is omitted', () => {
    const tree = buildMailboxTree([box('Sent', { specialUse: 'Sent' })])
    expect(tree[0].displayUse).toBe('Sent')
  })

  it('only treats the canonical mailbox as special when multiple share a specialUse', () => {
    // Two folders that both look like "Sent" — only the one in canonicalPaths
    // should display (and sort) as special; the other is just a folder.
    const tree = buildMailboxTree(
      [
        box('Sent', { specialUse: 'Sent' }),
        box('Accountant/Sent', { specialUse: 'Sent', name: 'Sent' })
      ],
      new Set(['Sent'])
    )
    const winner = tree.find((n) => n.mb.path === 'Sent')
    const loser = tree.find((n) => n.mb.path === 'Accountant/Sent')
    expect(winner?.displayUse).toBe('Sent')
    expect(loser?.displayUse).toBeNull()
  })

  it('sorts a non-canonical special-looking folder alphabetically, not into its special-use slot', () => {
    const tree = buildMailboxTree(
      [box('Zebra'), box('Apple'), box('NotTheRealSent', { specialUse: 'Sent' })],
      new Set() // nothing is canonical
    )
    expect(tree.map((n) => n.mb.path)).toEqual(['Apple', 'NotTheRealSent', 'Zebra'])
  })
})
