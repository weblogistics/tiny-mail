import { ipcMain, BrowserWindow, dialog } from 'electron'
import { ImapFlow } from 'imapflow'
import { statSync } from 'fs'
import { basename } from 'path'
import mime from 'mime-types'
import { IpcChannels } from '@shared/ipc'
import type { AccountConfig, ComposeDraft, ComposeSeed, MailEventPayload, MessageSummary } from '@shared/types'
import type { AccountStore } from '../accounts/accountStore'
import type { ImapService } from '../imap/imapService'
import { verifySmtpConfig, type SmtpService } from '../smtp/smtpService'
import { searchMessages } from '../db/messageCache'
import { openComposeWindow, takeComposeInit } from '../windows/composeWindow'

export function broadcast(payload: MailEventPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.Events, payload)
  }
}

export function registerIpcHandlers(
  accountStore: AccountStore,
  imapService: ImapService,
  smtpService: SmtpService
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
      return account
    }
  )

  ipcMain.handle(IpcChannels.AccountsRemove, (_e, accountId: string) => {
    accountStore.remove(accountId)
  })

  ipcMain.handle(
    IpcChannels.AccountsTestConnection,
    async (_e, config: Omit<AccountConfig, 'id'>, password: string) => {
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: { user: config.username, pass: password },
        logger: false
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

  ipcMain.handle(IpcChannels.MessagesList, (_e, accountId: string, mailboxPath: string) => {
    return imapService.getCachedMessages(accountId, mailboxPath)
  })

  ipcMain.handle(IpcChannels.MessagesSearch, (_e, accountId: string, query: string): MessageSummary[] => {
    return searchMessages(accountId, query)
  })

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

  ipcMain.handle(
    IpcChannels.MessagesSetFlags,
    async (_e, accountId: string, mailboxPath: string, uid: number, flags: Partial<MessageSummary['flags']>) => {
      await imapService.setFlags(accountId, mailboxPath, uid, flags)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesMove,
    async (_e, accountId: string, mailboxPath: string, uid: number, destPath: string) => {
      await imapService.moveMessage(accountId, mailboxPath, uid, destPath)
    }
  )

  ipcMain.handle(
    IpcChannels.MessagesDelete,
    async (_e, accountId: string, mailboxPath: string, uid: number) => {
      await imapService.deleteMessage(accountId, mailboxPath, uid)
    }
  )

  ipcMain.handle(IpcChannels.ComposeSend, async (_e, draft: ComposeDraft) => {
    await smtpService.send(draft)

    // Most SMTP servers don't automatically save a copy of what they relay,
    // so (like every real mail client) we append one to Sent ourselves.
    try {
      const mailboxes = imapService.getCachedMailboxes(draft.accountId)
      const sentBox = mailboxes.find((m) => m.specialUse === 'Sent')?.path ?? 'Sent'
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
    const draftsBox = mailboxes.find((m) => m.specialUse === 'Drafts')?.path ?? 'Drafts'
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
