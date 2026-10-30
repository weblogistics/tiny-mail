import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '../utils/env'

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  const win = new BrowserWindow({
    width: 560,
    height: 480,
    minWidth: 460,
    minHeight: 360,
    show: false,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    settingsWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#settings`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }

  settingsWindow = win
}
