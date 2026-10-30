import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { AccountConfig, ConnectionSecurity } from '@shared/types'

interface StoredAccount extends AccountConfig {
  encryptedPassword: string // base64
}

// Pre-dates the 'ssl' | 'starttls' | 'none' security enum, back when it was
// just an "Use SSL" checkbox whose meaning for SMTP depended on the port.
interface LegacyStoredAccount {
  imapSecure?: boolean
  imapSecurity?: ConnectionSecurity
  smtpPort?: number
  smtpSecure?: boolean
  smtpSecurity?: ConnectionSecurity
}

function migrateSecurity(a: StoredAccount & LegacyStoredAccount): StoredAccount {
  // Old behavior: SMTP only used implicit TLS on port 465; any other port
  // upgraded via STARTTLS when "Use SSL" was checked (and opportunistically
  // even when it wasn't, since nodemailer/imapflow try STARTTLS by default
  // when not told to use implicit TLS) — so 'starttls' is the closest
  // equivalent for every case except "465 and checked".
  const imapSecurity = a.imapSecurity ?? (a.imapSecure ? 'ssl' : 'starttls')
  const smtpSecurity = a.smtpSecurity ?? (a.smtpSecure && a.smtpPort === 465 ? 'ssl' : 'starttls')
  const { imapSecure: _is, smtpSecure: _ss, ...rest } = a
  return { ...rest, imapSecurity, smtpSecurity }
}

export class AccountStore {
  private filePath: string
  private accounts: StoredAccount[] = []

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'accounts.json')
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.accounts = []
      return
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as (StoredAccount & LegacyStoredAccount)[]
      // `signature` was added after the initial release; default it for
      // accounts saved before the field existed.
      const withSignature = parsed.map((a) => ({ ...a, signature: a.signature ?? '' }))
      this.accounts = withSignature.map(migrateSecurity)
      if (parsed.some((a) => !a.imapSecurity || !a.smtpSecurity)) this.persist()
    } catch {
      this.accounts = []
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.accounts, null, 2), 'utf-8')
  }

  list(): AccountConfig[] {
    return this.accounts.map(({ encryptedPassword, ...rest }) => rest)
  }

  getPassword(accountId: string): string {
    const account = this.accounts.find((a) => a.id === accountId)
    if (!account) throw new Error(`Unknown account: ${accountId}`)
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(account.encryptedPassword, 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(account.encryptedPassword, 'base64'))
  }

  add(config: Omit<AccountConfig, 'id'>, password: string): AccountConfig {
    const id = randomUUID()
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(password).toString('base64')
      : Buffer.from(password, 'utf-8').toString('base64')
    const account: StoredAccount = { ...config, id, encryptedPassword: encrypted }
    this.accounts.push(account)
    this.persist()
    const { encryptedPassword, ...rest } = account
    return rest
  }

  update(accountId: string, config: Omit<AccountConfig, 'id'>, password?: string): AccountConfig {
    const idx = this.accounts.findIndex((a) => a.id === accountId)
    if (idx < 0) throw new Error(`Unknown account: ${accountId}`)

    const encryptedPassword = password
      ? safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(password).toString('base64')
        : Buffer.from(password, 'utf-8').toString('base64')
      : this.accounts[idx].encryptedPassword

    const updated: StoredAccount = { ...config, id: accountId, encryptedPassword }
    this.accounts[idx] = updated
    this.persist()
    const { encryptedPassword: _unused, ...rest } = updated
    return rest
  }

  remove(accountId: string): void {
    this.accounts = this.accounts.filter((a) => a.id !== accountId)
    this.persist()
  }

  get(accountId: string): AccountConfig | undefined {
    const account = this.accounts.find((a) => a.id === accountId)
    if (!account) return undefined
    const { encryptedPassword, ...rest } = account
    return rest
  }
}
