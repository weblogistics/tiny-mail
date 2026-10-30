// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeMessageHtml } from './sanitizeHtml'

describe('sanitizeMessageHtml', () => {
  it('strips script tags and inline event handlers', () => {
    const { html } = sanitizeMessageHtml(
      '<p onclick="alert(1)">Hello</p><script>alert(2)</script>',
      true
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).toContain('Hello')
  })

  it('blocks remote images by default and flags that it did', () => {
    const { html, hadRemoteImages } = sanitizeMessageHtml(
      '<img src="https://tracker.example.com/pixel.gif">',
      false
    )
    expect(hadRemoteImages).toBe(true)
    expect(html).not.toMatch(/(^|\s)src="https:\/\/tracker\.example\.com/)
    expect(html).toContain('data-blocked-src="https://tracker.example.com/pixel.gif"')
  })

  it('allows remote images through when explicitly permitted', () => {
    const { html } = sanitizeMessageHtml('<img src="https://example.com/a.png">', true)
    expect(html).toContain('src="https://example.com/a.png"')
  })

  it('leaves inline data: images untouched regardless of the remote-image setting', () => {
    const { html, hadRemoteImages } = sanitizeMessageHtml(
      '<img src="data:image/png;base64,AAAA">',
      false
    )
    expect(hadRemoteImages).toBe(false)
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })
})
