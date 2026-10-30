import DOMPurify from 'dompurify'

export interface SanitizeResult {
  html: string
  hadRemoteImages: boolean
}

export function sanitizeMessageHtml(rawHtml: string, allowRemoteImages: boolean): SanitizeResult {
  let hadRemoteImages = false

  DOMPurify.addHook('uponSanitizeElement', (node) => {
    if (node.nodeName === 'IMG') {
      const src = (node as HTMLImageElement).getAttribute('src') || ''
      const isRemote = /^https?:\/\//i.test(src)
      if (isRemote) {
        hadRemoteImages = true
        if (!allowRemoteImages) {
          ;(node as HTMLImageElement).removeAttribute('src')
          ;(node as HTMLImageElement).setAttribute('data-blocked-src', src)
        }
      }
    }
  })

  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'em', 'strong', 'u', 's', 'p', 'br', 'div', 'span', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'font'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'target', 'data-blocked-src', 'cid', 'width', 'height', 'color', 'align'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    ALLOW_DATA_ATTR: true
  })

  DOMPurify.removeHook('uponSanitizeElement')
  return { html: clean, hadRemoteImages }
}
