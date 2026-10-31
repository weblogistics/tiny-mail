import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { TinyMailApi } from '@shared/api'

const api: TinyMailApi = {
  accounts: {
    list: () => ipcRenderer.invoke(IpcChannels.AccountsList),
    add: (config, password) => ipcRenderer.invoke(IpcChannels.AccountsAdd, config, password),
    update: (accountId, config, password) =>
      ipcRenderer.invoke(IpcChannels.AccountsUpdate, accountId, config, password),
    remove: (accountId) => ipcRenderer.invoke(IpcChannels.AccountsRemove, accountId),
    testConnection: (config, password) =>
      ipcRenderer.invoke(IpcChannels.AccountsTestConnection, config, password)
  },
  mailboxes: {
    list: (accountId) => ipcRenderer.invoke(IpcChannels.MailboxesList, accountId),
    create: (accountId, name, parentPath) => ipcRenderer.invoke(IpcChannels.MailboxCreate, accountId, name, parentPath ?? null),
    rename: (accountId, path, newName) => ipcRenderer.invoke(IpcChannels.MailboxRename, accountId, path, newName),
    delete: (accountId, path) => ipcRenderer.invoke(IpcChannels.MailboxDelete, accountId, path),
    empty: (accountId, path) => ipcRenderer.invoke(IpcChannels.MailboxEmpty, accountId, path)
  },
  messages: {
    list: (accountId, mailboxPath) => ipcRenderer.invoke(IpcChannels.MessagesList, accountId, mailboxPath),
    search: (accountId, query) => ipcRenderer.invoke(IpcChannels.MessagesSearch, accountId, query),
    getBody: (accountId, mailboxPath, uid) =>
      ipcRenderer.invoke(IpcChannels.MessagesGetBody, accountId, mailboxPath, uid),
    setFlags: (accountId, mailboxPath, uid, flags) =>
      ipcRenderer.invoke(IpcChannels.MessagesSetFlags, accountId, mailboxPath, uid, flags),
    move: (accountId, mailboxPath, uid, destPath) =>
      ipcRenderer.invoke(IpcChannels.MessagesMove, accountId, mailboxPath, uid, destPath),
    delete: (accountId, mailboxPath, uid) =>
      ipcRenderer.invoke(IpcChannels.MessagesDelete, accountId, mailboxPath, uid)
  },
  mail: {
    sync: (accountId, mailboxPath) => ipcRenderer.invoke(IpcChannels.MailSync, accountId, mailboxPath),
    openAttachment: (accountId, mailboxPath, uid, partId) =>
      ipcRenderer.invoke(IpcChannels.MailOpenAttachment, accountId, mailboxPath, uid, partId),
    saveAttachment: (accountId, mailboxPath, uid, partId) =>
      ipcRenderer.invoke(IpcChannels.MailSaveAttachment, accountId, mailboxPath, uid, partId)
  },
  compose: {
    send: (draft) => ipcRenderer.invoke(IpcChannels.ComposeSend, draft),
    saveDraft: (draft) => ipcRenderer.invoke(IpcChannels.ComposeSaveDraft, draft),
    pickAttachments: () => ipcRenderer.invoke(IpcChannels.ComposePickAttachments),
    openWindow: (seed) => ipcRenderer.invoke(IpcChannels.ComposeOpenWindow, seed),
    getInit: () => ipcRenderer.invoke(IpcChannels.ComposeGetInit)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.SettingsGet),
    update: (patch) => ipcRenderer.invoke(IpcChannels.SettingsUpdate, patch),
    openWindow: () => ipcRenderer.invoke(IpcChannels.SettingsOpenWindow)
  },
  addressBook: {
    search: (query) => ipcRenderer.invoke(IpcChannels.AddressBookSearch, query)
  },
  events: {
    subscribe: (listener) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
        listener(payload as Parameters<typeof listener>[0])
      ipcRenderer.on(IpcChannels.Events, handler)
      return () => ipcRenderer.removeListener(IpcChannels.Events, handler)
    }
  },
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.WindowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IpcChannels.WindowToggleMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.WindowClose)
  }
}

contextBridge.exposeInMainWorld('api', api)
