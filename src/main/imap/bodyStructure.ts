// ImapFlow's bodyStructure is a tree of MIME nodes. We only need two things
// from it without downloading the whole message: whether it has attachments,
// and which part to pull a short plain-text snippet from.

interface BodyStructureNode {
  part?: string
  type?: string
  disposition?: string | null
  dispositionParameters?: Record<string, string>
  parameters?: Record<string, string>
  childNodes?: BodyStructureNode[]
}

export interface BodyStructureInfo {
  hasAttachments: boolean
  snippetPartId: string | null
}

export function analyzeBodyStructure(node: BodyStructureNode | undefined): BodyStructureInfo {
  if (!node) return { hasAttachments: false, snippetPartId: null }

  let hasAttachments = false
  let plainPartId: string | null = null
  let htmlPartId: string | null = null

  const visit = (n: BodyStructureNode): void => {
    const type = (n.type || '').toLowerCase()
    const disposition = (n.disposition || '').toLowerCase()
    const filename = n.dispositionParameters?.filename || n.parameters?.name

    if (disposition === 'attachment' || (filename && type !== 'text/plain' && type !== 'text/html')) {
      hasAttachments = true
    }

    if (type === 'text/plain' && disposition !== 'attachment' && !plainPartId) {
      plainPartId = n.part ?? '1'
    }
    if (type === 'text/html' && disposition !== 'attachment' && !htmlPartId) {
      htmlPartId = n.part ?? '1'
    }

    for (const child of n.childNodes || []) visit(child)
  }

  visit(node)

  return { hasAttachments, snippetPartId: plainPartId ?? htmlPartId }
}
