import type { MailboxRole, MailboxSummary } from './types'

export const MAILBOX_ROLES: MailboxRole[] = ['Sent', 'Drafts', 'Trash', 'Junk', 'Archive']

function pathDepth(mb: MailboxSummary): number {
  return mb.path.split(mb.delimiter || '/').length
}

// Real IMAP servers often advertise SPECIAL-USE flags cleanly (exactly one
// mailbox tagged per role), but when a server doesn't, Tiny Mail falls back
// to matching each mailbox's own name independently — which can, and on
// real accounts does, tag more than one mailbox the same way (a top-level
// "Sent", a "Sent Messages", and a per-correspondent "Sent" nested three
// levels deep have all been seen tagged Sent on the same real account).
// Among same-role candidates, prefer whichever sits closest to the top of
// the mailbox tree: a folder buried under another folder is far less
// likely to be the one actually meant as the account's Sent/Trash/etc
// folder than one sitting at or near the root.
export function resolveMailboxRole(
  boxes: MailboxSummary[],
  role: MailboxRole,
  overridePath?: string | null
): MailboxSummary | undefined {
  if (overridePath) {
    const chosen = boxes.find((b) => b.path === overridePath)
    if (chosen) return chosen
    // The override points at a mailbox that no longer exists (renamed or
    // deleted since it was set) — fall through to automatic resolution
    // rather than silently resolving nothing at all.
  }

  const candidates = boxes.filter((b) => b.specialUse === role)
  if (candidates.length <= 1) return candidates[0]

  return [...candidates].sort((a, b) => {
    const depthDiff = pathDepth(a) - pathDepth(b)
    if (depthDiff !== 0) return depthDiff
    if (a.path.length !== b.path.length) return a.path.length - b.path.length
    return a.path.localeCompare(b.path)
  })[0]
}

// The set of mailbox paths that actually win a role for this account —
// Inbox (never ambiguous, always included) plus whichever mailbox
// resolveMailboxRole picks for each of the other roles. Used by the
// sidebar to decide which of several same-looking folders (e.g. three
// "Sent"-ish mailboxes) gets to display with the special icon/position.
export function resolveCanonicalPaths(
  boxes: MailboxSummary[],
  overrides?: Partial<Record<MailboxRole, string>>
): Set<string> {
  const paths = new Set<string>()
  const inbox = boxes.find((b) => b.specialUse === 'Inbox')
  if (inbox) paths.add(inbox.path)
  for (const role of MAILBOX_ROLES) {
    const resolved = resolveMailboxRole(boxes, role, overrides?.[role])
    if (resolved) paths.add(resolved.path)
  }
  return paths
}
