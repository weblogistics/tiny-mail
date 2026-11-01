import type { MailboxSummary, SpecialUse } from '@shared/types'

export interface MailboxTreeNode {
  mb: MailboxSummary
  children: MailboxTreeNode[]
  // The specialUse to actually *display* (icon, name, sort position) for
  // this node. Distinct from mb.specialUse, which is purely descriptive and
  // can be non-null on more than one mailbox at once — a real account can
  // have several folders that all look like "Sent" to the name-pattern
  // fallback. Only the one canonicalPaths resolved as the account's actual
  // Sent/Trash/etc folder should look special in the sidebar; everything
  // else displays as an ordinary folder even though mb.specialUse is still
  // set on it (it's still true that the name matched, just not the one
  // that's actually being used as that role).
  displayUse: SpecialUse
}

const SPECIAL_ORDER: Record<string, number> = {
  Inbox: 0,
  Drafts: 1,
  Sent: 2,
  Junk: 3,
  Trash: 4,
  Archive: 5
}

function compareNodes(a: MailboxTreeNode, b: MailboxTreeNode): number {
  const ra = a.displayUse ? SPECIAL_ORDER[a.displayUse] ?? 6 : 6
  const rb = b.displayUse ? SPECIAL_ORDER[b.displayUse] ?? 6 : 6
  if (ra !== rb) return ra - rb
  return a.mb.name.localeCompare(b.mb.name)
}

function sortTree(nodes: MailboxTreeNode[]): MailboxTreeNode[] {
  return [...nodes].sort(compareNodes).map((n) => ({ ...n, children: sortTree(n.children) }))
}

// Builds a tree from the server's flat mailbox list using each mailbox's own
// path + delimiter (both server-reported, so this works regardless of
// whether the server uses '/', '.', or anything else). A mailbox only nests
// under a parent if that parent is itself a real, listed mailbox — an
// intermediate path segment that isn't its own mailbox becomes a top-level
// entry instead of an unclickable phantom node.
//
// canonicalPaths, when given, is the set of mailbox paths that should
// actually display with their special-use icon/position (see
// resolveMailboxRole — callers build this by resolving each role once and
// collecting the winners, plus the real INBOX path). Omitting it treats
// every mailbox's own specialUse as displayable, which is the simpler
// behavior callers without ambiguity to resolve (such as tests) can rely on.
export function buildMailboxTree(boxes: MailboxSummary[], canonicalPaths?: Set<string>): MailboxTreeNode[] {
  const byPath = new Map<string, MailboxTreeNode>(
    boxes.map((mb) => [
      mb.path,
      {
        mb,
        children: [],
        displayUse: !canonicalPaths || canonicalPaths.has(mb.path) ? mb.specialUse : null
      }
    ])
  )
  const roots: MailboxTreeNode[] = []

  for (const node of byPath.values()) {
    const delimiter = node.mb.delimiter || '/'
    const segments = node.mb.path.split(delimiter)
    const parentPath = segments.slice(0, -1).join(delimiter)
    const parent = parentPath ? byPath.get(parentPath) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return sortTree(roots)
}
