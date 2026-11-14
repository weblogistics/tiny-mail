import type { MessageSummary } from './types'

// Newest first. Dates are ISO strings, which sort correctly as plain
// strings, but the comparison is spelled out (rather than localeCompare or
// a Date diff) so the three call sites that need this — prefetch ordering,
// server-search progress ticks, and merging server results into the
// renderer's search view — stay in agreement on tie-breaking if this ever
// changes.
export function sortByDateDesc(messages: MessageSummary[]): MessageSummary[] {
  return messages.sort((a, b) => (a.date < b.date ? 1 : -1))
}
