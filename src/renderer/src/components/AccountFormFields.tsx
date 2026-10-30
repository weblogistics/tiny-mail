import type { AccountConfig } from '@shared/types'
import styles from './AccountSetupDialog.module.css'

export type AccountFormState = Omit<AccountConfig, 'id' | 'color'> & { password: string }

interface AccountFormFieldsProps {
  form: AccountFormState
  patch: (p: Partial<AccountFormState>) => void
  passwordRequired: boolean
  passwordPlaceholder?: string
}

export function AccountFormFields({
  form,
  patch,
  passwordRequired,
  passwordPlaceholder
}: AccountFormFieldsProps): JSX.Element {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.row}>
          <label>Name</label>
          <input value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} placeholder="Your Name" />
        </div>
        <div className={styles.row}>
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className={styles.row}>
          <label>Username</label>
          <input value={form.username} onChange={(e) => patch({ username: e.target.value })} placeholder="Defaults to email" />
        </div>
        <div className={styles.row}>
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => patch({ password: e.target.value })}
            placeholder={passwordPlaceholder}
            required={passwordRequired}
          />
        </div>
      </div>

      <div className={styles.sectionTitle}>Incoming Mail Server (IMAP)</div>
      <div className={styles.section}>
        <div className={styles.row}>
          <label>Host</label>
          <input value={form.imapHost} onChange={(e) => patch({ imapHost: e.target.value })} placeholder="imap.example.com" required />
        </div>
        <div className={styles.row}>
          <label>Port</label>
          <input type="number" value={form.imapPort} onChange={(e) => patch({ imapPort: Number(e.target.value) })} />
          <label className={styles.inlineCheck}>
            <input type="checkbox" checked={form.imapSecure} onChange={(e) => patch({ imapSecure: e.target.checked })} />
            Use SSL
          </label>
        </div>
      </div>

      <div className={styles.sectionTitle}>Outgoing Mail Server (SMTP)</div>
      <div className={styles.section}>
        <div className={styles.row}>
          <label>Host</label>
          <input value={form.smtpHost} onChange={(e) => patch({ smtpHost: e.target.value })} placeholder="smtp.example.com" required />
        </div>
        <div className={styles.row}>
          <label>Port</label>
          <input type="number" value={form.smtpPort} onChange={(e) => patch({ smtpPort: Number(e.target.value) })} />
          <label className={styles.inlineCheck}>
            <input type="checkbox" checked={form.smtpSecure} onChange={(e) => patch({ smtpSecure: e.target.checked })} />
            Use SSL
          </label>
        </div>
      </div>
    </>
  )
}
