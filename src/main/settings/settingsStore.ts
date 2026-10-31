import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppSettings } from '@shared/types'

const defaults: AppSettings = {
  markAsReadBehavior: 'instant',
  loadRemoteImagesByDefault: false,
  syncMode: 'interval',
  syncIntervalSeconds: 60,
  groupByThread: false
}

export class SettingsStore {
  private filePath: string
  private settings: AppSettings

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'settings.json')
    this.settings = this.load()
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) return { ...defaults }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      return { ...defaults, ...raw }
    } catch {
      return { ...defaults }
    }
  }

  get(): AppSettings {
    return this.settings
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch }
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    return this.settings
  }
}
