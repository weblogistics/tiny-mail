import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'tiny-mail-cache.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS mailboxes (
      accountId TEXT NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      specialUse TEXT,
      unreadCount INTEGER DEFAULT 0,
      totalCount INTEGER DEFAULT 0,
      flags TEXT DEFAULT '[]',
      delimiter TEXT DEFAULT '/',
      PRIMARY KEY (accountId, path)
    );

    CREATE TABLE IF NOT EXISTS messages (
      accountId TEXT NOT NULL,
      mailboxPath TEXT NOT NULL,
      uid INTEGER NOT NULL,
      messageId TEXT,
      subject TEXT,
      fromJson TEXT,
      toJson TEXT,
      ccJson TEXT DEFAULT '[]',
      date TEXT,
      seen INTEGER DEFAULT 0,
      flagged INTEGER DEFAULT 0,
      answered INTEGER DEFAULT 0,
      draft INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      hasAttachments INTEGER DEFAULT 0,
      snippet TEXT,
      PRIMARY KEY (accountId, mailboxPath, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages (accountId, mailboxPath, date DESC);

    CREATE TABLE IF NOT EXISTS message_bodies (
      accountId TEXT NOT NULL,
      mailboxPath TEXT NOT NULL,
      uid INTEGER NOT NULL,
      html TEXT,
      text TEXT,
      attachmentsJson TEXT DEFAULT '[]',
      replyToJson TEXT DEFAULT '[]',
      returnPath TEXT,
      rawHeaders TEXT DEFAULT '',
      PRIMARY KEY (accountId, mailboxPath, uid)
    );

    -- Addresses seen in Inbox/Sent (From/To/Cc), indexed for compose
    -- autocomplete. Global rather than per-account: you might email the
    -- same contact from any of your accounts.
    CREATE TABLE IF NOT EXISTS contacts (
      address TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      lastSeen TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_lastSeen ON contacts (lastSeen DESC);
  `)

  ensureColumn(db, 'messages', 'ccJson', `ALTER TABLE messages ADD COLUMN ccJson TEXT DEFAULT '[]'`)
  ensureColumn(db, 'mailboxes', 'delimiter', `ALTER TABLE mailboxes ADD COLUMN delimiter TEXT DEFAULT '/'`)
  ensureColumn(db, 'message_bodies', 'replyToJson', `ALTER TABLE message_bodies ADD COLUMN replyToJson TEXT DEFAULT '[]'`)
  ensureColumn(db, 'message_bodies', 'returnPath', `ALTER TABLE message_bodies ADD COLUMN returnPath TEXT`)
  ensureColumn(db, 'message_bodies', 'rawHeaders', `ALTER TABLE message_bodies ADD COLUMN rawHeaders TEXT DEFAULT ''`)

  return db
}

// Columns added after the initial release need a migration for anyone
// upgrading from a cache file created before the column existed.
function ensureColumn(db: Database.Database, table: string, column: string, addColumnSql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.some((c) => c.name === column)) {
    db.exec(addColumnSql)
  }
}
