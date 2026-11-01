import { describe, expect, it } from 'vitest'
import { resolveCanonicalPaths, resolveMailboxRole } from './resolveMailboxRole'
import type { MailboxSummary } from './types'

function box(path: string, overrides: Partial<MailboxSummary> = {}): MailboxSummary {
  return {
    accountId: 'acc1',
    path,
    name: path.split('.').pop() || path,
    specialUse: null,
    specialUseFromServer: false,
    unreadCount: 0,
    totalCount: 0,
    flags: [],
    delimiter: '.',
    ...overrides
  }
}

describe('resolveMailboxRole', () => {
  it('returns the sole candidate when only one mailbox matches the role', () => {
    const boxes = [box('INBOX', { specialUse: 'Inbox' }), box('Trash', { specialUse: 'Trash' })]
    expect(resolveMailboxRole(boxes, 'Trash')?.path).toBe('Trash')
  })

  it('returns undefined when nothing matches the role', () => {
    const boxes = [box('INBOX', { specialUse: 'Inbox' })]
    expect(resolveMailboxRole(boxes, 'Archive')).toBeUndefined()
  })

  it('prefers the shallower (more top-level) folder when neither candidate has a real server flag', () => {
    // Both name-guessed only (specialUseFromServer defaults to false in the
    // box() helper here) — the depth tie-break is what's actually deciding.
    const boxes = [
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', name: 'Sent' }),
      box('Sent', { specialUse: 'Sent' })
    ]
    expect(resolveMailboxRole(boxes, 'Sent')?.path).toBe('Sent')
  })

  it('tie-breaks same-depth candidates by shorter path, then alphabetically', () => {
    const boxes = [box('Sent Messages', { specialUse: 'Sent' }), box('Sent', { specialUse: 'Sent' })]
    expect(resolveMailboxRole(boxes, 'Sent')?.path).toBe('Sent')
  })

  it('a real server SPECIAL-USE flag wins outright over a shallower name-guessed look-alike', () => {
    // The actual bug this was built to fix, reproduced from a real account:
    // the server's genuine \Sent flag was on a deeply nested per-
    // correspondent folder, while shallower "Sent" and "Sent Messages"
    // folders existed too, purely by naming coincidence, with no real flag
    // at all. Depth must never override an authoritative server answer.
    const boxes = [
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', specialUseFromServer: true, name: 'Sent' }),
      box('Sent', { specialUse: 'Sent' }),
      box('Sent Messages', { specialUse: 'Sent' })
    ]
    expect(resolveMailboxRole(boxes, 'Sent')?.path).toBe('INBOX.David Jeffrey.Sent')
  })

  it('tie-breaks by depth among multiple real-flagged candidates too, if a server somehow sends more than one', () => {
    const boxes = [
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', specialUseFromServer: true, name: 'Sent' }),
      box('Sent', { specialUse: 'Sent', specialUseFromServer: true })
    ]
    expect(resolveMailboxRole(boxes, 'Sent')?.path).toBe('Sent')
  })

  it('an explicit override wins outright, even over a shallower auto candidate', () => {
    const boxes = [
      box('Sent', { specialUse: 'Sent' }),
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', name: 'Sent' })
    ]
    expect(resolveMailboxRole(boxes, 'Sent', 'INBOX.David Jeffrey.Sent')?.path).toBe('INBOX.David Jeffrey.Sent')
  })

  it('falls back to automatic resolution when the override points at a mailbox that no longer exists', () => {
    const boxes = [box('Sent', { specialUse: 'Sent' })]
    expect(resolveMailboxRole(boxes, 'Sent', 'Some.Deleted.Folder')?.path).toBe('Sent')
  })

  it('respects each mailbox\'s own delimiter when computing depth', () => {
    const boxes = [
      box('INBOX/David Jeffrey/Sent', { specialUse: 'Sent', delimiter: '/' }),
      box('Sent', { specialUse: 'Sent', delimiter: '/' })
    ]
    expect(resolveMailboxRole(boxes, 'Sent')?.path).toBe('Sent')
  })
})

describe('resolveCanonicalPaths', () => {
  it('includes Inbox plus the resolved winner for every role that has a candidate', () => {
    const boxes = [
      box('INBOX', { specialUse: 'Inbox' }),
      box('Sent', { specialUse: 'Sent' }),
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', name: 'Sent' }),
      box('Trash', { specialUse: 'Trash' })
    ]
    const paths = resolveCanonicalPaths(boxes)
    expect(paths.has('INBOX')).toBe(true)
    expect(paths.has('Sent')).toBe(true)
    expect(paths.has('INBOX.David Jeffrey.Sent')).toBe(false)
    expect(paths.has('Trash')).toBe(true)
    expect(paths.has('Archive')).toBe(false)
  })

  it('reflects an override in the canonical set instead of the auto-picked winner', () => {
    const boxes = [
      box('Sent', { specialUse: 'Sent' }),
      box('INBOX.David Jeffrey.Sent', { specialUse: 'Sent', name: 'Sent' })
    ]
    const paths = resolveCanonicalPaths(boxes, { Sent: 'INBOX.David Jeffrey.Sent' })
    expect(paths.has('INBOX.David Jeffrey.Sent')).toBe(true)
    expect(paths.has('Sent')).toBe(false)
  })
})
