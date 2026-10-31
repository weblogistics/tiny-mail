import type { MessageSummary } from '@shared/types'

export type MessageFilterKey = 'all' | 'unread' | 'flagged' | 'attachments'
export type MessageSortKey = 'date-desc' | 'date-asc' | 'sender' | 'subject'

export const FILTER_OPTIONS: { value: MessageFilterKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'attachments', label: 'Has Attachments' }
]

export const SORT_OPTIONS: { value: MessageSortKey; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'sender', label: 'Sender' },
  { value: 'subject', label: 'Subject' }
]

function senderLabel(msg: MessageSummary): string {
  const from = msg.from[0]
  return (from?.name || from?.address || '').toLowerCase()
}

export function filterMessages(messages: MessageSummary[], filter: MessageFilterKey): MessageSummary[] {
  switch (filter) {
    case 'unread':
      return messages.filter((m) => !m.flags.seen)
    case 'flagged':
      return messages.filter((m) => m.flags.flagged)
    case 'attachments':
      return messages.filter((m) => m.hasAttachments)
    default:
      return messages
  }
}

// Exposed separately from sortMessages so thread-grouped views can sort
// each thread's representative message with identical ordering rules
// without re-sorting (and losing the deliberate oldest-first order of)
// the full per-thread message list.
export function getMessageComparator(sort: MessageSortKey): (a: MessageSummary, b: MessageSummary) => number {
  switch (sort) {
    case 'date-asc':
      return (a, b) => a.date.localeCompare(b.date)
    case 'sender':
      return (a, b) => senderLabel(a).localeCompare(senderLabel(b))
    case 'subject':
      return (a, b) => a.subject.toLowerCase().localeCompare(b.subject.toLowerCase())
    case 'date-desc':
    default:
      return (a, b) => b.date.localeCompare(a.date)
  }
}

export function sortMessages(messages: MessageSummary[], sort: MessageSortKey): MessageSummary[] {
  return [...messages].sort(getMessageComparator(sort))
}

export function filterAndSortMessages(
  messages: MessageSummary[],
  filter: MessageFilterKey,
  sort: MessageSortKey
): MessageSummary[] {
  return sortMessages(filterMessages(messages, filter), sort)
}
