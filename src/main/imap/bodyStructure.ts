// ImapFlow's bodyStructure is a tree of MIME nodes. We only need two things
// from it without downloading the whole message: whether it has attachments,
// and which part to pull a short plain-text snippet from.

interface BodyStructureNode {
  part?: string
  type?: string
  id?: string
  size?: number
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

export interface BodyPartInfo {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  inline: boolean
}

export interface BodyPartsResult {
  htmlPartId: string | null
  textPartId: string | null
  parts: BodyPartInfo[]
}

// Walks the same tree to find every leaf part needed to render a full
// message without downloading the parts that don't matter yet: the
// text/html body part IDs (to fetch just those), and metadata for every
// other leaf (the real attachments plus inline-referenced resources like
// embedded images) so the UI can show filenames/sizes immediately and fetch
// each one's bytes only when actually needed.
export function extractBodyParts(node: BodyStructureNode | undefined): BodyPartsResult {
  const result: BodyPartsResult = { htmlPartId: null, textPartId: null, parts: [] }
  if (!node) return result

  const visit = (n: BodyStructureNode): void => {
    if (n.childNodes && n.childNodes.length) {
      for (const child of n.childNodes) visit(child)
      return
    }

    const type = (n.type || '').toLowerCase()
    const disposition = (n.disposition || '').toLowerCase()
    const partId = n.part ?? '1'

    if (type === 'text/plain' && disposition !== 'attachment' && !result.textPartId) {
      result.textPartId = partId
      return
    }
    if (type === 'text/html' && disposition !== 'attachment' && !result.htmlPartId) {
      result.htmlPartId = partId
      return
    }

    const filename = n.dispositionParameters?.filename || n.parameters?.name
    const contentId = n.id ? n.id.replace(/^<|>$/g, '') : null
    result.parts.push({
      partId,
      filename: filename || n.type || 'attachment',
      contentType: n.type || 'application/octet-stream',
      size: n.size ?? 0,
      contentId,
      // A part can be "inline" either because the server said so explicitly
      // or, just as commonly in the wild, because a sender omitted
      // Content-Disposition entirely and relied solely on the Content-ID
      // being referenced via cid: in the HTML.
      inline: disposition === 'inline' || (!disposition && !!contentId)
    })
  }

  visit(node)
  return result
}
