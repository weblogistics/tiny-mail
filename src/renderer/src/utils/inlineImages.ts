import type { ComposeAttachment } from '@shared/types'

export interface InlineImageExtraction {
  html: string
  attachments: ComposeAttachment[]
}

const DATA_URL_RE = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp'
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.round((base64.length * 3) / 4) - padding)
}

// Compose bodies hold inline images as `<img data-cid="..." src="data:...">`
// so they render immediately in the contentEditable area (a cid: URL only
// resolves once a real mail client renders the delivered message — it's
// meaningless in a browser-like DOM). Before sending, this rewrites each
// one to `src="cid:<cid>"` and pulls its bytes out as a separate
// ComposeAttachment the SMTP layer sends as an inline MIME part.
export function extractInlineImages(html: string): InlineImageExtraction {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const attachments: ComposeAttachment[] = []
  let counter = 0

  doc.querySelectorAll('img[data-cid]').forEach((img) => {
    const cid = img.getAttribute('data-cid')
    const src = img.getAttribute('src') || ''
    const match = src.match(DATA_URL_RE)
    if (!cid || !match) return

    const [, contentType, base64] = match
    counter += 1
    const filename = img.getAttribute('data-filename') || `image-${counter}.${EXTENSION_BY_TYPE[contentType] || 'png'}`

    attachments.push({
      filename,
      contentType,
      size: estimateBase64Bytes(base64),
      contentBase64: base64,
      cid,
      inline: true
    })

    img.setAttribute('src', `cid:${cid}`)
    img.removeAttribute('data-cid')
    img.removeAttribute('data-filename')
  })

  return { html: doc.body.innerHTML, attachments }
}
