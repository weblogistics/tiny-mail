import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '../utils/env'
import type { ComposeSeed } from '@shared/types'

// Compose windows pull their initial draft via an IPC "get-init" call rather
// than receiving it pushed, so there's no race between window creation and
// the renderer being ready to receive it. Keyed by webContents.id and
// consumed once.
const pendingInit = new Map<number, ComposeSeed>()

export function takeComposeInit(webContentsId: number): ComposeSeed | undefined {
  const seed = pendingInit.get(webContentsId)
  pendingInit.delete(webContentsId)
  return seed
}

let cascadeOffset = 0

export function openComposeWindow(seed: ComposeSeed): void {
  const win = new BrowserWindow({
    width: 640,
    height: 560,
    minWidth: 420,
    minHeight: 320,
    x: 160 + (cascadeOffset % 6) * 24,
    y: 120 + (cascadeOffset % 6) * 24,
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
  cascadeOffset += 1

  pendingInit.set(win.webContents.id, seed)

  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#compose`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'compose' })
  }
}
