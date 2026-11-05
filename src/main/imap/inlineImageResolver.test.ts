import { describe, expect, it } from 'vitest'
import { resolveInlineImages, type InlineImage } from './inlineImageResolver'

function attachment(overrides: Partial<InlineImage>): InlineImage {
  return {
    contentType: 'image/png',
    content: Buffer.from('fake-image-bytes'),
    ...overrides
  }
}

describe('resolveInlineImages', () => {
  it('replaces a cid: reference with a data: URI built from the matching attachment', () => {
    const html = '<p>Look:</p><img src="cid:abc123@example.com">'
    const result = resolveInlineImages(html, [attachment({ cid: 'abc123@example.com', contentType: 'image/png' })])

    expect(result).not.toContain('cid:abc123@example.com')
    expect(result).toContain('src="data:image/png;base64,')
    expect(result).toContain(Buffer.from('fake-image-bytes').toString('base64'))
  })

  it('leaves the html unchanged when no attachment has a cid', () => {
    const html = '<p>No images here</p>'
    expect(resolveInlineImages(html, [attachment({ cid: undefined })])).toBe(html)
  })

  it('leaves an unmatched cid: reference alone', () => {
    const html = '<img src="cid:unknown@example.com">'
    const result = resolveInlineImages(html, [attachment({ cid: 'other@example.com' })])
    expect(result).toBe(html)
  })

  it('replaces every occurrence of the same cid', () => {
    const html = '<img src="cid:logo@x"><img src="cid:logo@x">'
    const result = resolveInlineImages(html, [attachment({ cid: 'logo@x' })])
    expect(result.match(/data:image\/png;base64,/g)).toHaveLength(2)
  })

  it('treats regex-special characters in a cid literally', () => {
    const html = '<img src="cid:a.b+c@x.y">'
    const result = resolveInlineImages(html, [attachment({ cid: 'a.b+c@x.y' })])
    expect(result).toContain('src="data:image/png;base64,')
  })

  it('resolves multiple distinct images independently', () => {
    const html = '<img src="cid:one"><img src="cid:two">'
    const result = resolveInlineImages(html, [
      attachment({ cid: 'one', content: Buffer.from('AAA') }),
      attachment({ cid: 'two', content: Buffer.from('BBB') })
    ])
    expect(result).toContain(Buffer.from('AAA').toString('base64'))
    expect(result).toContain(Buffer.from('BBB').toString('base64'))
  })
})
