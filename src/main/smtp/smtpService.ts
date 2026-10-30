import nodemailer, { type Transporter } from 'nodemailer'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer')
import type { AccountStore } from '../accounts/accountStore'
import type { AccountConfig, ComposeDraft } from '@shared/types'

// Port 465 is implicit TLS (connect straight into a TLS handshake); every
// other port (587, 25, ...) is the submission convention: connect in plain
// text and upgrade via STARTTLS. Treating the "Use SSL" checkbox as "secure"
// on a non-465 port makes nodemailer attempt a TLS handshake the server
// isn't expecting, so derive the real transport mode from the port instead.
function resolveTls(account: Pick<AccountConfig, 'smtpPort' | 'smtpSecure'>): {
  secure: boolean
  requireTLS: boolean
} {
  if (account.smtpPort === 465) return { secure: account.smtpSecure, requireTLS: false }
  return { secure: false, requireTLS: account.smtpSecure }
}

export async function verifySmtpConfig(
  config: Pick<AccountConfig, 'smtpHost' | 'smtpPort' | 'smtpSecure' | 'username'>,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    ...resolveTls(config as AccountConfig),
    auth: { user: config.username, pass: password }
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
      ...resolveTls(account),
      auth: { user: account.username, pass: password }
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
      attachments: draft.attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType
      }))
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
      attachments: draft.attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType
      }))
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
