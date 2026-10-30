import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { formatMessageDate } from './formatDate'

describe('formatMessageDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a time for messages sent today', () => {
    expect(formatMessageDate('2026-10-31T09:15:00')).toMatch(/9:15 AM/)
  })

  it('shows month and day for messages sent earlier this year', () => {
    expect(formatMessageDate('2026-03-05T09:15:00')).toBe('Mar 5')
  })

  it('shows a full short date for messages sent in a previous year', () => {
    expect(formatMessageDate('2024-03-05T09:15:00')).toBe('03/05/24')
  })
})
