import type { MailboxSummary } from '@shared/types'

export interface MailboxTreeNode {
  mb: MailboxSummary
  children: MailboxTreeNode[]
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
  const ra = a.mb.specialUse ? SPECIAL_ORDER[a.mb.specialUse] ?? 6 : 6
  const rb = b.mb.specialUse ? SPECIAL_ORDER[b.mb.specialUse] ?? 6 : 6
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
export function buildMailboxTree(boxes: MailboxSummary[]): MailboxTreeNode[] {
  const byPath = new Map<string, MailboxTreeNode>(boxes.map((mb) => [mb.path, { mb, children: [] }]))
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
