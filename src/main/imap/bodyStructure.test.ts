import { describe, expect, it } from 'vitest'
import { analyzeBodyStructure, extractBodyParts } from './bodyStructure'

describe('analyzeBodyStructure', () => {
  it('finds a plain text part and no attachments for a simple text email', () => {
    const result = analyzeBodyStructure({ part: '1', type: 'text/plain' })
    expect(result).toEqual({ hasAttachments: false, snippetPartId: '1' })
  })

  it('prefers text/plain over text/html for the snippet when both exist', () => {
    const result = analyzeBodyStructure({
      type: 'multipart/alternative',
      childNodes: [
        { part: '1.1', type: 'text/plain' },
        { part: '1.2', type: 'text/html' }
      ]
    })
    expect(result.snippetPartId).toBe('1.1')
  })

  it('falls back to text/html when no plain text part exists', () => {
    const result = analyzeBodyStructure({
      type: 'multipart/mixed',
      childNodes: [{ part: '1', type: 'text/html' }]
    })
    expect(result.snippetPartId).toBe('1')
  })

  it('detects an attachment by content-disposition', () => {
    const result = analyzeBodyStructure({
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        {
          part: '2',
          type: 'application/pdf',
          disposition: 'attachment',
          dispositionParameters: { filename: 'invoice.pdf' }
        }
      ]
    })
    expect(result.hasAttachments).toBe(true)
    expect(result.snippetPartId).toBe('1')
  })

  it('returns no attachment and no snippet for an undefined structure', () => {
    expect(analyzeBodyStructure(undefined)).toEqual({ hasAttachments: false, snippetPartId: null })
  })
})

describe('extractBodyParts', () => {
  it('finds both text and html bodies from a multipart/alternative', () => {
    const result = extractBodyParts({
      type: 'multipart/alternative',
      childNodes: [
        { part: '1.1', type: 'text/plain' },
        { part: '1.2', type: 'text/html' }
      ]
    })
    expect(result.textPartId).toBe('1.1')
    expect(result.htmlPartId).toBe('1.2')
    expect(result.parts).toEqual([])
  })

  it('treats a single-part non-multipart text email as part "1"', () => {
    const result = extractBodyParts({ type: 'text/html' })
    expect(result.htmlPartId).toBe('1')
  })

  it('collects a real attachment with its metadata, not as the body', () => {
    const result = extractBodyParts({
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        {
          part: '2',
          type: 'application/pdf',
          size: 48213,
          disposition: 'attachment',
          dispositionParameters: { filename: 'invoice.pdf' }
        }
      ]
    })
    expect(result.textPartId).toBe('1')
    expect(result.parts).toEqual([
      { partId: '2', filename: 'invoice.pdf', contentType: 'application/pdf', size: 48213, contentId: null, inline: false }
    ])
  })

  it('treats a content-id part with no explicit disposition as inline', () => {
    const result = extractBodyParts({
      type: 'multipart/related',
      childNodes: [
        { part: '1', type: 'text/html' },
        { part: '2', type: 'image/png', id: '<logo123@example.com>', size: 900 }
      ]
    })
    expect(result.parts).toEqual([
      { partId: '2', filename: 'image/png', contentType: 'image/png', size: 900, contentId: 'logo123@example.com', inline: true }
    ])
  })

  it('recurses through nested multipart containers', () => {
    const result = extractBodyParts({
      type: 'multipart/mixed',
      childNodes: [
        {
          type: 'multipart/alternative',
          childNodes: [
            { part: '1.1', type: 'text/plain' },
            { part: '1.2', type: 'text/html' }
          ]
        },
        { part: '2', type: 'application/zip', size: 1024, dispositionParameters: { filename: 'files.zip' } }
      ]
    })
    expect(result.textPartId).toBe('1.1')
    expect(result.htmlPartId).toBe('1.2')
    expect(result.parts.map((p) => p.filename)).toEqual(['files.zip'])
  })

  it('returns empty for an undefined structure', () => {
    expect(extractBodyParts(undefined)).toEqual({ htmlPartId: null, textPartId: null, parts: [] })
  })
})
