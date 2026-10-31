import type { MailboxSummary } from '@shared/types'

// A message sitting in Sent or Drafts has *you* as its From address — so
// "reply" needs to address the original recipients (its To/Cc) instead,
// or the reply would be addressed back to yourself.
export function isOutgoingMailbox(boxes: MailboxSummary[], mailboxPath: string): boolean {
  const mb = boxes.find((b) => b.path === mailboxPath)
  return mb?.specialUse === 'Sent' || mb?.specialUse === 'Drafts'
}
