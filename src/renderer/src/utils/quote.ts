import type { ComposeDraft, MessageAddress, MessageBody, MessageSummary } from '@shared/types'
import { sanitizeMessageHtml } from './sanitizeHtml'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function addressList(addrs: MessageAddress[]): string {
  return addrs.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')
}

// The quoted content gets inserted into the compose window's contentEditable
// DOM via dangerouslySetInnerHTML, so it must be sanitized the same as the
// reading pane — an inbound message is untrusted content either way.
function originalBodyHtml(body: MessageBody | undefined): string {
  if (body?.html) return sanitizeMessageHtml(body.html, true).html
  if (body?.text) return `<p>${escapeHtml(body.text).replace(/\n/g, '<br>')}</p>`
  return ''
}

export function buildReplyBody(message: MessageSummary, body: MessageBody | undefined): string {
  const from = message.from[0]
  const who = from ? (from.name || from.address) : 'Unknown Sender'
  const when = new Date(message.date).toLocaleString()

  return `<br><br><div>On ${when}, ${escapeHtml(who)} wrote:</div>
<blockquote style="margin:0 0 0 10px;padding-left:10px;border-left:2px solid #ccc;color:#555;">
${originalBodyHtml(body)}
</blockquote>`
}

function subjectWithPrefix(prefix: string, subject: string): string {
  const re = new RegExp(`^${prefix}:\\s*`, 'i')
  return re.test(subject) ? subject : `${prefix}: ${subject}`
}

export function buildReplySeed(
  message: MessageSummary,
  body: MessageBody | undefined,
  selfEmail: string | undefined,
  all: boolean,
  // True when `message` is sitting in Sent/Drafts, meaning its own From is
  // you — the reply needs to go back to the original recipients instead.
  isOutgoing = false
): Partial<ComposeDraft> {
  const primary = isOutgoing ? message.to : message.from
  const to = primary.map((a) => a.address).join(', ')
  const secondary = isOutgoing ? message.cc : [...message.to, ...message.cc]
  const cc = all
    ? secondary
        .map((a) => a.address)
        .filter((addr) => addr.toLowerCase() !== selfEmail?.toLowerCase())
        .join(', ')
    : ''
  return {
    to,
    cc,
    subject: subjectWithPrefix('Re', message.subject),
    html: buildReplyBody(message, body),
    inReplyTo: message.messageId || undefined,
    references: message.messageId || undefined
  }
}

export function buildForwardSeed(message: MessageSummary, body: MessageBody | undefined): Partial<ComposeDraft> {
  return {
    subject: subjectWithPrefix('Fwd', message.subject),
    html: buildForwardBody(message, body)
  }
}

export function buildForwardBody(message: MessageSummary, body: MessageBody | undefined): string {
  return `<br><br><div>Begin forwarded message:</div>
<div style="margin-top:8px;">
<div><b>From:</b> ${escapeHtml(addressList(message.from))}</div>
<div><b>Date:</b> ${escapeHtml(new Date(message.date).toLocaleString())}</div>
<div><b>To:</b> ${escapeHtml(addressList(message.to))}</div>
<div><b>Subject:</b> ${escapeHtml(message.subject)}</div>
</div>
<blockquote style="margin:8px 0 0 10px;padding-left:10px;border-left:2px solid #ccc;">
${originalBodyHtml(body)}
</blockquote>`
}
