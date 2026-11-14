import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '../utils/env'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 860,
    minHeight: 560,
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

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Without this, a renderer crash (GPU context loss, OOM — both more
  // likely after sitting minimized/backgrounded for a long stretch) leaves
  // the window showing nothing but its backgroundColor forever: Electron
  // doesn't repaint or recover it on its own, and there's no frame/menu to
  // let the user force a reload themselves. Reloading re-runs the
  // renderer's init() (see App.tsx/useMailStore), which re-fetches
  // everything from the main process's own state, so nothing is lost
  // beyond whatever was mid-edit in a compose window (unaffected — it's a
  // separate BrowserWindow).
  const recentCrashes: number[] = []
  const MAX_CRASHES = 3
  const CRASH_WINDOW_MS = 30000
  win.webContents.on('render-process-gone', (_event, details) => {
    // 'clean-exit' is a normal, intentional process exit (e.g. during app
    // shutdown) rather than a crash — reloading in response to it would
    // just fight whatever is already tearing the window down.
    if (details.reason === 'clean-exit') return
    if (win.isDestroyed()) return

    console.error('[main] renderer process gone, reloading', details)
    const now = Date.now()
    while (recentCrashes.length && now - recentCrashes[0] > CRASH_WINDOW_MS) recentCrashes.shift()
    recentCrashes.push(now)
    if (recentCrashes.length > MAX_CRASHES) {
      // Reloading itself keeps triggering the crash (e.g. a GPU driver
      // fault on every launch) — stop digging and leave the blank window
      // rather than spinning a reload loop that pins the CPU.
      console.error('[main] renderer keeps crashing, giving up on auto-reload')
      return
    }
    win.webContents.reload()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
