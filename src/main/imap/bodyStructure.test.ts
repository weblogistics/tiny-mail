import { describe, expect, it } from 'vitest'
import { analyzeBodyStructure } from './bodyStructure'

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
