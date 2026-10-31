import { app, BrowserWindow } from 'electron'

// Chromium has a built-in "auto dark mode for web content" pass that can
// force-darken a page's painted pixels based on the OS/app theme,
// independently of — and invisibly to — that page's own CSS. It was
// silently fighting the reading pane's own light/dark rendering: toggling
// a message back to "light" updated every CSS value correctly (confirmed
// via computed style) but the message still rendered dark on screen,
// because this pass sits below the CSS layer entirely. Must be set before
// the app is ready.
app.commandLine.appendSwitch('disable-features', 'WebContentsForceDark')
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
  const settingsStore = new SettingsStore()
  imapService = new ImapService(accountStore, broadcast, settingsStore)
  const smtpService = new SmtpService(accountStore)

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
