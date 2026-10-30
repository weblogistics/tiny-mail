import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { AccountStore } from './accounts/accountStore'
import { ImapService } from './imap/imapService'
import { SmtpService } from './smtp/smtpService'
import { SettingsStore } from './settings/settingsStore'
import { registerIpcHandlers, broadcast } from './ipc/registerIpcHandlers'

app.setName('Tiny Mail')

// Lets automated tests (and anyone else) run against a throwaway profile
// instead of the real accounts.json / sqlite cache in userData.
if (process.env.TINY_MAIL_USER_DATA_DIR) {
  app.setPath('userData', process.env.TINY_MAIL_USER_DATA_DIR)
}

let imapService: ImapService

async function bootstrap(): Promise<void> {
  const accountStore = new AccountStore()
  imapService = new ImapService(accountStore, broadcast)
  const smtpService = new SmtpService(accountStore)
  const settingsStore = new SettingsStore()

  registerIpcHandlers(accountStore, imapService, smtpService, settingsStore)
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  imapService?.disconnectAll().catch(() => void 0)
})
