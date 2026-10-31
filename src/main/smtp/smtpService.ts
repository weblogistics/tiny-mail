import nodemailer, { type Transporter } from 'nodemailer'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer')
import type { AccountStore } from '../accounts/accountStore'
import type { AccountConfig, ComposeAttachment, ComposeDraft, ConnectionSecurity } from '@shared/types'

function resolveTls(security: ConnectionSecurity): { secure: boolean; requireTLS: boolean; ignoreTLS: boolean } {
  if (security === 'ssl') return { secure: true, requireTLS: false, ignoreTLS: false }
  if (security === 'starttls') return { secure: false, requireTLS: true, ignoreTLS: false }
  return { secure: false, requireTLS: false, ignoreTLS: true }
}

// A regular attachment (from "Attach File") has `path`; an inline image
// (from the rich-text toolbar's Insert Image) instead has `contentBase64`
// and a `cid` that the compose HTML already references as `cid:<cid>`.
function toNodemailerAttachments(attachments: ComposeAttachment[]): Record<string, unknown>[] {
  return attachments.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    ...(a.path ? { path: a.path } : {}),
    ...(a.contentBase64 ? { content: a.contentBase64, encoding: 'base64' } : {}),
    ...(a.cid ? { cid: a.cid, contentDisposition: 'inline' as const } : {})
  }))
}

export async function verifySmtpConfig(
  config: Pick<AccountConfig, 'smtpHost' | 'smtpPort' | 'smtpSecurity' | 'username'>,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    ...resolveTls(config.smtpSecurity),
    auth: { user: config.username, pass: password },
    // nodemailer's default is 2 minutes, which makes a misconfigured
    // host/port feel like the app has hung instead of reporting an error.
    connectionTimeout: 15000
  })
  try {
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    transporter.close()
  }
}

export class SmtpService {
  private transporters = new Map<string, Transporter>()

  constructor(private accountStore: AccountStore) {}

  private getTransporter(accountId: string): Transporter {
    const existing = this.transporters.get(accountId)
    if (existing) return existing

    const account = this.accountStore.get(accountId)
    if (!account) throw new Error(`Unknown account: ${accountId}`)
    const password = this.accountStore.getPassword(accountId)

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      ...resolveTls(account.smtpSecurity),
      auth: { user: account.username, pass: password },
      connectionTimeout: 15000
    })
    this.transporters.set(accountId, transporter)
    return transporter
  }

  async send(draft: ComposeDraft): Promise<void> {
    const account = this.accountStore.get(draft.accountId)
    if (!account) throw new Error(`Unknown account: ${draft.accountId}`)
    const transporter = this.getTransporter(draft.accountId)

    await transporter.sendMail({
      from: { name: account.displayName, address: account.email },
      to: draft.to,
      cc: draft.cc || undefined,
      bcc: draft.bcc || undefined,
      subject: draft.subject,
      html: draft.html,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments: toNodemailerAttachments(draft.attachments)
    })
  }

  async buildMime(draft: ComposeDraft): Promise<Buffer> {
    const account = this.accountStore.get(draft.accountId)
    if (!account) throw new Error(`Unknown account: ${draft.accountId}`)

    const composer = new MailComposer({
      from: { name: account.displayName, address: account.email },
      to: draft.to,
      cc: draft.cc || undefined,
      bcc: draft.bcc || undefined,
      subject: draft.subject,
      html: draft.html,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments: toNodemailerAttachments(draft.attachments)
    })

    return new Promise((resolve, reject) => {
      composer.compile().build((err: Error | null, message: Buffer) => {
        if (err) reject(err)
        else resolve(message)
      })
    })
  }

  dispose(): void {
    for (const t of this.transporters.values()) t.close()
    this.transporters.clear()
  }
}
