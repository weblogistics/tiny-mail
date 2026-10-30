import { useEffect, useState } from 'react'
import type { AccountConfig } from '@shared/types'
import { AccountFormFields, type AccountFormState } from '../AccountFormFields'
import { IconPencil, IconTrash } from '../Icons'
import styles from './SettingsTab.module.css'

const PALETTE = ['#0a84ff', '#ff9f0a', '#28c840', '#ff3b30', '#af52de', '#64d2ff']

const blankForm: AccountFormState = {
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
  signature: ''
}

function toForm(account: AccountConfig): AccountFormState {
  return { ...account, password: '' }
}

export function AccountsSettingsTab(): JSX.Element {
  const [accounts, setAccounts] = useState<AccountConfig[]>([])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<AccountFormState>(blankForm)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async (): Promise<void> => setAccounts(await window.api.accounts.list())

  useEffect(() => {
    load()
  }, [])

  const patch = (p: Partial<AccountFormState>): void => setForm((f) => ({ ...f, ...p }))

  const startEdit = (account: AccountConfig): void => {
    setEditingId(account.id)
    setForm(toForm(account))
    setTestResult(null)
  }

  const startAdd = (): void => {
    setEditingId('new')
    setForm(blankForm)
    setTestResult(null)
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setTestResult(null)
  }

  const configFromForm = (existingColor?: string): Omit<AccountConfig, 'id'> => ({
    displayName: form.displayName || form.email,
    email: form.email,
    username: form.username || form.email,
    imapHost: form.imapHost,
    imapPort: Number(form.imapPort),
    imapSecurity: form.imapSecurity,
    smtpHost: form.smtpHost,
    smtpPort: Number(form.smtpPort),
    smtpSecurity: form.smtpSecurity,
    color: existingColor ?? PALETTE[accounts.length % PALETTE.length],
    signature: form.signature
  })

  const handleTest = async (): Promise<void> => {
    if (!form.password) return
    setTesting(true)
    setTestResult(null)
    try {
      const existing = typeof editingId === 'string' && editingId !== 'new' ? accounts.find((a) => a.id === editingId) : undefined
      const result = await window.api.accounts.testConnection(configFromForm(existing?.color), form.password)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      if (editingId === 'new') {
        await window.api.accounts.add(configFromForm(), form.password)
      } else if (editingId) {
        const existing = accounts.find((a) => a.id === editingId)
        await window.api.accounts.update(editingId, configFromForm(existing?.color), form.password || undefined)
      }
      await load()
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (account: AccountConfig): Promise<void> => {
    if (!window.confirm(`Remove ${account.email}? This only removes it from Tiny Mail — your mail stays on the server.`)) {
      return
    }
    await window.api.accounts.remove(account.id)
    await load()
    if (editingId === account.id) setEditingId(null)
  }

  const canSave = form.email && form.imapHost && form.smtpHost && (editingId === 'new' ? form.password : true)

  return (
    <div>
      <div className={styles.accountList}>
        {accounts.map((a) => (
          <div key={a.id} className={styles.accountRow}>
            <span className={styles.accountDot} style={{ background: a.color }} />
            <div className={styles.accountInfo}>
              <div className={styles.accountName}>{a.displayName}</div>
              <div className={styles.accountEmail}>{a.email}</div>
            </div>
            <div className={styles.accountActions}>
              <button className={styles.iconButton} title="Edit" onClick={() => startEdit(a)}>
                <IconPencil width={15} height={15} />
              </button>
              <button className={styles.iconButton} title="Remove" onClick={() => handleRemove(a)}>
                <IconTrash width={15} height={15} />
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className={styles.accountRow}>
            <span className={styles.accountEmail}>No accounts yet.</span>
          </div>
        )}
      </div>

      {editingId === null && (
        <button className={styles.addButton} onClick={startAdd}>
          + Add Account
        </button>
      )}

      {editingId !== null && (
        <div className={styles.editPanel}>
          <div className={styles.editHeader}>
            <span className={styles.editTitle}>{editingId === 'new' ? 'Add Account' : 'Edit Account'}</span>
          </div>

          <AccountFormFields
            form={form}
            patch={patch}
            passwordRequired={editingId === 'new'}
            passwordPlaceholder={editingId === 'new' ? undefined : 'Leave blank to keep current password'}
          />

          <div className={styles.signatureField}>
            <label>Signature</label>
            <textarea
              value={form.signature}
              onChange={(e) => patch({ signature: e.target.value })}
              placeholder="Appended to new messages sent from this account"
            />
          </div>

          {testResult && (
            <div className={testResult.ok ? styles.testOk : styles.testError} style={{ marginTop: 10 }}>
              {testResult.ok ? 'Connection succeeded.' : `Connection failed: ${testResult.error}`}
            </div>
          )}

          <div className={styles.editFooter}>
            <div className={styles.testRow}>
              <button className={styles.cancelLink} onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className={styles.iconButton}
                style={{ width: 'auto', padding: '4px 10px' }}
                onClick={handleTest}
                disabled={testing || !form.imapHost || !form.password}
                title={!form.password ? 'Enter the password to test the connection' : undefined}
              >
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            </div>
            <button className={styles.saveButton} onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
