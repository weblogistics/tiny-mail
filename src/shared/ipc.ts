export const IpcChannels = {
  AccountsList: 'accounts:list',
  AccountsAdd: 'accounts:add',
  AccountsRemove: 'accounts:remove',
  AccountsTestConnection: 'accounts:test-connection',

  MailboxesList: 'mailboxes:list',

  MessagesList: 'messages:list',
  MessagesGetBody: 'messages:get-body',
  MessagesSetFlags: 'messages:set-flags',
  MessagesMove: 'messages:move',
  MessagesDelete: 'messages:delete',
  MessagesSearch: 'messages:search',

  MailSync: 'mail:sync',
  MailGetAttachment: 'mail:get-attachment',

  ComposeSend: 'compose:send',
  ComposeSaveDraft: 'compose:save-draft',
  ComposePickAttachments: 'compose:pick-attachments',
  ComposeOpenWindow: 'compose:open-window',
  ComposeGetInit: 'compose:get-init',

  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggle-maximize',
  WindowClose: 'window:close',

  Events: 'mail:events'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
