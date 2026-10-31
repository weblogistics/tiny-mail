// To/Cc/Bcc are plain comma-separated text, not a list of discrete chips, so
// autocomplete operates on the segment after the last comma — the address
// the user is actively typing. This intentionally only supports completing
// the trailing entry (not editing an address earlier in the string), which
// covers the normal "type a few letters, pick a match, keep typing the next
// one" compose flow without needing caret-position tracking.
export function getLastAddressToken(value: string): string {
  const lastComma = value.lastIndexOf(',')
  return value.slice(lastComma + 1).trim()
}

export function replaceLastAddressToken(value: string, replacement: string): string {
  const lastComma = value.lastIndexOf(',')
  const prefix = lastComma >= 0 ? `${value.slice(0, lastComma + 1)} ` : ''
  return `${prefix}${replacement}, `
}
