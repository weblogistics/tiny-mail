import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { AccountConfig } from '@shared/types'
import styles from './AccountSetupDialog.module.css'

const PALETTE = ['#0a84ff', '#ff9f0a', '#28c840', '#ff3b30', '#af52de', '#64d2ff']

type FormState = Omit<AccountConfig, 'id' | 'color'> & { password: string }

const initialForm: FormState = {
  displayName: '',
  email: '',
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true
}

export function AccountSetupDialog(): JSX.Element | null {
  const isOpen = useMailStore((s) => s.isAccountDialogOpen)
  const setAccountDialogOpen = useMailStore((s) => s.setAccountDialogOpen)
  const addAccount = useMailStore((s) => s.addAccount)
  const accounts = useMailStore((s) => s.accounts)
  const [form, setForm] = useState<FormState>(initialForm)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const patch = (p: Partial<FormState>): void => setForm((f) => ({ ...f, ...p }))

  const configFromForm = (): Omit<AccountConfig, 'id'> => ({
    displayName: form.displayName || form.email,
    email: form.email,
    username: form.username || form.email,
    imapHost: form.imapHost,
    imapPort: Number(form.imapPort),
    imapSecure: form.imapSecure,
    smtpHost: form.smtpHost,
    smtpPort: Number(form.smtpPort),
    smtpSecure: form.smtpSecure,
    color: PALETTE[accounts.length % PALETTE.length]
  })

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.accounts.testConnection(configFromForm(), form.password)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await addAccount(configFromForm(), form.password)
      setForm(initialForm)
      setTestResult(null)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.email && form.password && form.imapHost && form.smtpHost

  return (
    <div className={styles.overlay}>
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <div className={styles.header}>
          <h2>Add Account</h2>
          {accounts.length > 0 && (
            <button type="button" className={styles.cancel} onClick={() => setAccountDialogOpen(false)}>
              Cancel
            </button>
          )}
        </div>

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
            <input type="password" value={form.password} onChange={(e) => patch({ password: e.target.value })} required />
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

        {testResult && (
          <div className={testResult.ok ? styles.testOk : styles.testError}>
            {testResult.ok ? 'Connection succeeded.' : `Connection failed: ${testResult.error}`}
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.testButton} onClick={handleTest} disabled={testing || !form.imapHost}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button type="submit" className={styles.submitButton} disabled={!canSubmit || submitting}>
            {submitting ? 'Adding…' : 'Add Account'}
          </button>
        </div>
      </form>
    </div>
  )
}
