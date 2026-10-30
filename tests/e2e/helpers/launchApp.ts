import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  userDataDir: string
}

export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'tiny-mail-e2e-'))
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: { ...process.env, TINY_MAIL_USER_DATA_DIR: userDataDir }
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  return { app, window, userDataDir }
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  await launched.app.close()
  rmSync(launched.userDataDir, { recursive: true, force: true })
}
