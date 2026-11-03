import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import { ImapFlow } from 'imapflow'
import { statSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { basename, join } from 'path'
import mime from 'mime-types'
import { IpcChannels } from '@shared/ipc'
import type {
  AccountConfig,
  AppSettings,
  ComposeDraft,
  ComposeSeed,
  MailEventPayload,
  MessageSummary,
  SearchOptions
} from '@shared/types'
import type { AccountStore } from '../accounts/accountStore'
import { resolveImapTls, type ImapService } from '../imap/imapService'
import { resolveMailboxRole } from '@shared/resolveMailboxRole'
import type { SettingsStore } from '../settings/settingsStore'
import { verifySmtpConfig, type SmtpService } from '../smtp/smtpService'
import { searchMessages } from '../db/messageCache'
import { searchContacts } from '../db/contactsStore'
import { openComposeWindow, takeComposeInit } from '../windows/composeWindow'
import { openSettingsWindow } from '../windows/settingsWindow'

export function broadcast(payload: MailEventPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.Events, payload)
  }
}

export function registerIpcHandlers(
  accountStore: AccountStore,
  imapService: ImapService,
  smtpService: SmtpService,
  settingsStore: SettingsStore
): void {
  ipcMain.handle(IpcChannels.AccountsList, () => accountStore.list())

  ipcMain.handle(
    IpcChannels.AccountsAdd,
    async (_e, config: Omit<AccountConfig, 'id'>, password: string) => {
      const account = accountStore.add(config, password)
      try {
        await imapService.listMailboxes(account.id)
      } catch {
        // Account is saved even if the first connection attempt fails; the
        // user can retry from the UI once credentials/network are sorted.
      }
      broadcast({ type: 'accounts-changed', data: null })
      return account
    }
  )

  ipcMain.handle(
    IpcChannels.AccountsUpdate,
    (_e, accountId: string, config: Omit<AccountConfig, 'id'>, password?: string) => {
      const account = accountStore.update(accountId, config, password)
      broadcast({ type: 'accounts-changed', data: null })
      return account
    }
  )

  ipcMain.handle(IpcChannels.AccountsRemove, (_e, accountId: string) => {
    accountStore.remove(accountId)
    broadcast({ type: 'accounts-changed', data: null })
  })

  ipcMain.handle(
    IpcChannels.AccountsTestConnection,
    async (_e, config: Omit<AccountConfig, 'id'>, password: string) => {
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        ...resolveImapTls(config.imapSecurity),
        auth: { user: config.username, pass: password },
        logger: false,
        connectionTimeout: 15000
      })
      let imapResult: { ok: true } | { ok: false; error: string }
      try {
        await client.connect()
        await client.logout()
        imapResult = { ok: true }
      } catch (err) {
        imapResult = { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
      if (!imapResult.ok) return { ok: false as const, error: `IMAP: ${imapResult.error}` }

      const smtpResult = await verifySmtpConfig(config, password)
      if (!smtpResult.ok) return { ok: false as const, error: `SMTP: ${smtpResult.error}` }

      return { ok: true as const }
    }
  )

  ipcMain.handle(IpcChannels.MailboxesList, async (_e, accountId: string) => {
    const cached = imapService.getCachedMailboxes(accountId)
    // Return cached immediately; refresh from the server in the background.
    imapService
      .listMailboxes(accountId)
      .then((fresh) => fresh.forEach((mb) => broadcast({ type: 'mailbox-updated', data: mb })))
      .catch(() => void 0)
    return cached
  })

  ipcMain.handle(
    IpcChannels.MailboxCreate,
    async (_e, accountId: string, name: string, parentPath: string | null) => {
      await imapService.createMailbox(accountId, name, parentPath)
    }
  )

  ipcMain.handle(IpcChannels.MailboxRename, async (_e, accountId: string, path: string, newName: string) => {
    await imapService.renameMailbox(accountId, path, newName)
  })

  ipcMain.handle(IpcChannels.MailboxDelete, async (_e, accountId: string, path: string) => {
    await imapService.deleteMailbox(accountId, path)
  })

  ipcMain.handle(IpcChannels.MailboxEmpty, async (_e, accountId: string, path: string) => {
    await imapService.emptyMailbox(accountId, path)
  })

  ipcMain.handle(IpcChannels.MessagesList, (_e, accountId: string, mailboxPath: string) => {
    return imapService.getCachedMessages(accountId, mailboxPath)
  })

  ipcMain.handle(
    IpcChannels.MessagesSearch,
    (_e, accountId: string, query: string, options: SearchOptions): MessageSummary[] => {
      return searchMessages(accountId, query, options)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesSearchServer,
    async (_e, accountId: string, query: string, options: SearchOptions): Promise<MessageSummary[]> => {
      return imapService.searchServer(accountId, query, options)
    }
  )

  ipcMain.handle(IpcChannels.MailSync, async (_e, accountId: string, mailboxPath: string) => {
    try {
      await imapService.syncMailbox(accountId, mailboxPath)
    } catch (err) {
      console.error('[mail:sync] failed', accountId, mailboxPath, err)
      throw err
    }
  })

  ipcMain.handle(
    IpcChannels.MessagesGetBody,
    async (_e, accountId: string, mailboxPath: string, uid: number) => {
      return imapService.getMessageBody(accountId, mailboxPath, uid)
    }
  )

  // Mirrors how a real mail client handles double-clicking an attachment:
  // drop a copy in a scratch directory and hand it to the OS's own default
  // app for that file type, rather than showing our own viewer.
  ipcMain.handle(
    IpcChannels.MailOpenAttachment,
    async (_e, accountId: string, mailboxPath: string, uid: number, partId: string) => {
      const { filename, content } = await imapService.getAttachmentContent(accountId, mailboxPath, uid, partId)
      const safeName = filename.replace(/[/\\?%*:|"<>]/g, '_')
      const dir = join(app.getPath('temp'), 'tiny-mail-attachments', accountId, String(uid))
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const filePath = join(dir, safeName)
      writeFileSync(filePath, content)
      const openError = await shell.openPath(filePath)
      if (openError) throw new Error(openError)
    }
  )

  ipcMain.handle(
    IpcChannels.MailSaveAttachment,
    async (e, accountId: string, mailboxPath: string, uid: number, partId: string) => {
      const { filename, content } = await imapService.getAttachmentContent(accountId, mailboxPath, uid, partId)
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = win
        ? await dialog.showSaveDialog(win, { defaultPath: filename })
        : await dialog.showSaveDialog({ defaultPath: filename })
      if (result.canceled || !result.filePath) return
      writeFileSync(result.filePath, content)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesSetFlags,
    async (_e, accountId: string, mailboxPath: string, uid: number, flags: Partial<MessageSummary['flags']>) => {
      await imapService.setFlags(accountId, mailboxPath, uid, flags)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesMove,
    async (_e, accountId: string, mailboxPath: string, uid: number, destPath: string) => {
      try {
        await imapService.moveMessage(accountId, mailboxPath, uid, destPath)
      } catch (err) {
        console.error('[messages:move] failed', { accountId, mailboxPath, uid, destPath }, err)
        throw err
      }
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesDelete,
    async (_e, accountId: string, mailboxPath: string, uid: number) => {
      await imapService.deleteMessage(accountId, mailboxPath, uid)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesBulkSetFlags,
    async (_e, accountId: string, mailboxPath: string, uids: number[], flags: Partial<MessageSummary['flags']>) => {
      await imapService.setFlagsMany(accountId, mailboxPath, uids, flags)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesBulkMove,
    async (_e, accountId: string, mailboxPath: string, uids: number[], destPath: string) => {
      try {
        await imapService.moveMessages(accountId, mailboxPath, uids, destPath)
      } catch (err) {
        console.error('[messages:bulk-move] failed', { accountId, mailboxPath, count: uids.length, destPath }, err)
        throw err
      }
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesBulkDelete,
    async (_e, accountId: string, mailboxPath: string, uids: number[]) => {
      await imapService.deleteMessages(accountId, mailboxPath, uids)
    }
  )

  ipcMain.handle(IpcChannels.ComposeSend, async (_e, draft: ComposeDraft) => {
    await smtpService.send(draft)

    // Most SMTP servers don't automatically save a copy of what they relay,
    // so (like every real mail client) we append one to Sent ourselves.
    try {
      const mailboxes = imapService.getCachedMailboxes(draft.accountId)
      const overrides = accountStore.get(draft.accountId)?.mailboxRoleOverrides
      const sentBox = resolveMailboxRole(mailboxes, 'Sent', overrides?.Sent)?.path ?? 'Sent'
      const raw = await smtpService.buildMime(draft)
      await imapService.appendMessage(draft.accountId, sentBox, raw, ['\\Seen'])
    } catch (err) {
      // The message was already sent successfully; failing to file the Sent
      // copy shouldn't be reported to the user as a failed send.
      console.error('[compose:send] failed to save Sent copy', err)
    }
  })

  ipcMain.handle(IpcChannels.ComposeSaveDraft, async (_e, draft: ComposeDraft) => {
    const mailboxes = imapService.getCachedMailboxes(draft.accountId)
    const overrides = accountStore.get(draft.accountId)?.mailboxRoleOverrides
    const draftsBox = resolveMailboxRole(mailboxes, 'Drafts', overrides?.Drafts)?.path ?? 'Drafts'
    const raw = await smtpService.buildMime(draft)
    await imapService.appendMessage(draft.accountId, draftsBox, raw, ['\\Draft'])
  })

  ipcMain.handle(IpcChannels.ComposeOpenWindow, (_e, seed: ComposeSeed) => {
    openComposeWindow(seed)
  })

  ipcMain.handle(IpcChannels.ComposeGetInit, (e) => {
    return takeComposeInit(e.sender.id)
  })

  ipcMain.handle(IpcChannels.ComposePickAttachments, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return result.filePaths.map((path) => ({
      filename: basename(path),
      path,
      contentType: mime.lookup(path) || 'application/octet-stream',
      size: statSync(path).size
    }))
  })

  ipcMain.handle(IpcChannels.SettingsGet, () => settingsStore.get())

  ipcMain.handle(IpcChannels.SettingsUpdate, (_e, patch: Partial<AppSettings>) => {
    const updated = settingsStore.update(patch)
    broadcast({ type: 'settings-updated', data: updated })
    return updated
  })

  ipcMain.handle(IpcChannels.SettingsOpenWindow, () => {
    openSettingsWindow()
  })

  ipcMain.handle(IpcChannels.AddressBookSearch, (_e, query: string) => {
    return searchContacts(query)
  })

  ipcMain.handle(IpcChannels.WindowMinimize, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle(IpcChannels.WindowToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IpcChannels.WindowClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
