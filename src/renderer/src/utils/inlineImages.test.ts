// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractInlineImages } from './inlineImages'

// A minimal valid 1x1 PNG, base64-encoded.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('extractInlineImages', () => {
  it('rewrites a data: image with data-cid to a cid: reference', () => {
    const html = `<p>Hi</p><img data-cid="abc123" src="data:image/png;base64,${PNG_BASE64}">`
    const { html: out, attachments } = extractInlineImages(html)

    expect(out).toContain('src="cid:abc123"')
    expect(out).not.toContain('data:image/png')
    expect(out).not.toContain('data-cid')
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ cid: 'abc123', contentType: 'image/png', inline: true })
    expect(attachments[0].contentBase64).toBe(PNG_BASE64)
  })

  it('leaves a normal remote <img> (no data-cid) untouched', () => {
    const html = '<img src="https://example.com/a.png">'
    const { html: out, attachments } = extractInlineImages(html)
    expect(out).toContain('src="https://example.com/a.png"')
    expect(attachments).toHaveLength(0)
  })

  it('ignores an img with data-cid whose src is not actually a data: URL', () => {
    const html = '<img data-cid="x" src="https://example.com/a.png">'
    const { attachments } = extractInlineImages(html)
    expect(attachments).toHaveLength(0)
  })

  it('handles multiple inline images with distinct cids', () => {
    const html = `
      <img data-cid="one" src="data:image/png;base64,${PNG_BASE64}">
      <img data-cid="two" src="data:image/png;base64,${PNG_BASE64}">
    `
    const { attachments } = extractInlineImages(html)
    expect(attachments.map((a) => a.cid).sort()).toEqual(['one', 'two'])
  })

  it('uses a provided data-filename, or falls back to a generated one', () => {
    const html = `<img data-cid="a" data-filename="logo.png" src="data:image/png;base64,${PNG_BASE64}">`
    const { attachments } = extractInlineImages(html)
    expect(attachments[0].filename).toBe('logo.png')

    const htmlNoName = `<img data-cid="b" src="data:image/png;base64,${PNG_BASE64}">`
    const result2 = extractInlineImages(htmlNoName)
    expect(result2.attachments[0].filename).toMatch(/^image-1\.png$/)
  })

  it('estimates a non-zero byte size from the base64 payload', () => {
    const html = `<img data-cid="a" src="data:image/png;base64,${PNG_BASE64}">`
    const { attachments } = extractInlineImages(html)
    expect(attachments[0].size).toBeGreaterThan(0)
  })
})
