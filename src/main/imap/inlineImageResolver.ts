function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface InlineImage {
  cid?: string | null
  contentType: string
  content: Buffer
}

// Received HTML references inline images as `cid:<content-id>`, which only
// a real mail client's rendering layer resolves — in our own DOM it's just
// a broken image. Replace each with a data: URI built from the matching
// part's already-downloaded, already-decoded content so the reading pane
// shows them directly.
export function resolveInlineImages(html: string, attachments: InlineImage[]): string {
  let result = html
  for (const a of attachments) {
    if (!a.cid) continue
    const dataUri = `data:${a.contentType};base64,${a.content.toString('base64')}`
    result = result.replace(new RegExp(`cid:${escapeRegExp(a.cid)}`, 'g'), dataUri)
  }
  return result
}
