import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { AccountConfig } from '@shared/types'
import { AccountFormFields, type AccountFormState } from './AccountFormFields'
import styles from './AccountSetupDialog.module.css'

const PALETTE = ['#0a84ff', '#ff9f0a', '#28c840', '#ff3b30', '#af52de', '#64d2ff']

const initialForm: AccountFormState = {
  displayName: '',
  email: '',
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: '',
  smtpPort: 587,
  smtpSecurity: 'starttls',
  signature: '',
  mailboxRoleOverrides: {}
}

export function AccountSetupDialog(): JSX.Element | null {
  const isOpen = useMailStore((s) => s.isAccountDialogOpen)
  const setAccountDialogOpen = useMailStore((s) => s.setAccountDialogOpen)
  const addAccount = useMailStore((s) => s.addAccount)
  const accounts = useMailStore((s) => s.accounts)
  const [form, setForm] = useState<AccountFormState>(initialForm)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const patch = (p: Partial<AccountFormState>): void => setForm((f) => ({ ...f, ...p }))

  const configFromForm = (): Omit<AccountConfig, 'id'> => ({
    displayName: form.displayName || form.email,
    email: form.email,
    username: form.username || form.email,
    imapHost: form.imapHost,
    imapPort: Number(form.imapPort),
    imapSecurity: form.imapSecurity,
    smtpHost: form.smtpHost,
    smtpPort: Number(form.smtpPort),
    smtpSecurity: form.smtpSecurity,
    color: PALETTE[accounts.length % PALETTE.length],
    signature: '',
    mailboxRoleOverrides: {}
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

        <AccountFormFields form={form} patch={patch} passwordRequired />

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
