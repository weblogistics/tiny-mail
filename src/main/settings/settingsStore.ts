import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppSettings } from '@shared/types'

// The shortest interval offered is 5 minutes — anything more frequent
// belongs to 'push' mode ("As they arrive") instead, which has a live
// connection and costs nothing extra by polling more; a short interval
// value here just means redoing a full sync pass that often; see
// MIN_SYNC_INTERVAL_SECONDS below.
const defaults: AppSettings = {
  markAsReadBehavior: 'instant',
  loadRemoteImagesByDefault: false,
  syncMode: 'interval',
  syncIntervalSeconds: 300,
  groupByThread: false,
  syncLookbackDays: 30,
  theme: 'system'
}

const MIN_SYNC_INTERVAL_SECONDS = 300

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
      const merged: AppSettings = { ...defaults, ...raw }
      // A value saved before the minimum was raised (30s/1min options
      // removed from the UI) would otherwise stick around silently —
      // clamp it up front rather than leaving it sitting below what's
      // selectable until the user happens to touch this setting again.
      if (merged.syncIntervalSeconds < MIN_SYNC_INTERVAL_SECONDS) {
        merged.syncIntervalSeconds = MIN_SYNC_INTERVAL_SECONDS
        writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8')
      }
      return merged
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
