import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { AccountConfig } from '@shared/types'

interface StoredAccount extends AccountConfig {
  encryptedPassword: string // base64
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
      this.accounts = JSON.parse(raw)
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
