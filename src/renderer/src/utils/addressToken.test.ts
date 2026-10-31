import { describe, expect, it } from 'vitest'
import { getLastAddressToken, replaceLastAddressToken } from './addressToken'

describe('getLastAddressToken', () => {
  it('returns the whole value when there is no comma yet', () => {
    expect(getLastAddressToken('ali')).toBe('ali')
  })

  it('returns the segment after the last comma, trimmed', () => {
    expect(getLastAddressToken('alice@x.com, bo')).toBe('bo')
  })

  it('returns an empty string right after typing a comma', () => {
    expect(getLastAddressToken('alice@x.com, ')).toBe('')
  })
})

describe('replaceLastAddressToken', () => {
  it('replaces the only token when there is no comma yet', () => {
    expect(replaceLastAddressToken('bo', 'Bob <bob@x.com>')).toBe('Bob <bob@x.com>, ')
  })

  it('keeps earlier addresses and replaces only the trailing token', () => {
    expect(replaceLastAddressToken('alice@x.com, bo', 'Bob <bob@x.com>')).toBe('alice@x.com, Bob <bob@x.com>, ')
  })

  it('leaves a trailing ", " ready for the next address', () => {
    const result = replaceLastAddressToken('', 'Alice <alice@x.com>')
    expect(result.endsWith(', ')).toBe(true)
  })

  it('handles multiple existing addresses before the trailing token', () => {
    const result = replaceLastAddressToken('alice@x.com, bob@x.com, ch', 'Charlie <charlie@x.com>')
    expect(result).toBe('alice@x.com, bob@x.com, Charlie <charlie@x.com>, ')
  })
})
