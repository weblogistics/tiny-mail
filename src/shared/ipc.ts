export const IpcChannels = {
  AccountsList: 'accounts:list',
  AccountsAdd: 'accounts:add',
  AccountsUpdate: 'accounts:update',
  AccountsRemove: 'accounts:remove',
  AccountsTestConnection: 'accounts:test-connection',

  MailboxesList: 'mailboxes:list',
  MailboxCreate: 'mailboxes:create',
  MailboxRename: 'mailboxes:rename',
  MailboxDelete: 'mailboxes:delete',
  MailboxEmpty: 'mailboxes:empty',

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

  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  SettingsOpenWindow: 'settings:open-window',

  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggle-maximize',
  WindowClose: 'window:close',

  Events: 'mail:events'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
