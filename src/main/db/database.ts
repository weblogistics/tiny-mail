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
      PRIMARY KEY (accountId, mailboxPath, uid)
    );
  `)

  return db
}
