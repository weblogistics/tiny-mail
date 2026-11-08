import { ImapFlow, type ExistsEvent, type MailboxObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { AccountStore } from '../accounts/accountStore'
import type { SettingsStore } from '../settings/settingsStore'
import {
  clearMailboxMessages,
  getMessageBody,
  listMailboxes as cachedListMailboxes,
  listMessages as cachedListMessages,
  removeMailbox as removeCachedMailbox,
  removeMessage,
  saveMessageBody,
  setMessageFlags,
  upsertMailbox,
  upsertMessage
} from '../db/messageCache'
import { analyzeBodyStructure, extractBodyParts } from './bodyStructure'
import { resolveInlineImages, type InlineImage } from './inlineImageResolver'
import { indexContactsFromMessage } from '../db/contactsStore'
import type {
  ConnectionSecurity,
  MailboxSummary,
  MailEventPayload,
  MessageAddress,
  MessageAttachment,
  MessageBody,
  MessageSummary,
  SearchOptions,
  SpecialUse
} from '@shared/types'

type Emit = (payload: MailEventPayload) => void

// A message can vanish from the server between our last sync and the moment
// its body is requested — deleted or filed away from a phone or webmail.
// ImapFlow resolves download() to an empty object in that case, and the
// resulting undefined stream used to reach simpleParser as the opaque
// "Input cannot be null or undefined", which surfaced in the UI as a message
// that simply rendered blank forever. Thrown as a plain Error carrying a
// stable code because an Error subclass doesn't survive IPC serialization
// into the renderer — only its message does.
export const MESSAGE_GONE_CODE = 'TINY_MAIL_MESSAGE_GONE'

export function resolveImapTls(security: ConnectionSecurity): {
  secure: boolean
  doSTARTTLS: boolean
} {
  if (security === 'ssl') return { secure: true, doSTARTTLS: false }
  if (security === 'starttls') return { secure: false, doSTARTTLS: true }
  return { secure: false, doSTARTTLS: false }
}

const SPECIAL_USE_MAP: Record<string, SpecialUse> = {
  '\\Inbox': 'Inbox',
  '\\Sent': 'Sent',
  '\\Drafts': 'Drafts',
  '\\Trash': 'Trash',
  '\\Junk': 'Junk',
  '\\Archive': 'Archive'
}

// Inbox/Archive/Sent/Drafts are overwhelmingly the most likely place a
// search match lives; everything else (often dozens of per-sender filing
// folders on a real account) is scanned only as time allows, in whatever
// order the server listed it.
const MAILBOX_SEARCH_PRIORITY: Record<string, number> = {
  Inbox: 0,
  Archive: 1,
  Sent: 2,
  Drafts: 3
}

function toAddresses(list?: { name?: string; address?: string }[]): MessageAddress[] {
  if (!list) return []
  return list.map((a) => ({ name: a.name || '', address: a.address || '' }))
}

// mailparser parses Return-Path the same way as From/Reply-To, but — unlike
// those — never collapses a repeated header down to a single value, since a
// forwarded/relayed message can legitimately carry more than one. The first
// occurrence is the one the receiving server itself stamped on accepting
// the message, which is what makes it a meaningfully different signal from
// From (attacker-controlled) or Reply-To (also attacker-controlled).
function extractReturnPath(headers: Map<string, unknown>): string | null {
  const raw = headers.get('return-path')
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : []
  const first = entries[0] as { value?: { address?: string }[] } | undefined
  return first?.value?.[0]?.address || null
}

// Same intent as extractReturnPath above, but against the raw header block
// text directly (what the selective-fetch body path has) rather than
// mailparser's already-structured headers Map. Return-Path is always a
// single bare address in angle brackets (or an empty "<>" for a bounce) —
// no display name, no encoding — so a direct regex is reliable here in a
// way it wouldn't be for a header like From that needs real address
// parsing.
function extractReturnPathFromRaw(rawHeaders: string): string | null {
  const match = rawHeaders.match(/^Return-Path:\s*<([^>]*)>/im)
  return match && match[1] ? match[1] : null
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

// Many self-hosted/smaller IMAP servers don't advertise RFC 6154 SPECIAL-USE
// flags, so fall back to recognizing common folder names.
const NAME_FALLBACK_PATTERNS: [RegExp, SpecialUse][] = [
  [/^inbox$/i, 'Inbox'],
  [/^(sent|sent items|sent mail|sent messages)$/i, 'Sent'],
  [/^(drafts?)$/i, 'Drafts'],
  [/^(trash|deleted items|deleted messages)$/i, 'Trash'],
  [/^(junk|spam|bulk mail)$/i, 'Junk'],
  [/^(archive|all mail)$/i, 'Archive']
]

function inferSpecialUseFromName(name: string): SpecialUse {
  for (const [pattern, use] of NAME_FALLBACK_PATTERNS) {
    if (pattern.test(name)) return use
  }
  return null
}

export class ImapService {
  private clients = new Map<string, ImapFlow>()
  // Guards against piling up overlapping syncMailbox() calls when the
  // server's 'exists' push notification (new mail arriving) fires again
  // before a previous resync has finished — queues at most one follow-up
  // run rather than letting them stack.
  private syncing = new Map<string, Promise<void>>()
  private pendingResync = new Set<string>()

  constructor(
    private accountStore: AccountStore,
    private emit: Emit,
    private settingsStore: SettingsStore
  ) {}

  // ImapFlow auto-enters IMAP IDLE on the connection's currently selected
  // mailbox whenever it's been quiet for a bit (autoIdleDelay, 15s by
  // default) and breaks it transparently the moment another command is
  // issued — that's what makes "listen for push notifications while also
  // issuing normal commands" safe here, unlike the earlier deadlock bug
  // (which was from manually overlapping two *explicit* commands on a
  // connection, not from IDLE itself). Wiring this costs nothing when the
  // server never pushes anything, so it's always on rather than gated by
  // a "push mode" setting — the setting instead controls whether the
  // renderer's own poll timer runs (see App.tsx), since IDLE only covers
  // whichever single mailbox is currently selected per account, not every
  // folder at once.
  private watchForNewMail(accountId: string, client: ImapFlow): void {
    client.on('exists', (data: ExistsEvent) => {
      if (data.count > data.prevCount) {
        this.triggerResync(accountId, data.path)
      }
    })
  }

  private triggerResync(accountId: string, mailboxPath: string): void {
    const key = `${accountId}::${mailboxPath}`
    if (this.syncing.has(key)) {
      // Already syncing (from this notification or anything else) — that
      // in-flight pass may have already read past the UID that just
      // arrived, so piggybacking on it isn't enough; queue exactly one
      // fresh follow-up run for once it finishes instead.
      this.pendingResync.add(key)
      return
    }
    this.syncMailbox(accountId, mailboxPath)
      .catch((err) => console.error('[imap] push-triggered resync failed', accountId, mailboxPath, err))
      .finally(() => {
        if (this.pendingResync.delete(key)) this.triggerResync(accountId, mailboxPath)
      })
  }

  private async getClient(accountId: string): Promise<ImapFlow> {
    const existing = this.clients.get(accountId)
    if (existing && existing.usable) {
      // Re-asserts 'online' on every reuse, not just the original connect —
      // belt-and-braces against the status bar getting stuck on a stale
      // 'error' from an earlier transient blip that ImapFlow itself
      // recovered from (the connection is usable right now, by definition,
      // so whatever set 'error' no longer reflects reality). Cheap: this
      // runs on every IMAP operation, but setting state to its own value is
      // a no-op in the renderer.
      this.emit({ type: 'account-status', data: { accountId, status: 'online' } })
      return existing
    }

    const account = this.accountStore.get(accountId)
    if (!account) throw new Error(`Unknown account: ${accountId}`)
    const password = this.accountStore.getPassword(accountId)

    this.emit({ type: 'account-status', data: { accountId, status: 'connecting' } })

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      ...resolveImapTls(account.imapSecurity),
      auth: { user: account.username, pass: password },
      logger: false,
      // ImapFlow's default is 90s, which makes a misconfigured host/port
      // feel like the app has hung instead of reporting an error.
      connectionTimeout: 15000
    })

    client.on('error', (err: Error) => {
      this.emit({ type: 'account-status', data: { accountId, status: 'error', error: err.message } })
    })

    try {
      await client.connect()
    } catch (err) {
      this.emit({
        type: 'account-status',
        data: { accountId, status: 'error', error: err instanceof Error ? err.message : String(err) }
      })
      throw err
    }

    this.emit({ type: 'account-status', data: { accountId, status: 'online' } })
    this.clients.set(accountId, client)
    this.watchForNewMail(accountId, client)
    return client
  }

  async testConnection(accountId: string): Promise<void> {
    const client = await this.getClient(accountId)
    await client.noop()
  }

  async listMailboxes(accountId: string): Promise<MailboxSummary[]> {
    const client = await this.getClient(accountId)
    const list = await client.list()

    const summaries: MailboxSummary[] = []
    for (const mailbox of list) {
      const specialUseRaw = (mailbox.specialUse || '') as string
      const fromServerFlag = SPECIAL_USE_MAP[specialUseRaw] ?? (mailbox.flags?.has('\\Inbox') ? 'Inbox' : null)
      const specialUse = fromServerFlag ?? inferSpecialUseFromName(mailbox.name)

      let unreadCount = 0
      let totalCount = 0
      try {
        const status = await client.status(mailbox.path, { messages: true, unseen: true })
        unreadCount = status.unseen ?? 0
        totalCount = status.messages ?? 0
      } catch {
        // Some servers refuse STATUS on \Noselect mailboxes; leave counts at 0.
      }

      const summary: MailboxSummary = {
        accountId,
        path: mailbox.path,
        name: mailbox.name,
        specialUse,
        specialUseFromServer: fromServerFlag != null,
        unreadCount,
        totalCount,
        flags: Array.from(mailbox.flags ?? []),
        delimiter: mailbox.delimiter || '/'
      }
      summaries.push(summary)
      upsertMailbox(summary)
    }
    return summaries
  }

  getCachedMailboxes(accountId: string): MailboxSummary[] {
    return cachedListMailboxes(accountId)
  }

  getCachedMessages(accountId: string, mailboxPath: string): MessageSummary[] {
    return cachedListMessages(accountId, mailboxPath)
  }

  // sinceDaysOverride lets a caller bypass the user's saved "how far back to
  // sync" setting (settingsStore.syncLookbackDays); normal syncs always read
  // the live setting instead, so changing it takes effect on the very next
  // sync without an app restart.
  //
  // Several independent things can all ask to sync the same mailbox around
  // the same time — the renderer's periodic poll timer, selecting the
  // mailbox, the "Get Mail" button, and IMAP's own push notification (see
  // triggerResync) — and a sync's own duration isn't bounded: a mailbox
  // with a large backlog (a first-ever sync, or one that just grew a lot,
  // e.g. after the "always include unread regardless of age" fix made
  // Phase 1 cover far more UIDs for an account with thousands of old
  // unread messages) can easily take longer than the poll interval. Without
  // this guard, each of those triggers started its own full pass
  // independently, so a slow mailbox accumulated an ever-growing pile of
  // overlapping redundant syncs — each repeating the same SEARCH and
  // re-upserting the same rows — which is exactly what sustained high CPU
  // usage with no visible progress looks like. Now a request made while
  // this mailbox is already syncing just piggybacks on that same in-flight
  // run instead of starting a second one.
  async syncMailbox(accountId: string, mailboxPath: string, sinceDaysOverride?: number): Promise<void> {
    const syncKey = `${accountId}::${mailboxPath}`
    const inFlight = this.syncing.get(syncKey)
    if (inFlight) return inFlight

    const run = this.runMailboxSync(accountId, mailboxPath, sinceDaysOverride).finally(() => {
      this.syncing.delete(syncKey)
    })
    this.syncing.set(syncKey, run)
    run.then(
      () => {
        // Fire-and-forget, after the sync's own mailbox lock is released
        // (runMailboxSync's finally already ran by the time this promise
        // settles) so prefetching interleaves fairly with anything else
        // waiting on the same connection instead of extending the window
        // where the mailbox looks "still syncing".
        this.prefetchRecentBodies(accountId, mailboxPath).catch((err) =>
          console.error('[imap] body prefetch failed', accountId, mailboxPath, err)
        )
      },
      () => void 0 // sync itself failed — nothing to prefetch from a run that didn't complete
    )
    return run
  }

  // Downloads and caches bodies for the most recently dated messages in a
  // mailbox that don't have one cached yet, so opening one of them feels
  // instant instead of paying a real IMAP round trip (or two, for a message
  // with inline images) at the moment the user actually clicks it. Runs
  // after every sync of a mailbox — cheap on repeat runs, since
  // getMessageBody's own on-disk cache check makes an already-prefetched
  // message an immediate no-op rather than a real fetch.
  private async prefetchRecentBodies(accountId: string, mailboxPath: string, limit = 30): Promise<void> {
    const recent = cachedListMessages(accountId, mailboxPath)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit)

    for (const m of recent) {
      try {
        await this.getMessageBody(accountId, mailboxPath, m.uid)
      } catch {
        // A message that vanished, or any other one-off fetch failure,
        // shouldn't stop the rest of the batch from prefetching.
      }
    }
  }

  private async runMailboxSync(accountId: string, mailboxPath: string, sinceDaysOverride?: number): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const mailbox = client.mailbox as MailboxObject
      const totalInMailbox = mailbox.exists
      if (totalInMailbox === 0) {
        this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched: 0, total: 0, done: true } })
        return
      }

      const sinceDays = sinceDaysOverride ?? this.settingsStore.get().syncLookbackDays
      // 0 means "All Mail": no date cutoff, fetch everything in the mailbox.
      // Otherwise resolve the cutoff to a concrete UID set via SEARCH SINCE
      // first (rather than handing the Date straight to fetch()) so `total`
      // below reflects how many messages this sync actually covers, not the
      // mailbox's full size.
      let range: string | number[]
      let total: number
      let useUid: boolean
      // Scopes the deletion-reconciliation below: with a lookback window, a
      // cached message can legitimately be older than this sync's own
      // SEARCH SINCE cutoff (synced earlier under a longer-window setting,
      // say) without actually having been deleted — only cached messages
      // that fall *inside* the window this sync actually queried (by date,
      // or because they were unread — see the unread SEARCH above) can be
      // trusted to appear in the results if they still exist on the server.
      // null means "All Mail": every cached message for this mailbox is in
      // scope, since '1:*' below covers the whole thing.
      let cutoffDate: Date | null = null
      if (sinceDays > 0) {
        cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - sinceDays)
        const [withinWindow, unread] = await Promise.all([
          client.search({ since: cutoffDate }, { uid: true }),
          // Unread messages are always included regardless of age: the
          // mailbox's unread badge comes from the server's STATUS, unrelated
          // to this lookback window, so without this a folder with no
          // recent mail could show a real unread count in the sidebar while
          // actually being empty once opened — exactly the "folder shows
          // unread but there's nothing there" bug this fixes.
          client.search({ seen: false }, { uid: true })
        ])
        const uids = Array.from(new Set([...(withinWindow || []), ...(unread || [])]))
        if (uids.length === 0) {
          this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched: 0, total: 0, done: true } })
          return
        }
        range = uids
        total = uids.length
        useUid = true
      } else {
        range = '1:*'
        total = totalInMailbox
        useUid = false
      }

      // Only Inbox/Sent feed the compose autocomplete address book — other
      // folders (drafts, trash, mailing-list archives) would pollute it
      // with addresses that aren't real correspondents.
      const specialUse = cachedListMailboxes(accountId).find((m) => m.path === mailboxPath)?.specialUse
      const indexContacts = specialUse === 'Inbox' || specialUse === 'Sent'

      // A message's content (and so its snippet) never changes once fetched,
      // only its flags do. Re-downloading every snippet on every sync/poll
      // was both wasteful and, worse, visibly clobbered the cached preview
      // text with '' for an instant before refilling it — the "list flashes
      // blank then repopulates" bug. So: look up what's cached first, keep
      // an existing snippet as-is, and only fetch one for messages that
      // don't have one yet.
      const existingByUid = new Map(cachedListMessages(accountId, mailboxPath).map((m) => [m.uid, m]))

      // Phase 1: drain the FETCH command fully before issuing any other
      // command on this connection. ImapFlow serializes commands on a
      // connection, so calling client.download() mid-iteration here would
      // queue behind this still-open FETCH and deadlock forever (fetch is
      // waiting to be iterated further, download is waiting for fetch to
      // finish) with no error or timeout.
      interface PendingMessage {
        uid: number
        summary: MessageSummary
        snippetPartId: string | null
      }
      const pending: PendingMessage[] = []
      const seenUids = new Set<number>()

      for await (const msg of client.fetch(
        range,
        { envelope: true, flags: true, bodyStructure: true, uid: true },
        { uid: useUid }
      )) {
        seenUids.add(msg.uid)
        const { hasAttachments, snippetPartId } = analyzeBodyStructure(msg.bodyStructure as never)
        const existing = existingByUid.get(msg.uid)
        const summary: MessageSummary = {
          accountId,
          mailboxPath,
          uid: msg.uid,
          messageId: msg.envelope?.messageId || '',
          subject: msg.envelope?.subject || '(no subject)',
          from: toAddresses(msg.envelope?.from),
          to: toAddresses(msg.envelope?.to),
          cc: toAddresses(msg.envelope?.cc),
          date: (msg.envelope?.date || new Date()).toISOString(),
          flags: {
            seen: msg.flags?.has('\\Seen') ?? false,
            flagged: msg.flags?.has('\\Flagged') ?? false,
            answered: msg.flags?.has('\\Answered') ?? false,
            draft: msg.flags?.has('\\Draft') ?? false,
            deleted: msg.flags?.has('\\Deleted') ?? false
          },
          hasAttachments,
          snippet: existing?.snippet ?? ''
        }
        if (!existing || !existing.snippet) {
          pending.push({ uid: msg.uid, summary, snippetPartId })
        }
        upsertMessage(summary)
        if (indexContacts) indexContactsFromMessage(summary)
      }

      // A message deleted or moved elsewhere (another device, webmail,
      // another client entirely) never shows up again in this FETCH —
      // nothing fails, it's just silently absent — so without comparing
      // against what's cached, deletion from elsewhere went undetected
      // until the moment someone happened to open that exact message (see
      // downloadAndParse's MESSAGE_GONE_CODE handling), which is exactly
      // the "doesn't seem to work all the time" gap. Covers push-triggered
      // and interval syncs too, since they all funnel through this method.
      for (const existing of existingByUid.values()) {
        if (cutoffDate && new Date(existing.date) < cutoffDate && existing.flags.seen) continue
        if (!seenUids.has(existing.uid)) {
          removeMessage(accountId, mailboxPath, existing.uid)
          this.emit({ type: 'message-removed', data: { accountId, mailboxPath, uid: existing.uid } })
        }
      }

      // Phase 2: the FETCH command is closed now, so it's safe to issue
      // DOWNLOAD commands on the same connection to backfill snippets —
      // only for messages that didn't already have one cached.
      let fetched = 0
      for (const item of pending) {
        if (item.snippetPartId) {
          try {
            const { content } = await client.download(String(item.uid), item.snippetPartId, {
              uid: true,
              maxBytes: 2000
            })
            const chunks: Buffer[] = []
            for await (const chunk of content) chunks.push(chunk as Buffer)
            item.summary.snippet = Buffer.concat(chunks)
              .toString('utf-8')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 220)
            upsertMessage(item.summary)
          } catch {
            // Leave snippet blank; the message itself synced fine.
          }
        }
        fetched += 1
        this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched, total, done: false } })
      }

      this.emit({ type: 'sync-progress', data: { accountId, mailboxPath, fetched: pending.length, total, done: true } })
    } finally {
      lock.release()
    }
  }

  // Local search (messageCache.searchMessages) only covers whatever's
  // already synced — which is limited to the configured lookback window — so
  // older mail that still exists on the server wouldn't turn up. This runs a
  // real IMAP SEARCH across selectable mailboxes instead, and upserts
  // whatever it finds into the cache so those messages become fully usable
  // (open, flag, move...) immediately, the same as anything synced normally.
  //
  // options.mailboxPath, when set, searches only that one folder — in that
  // case the time budget is generous (there's only one folder to search,
  // body-search included, however slow IMAP BODY search is per-folder).
  // Left null ("All Mailboxes"), every selectable mailbox is scanned in
  // priority order (see MAILBOX_SEARCH_PRIORITY) under a tighter budget —
  // one real account here has 68 folders, and an unscoped IMAP BODY search
  // across all of them pushed a single search past two minutes, so the
  // budget bounds the worst case regardless of folder count, spending it on
  // the folders most likely to matter if it runs out before reaching them
  // all.
  async searchServer(accountId: string, query: string, options: SearchOptions): Promise<MessageSummary[]> {
    const trimmed = query.trim()
    if (!trimmed) return []

    const criteria: Record<string, string>[] = []
    if (options.fields.subject) criteria.push({ subject: trimmed })
    if (options.fields.from) criteria.push({ from: trimmed })
    if (options.fields.to) criteria.push({ to: trimmed })
    if (options.fields.body) criteria.push({ body: trimmed })
    if (criteria.length === 0) return []

    const since = options.sinceDays != null ? new Date(Date.now() - options.sinceDays * 86400000) : null
    const searchQuery = {
      ...(criteria.length === 1 ? criteria[0] : { or: criteria }),
      ...(since ? { since } : {})
    }

    const client = await this.getClient(accountId)
    let mailboxes = cachedListMailboxes(accountId).filter((m) => !m.flags.includes('\\Noselect'))
    if (options.mailboxPath) {
      mailboxes = mailboxes.filter((m) => m.path === options.mailboxPath)
    } else {
      mailboxes = mailboxes.sort(
        (a, b) => (MAILBOX_SEARCH_PRIORITY[a.specialUse ?? ''] ?? 99) - (MAILBOX_SEARCH_PRIORITY[b.specialUse ?? ''] ?? 99)
      )
    }
    const MAX_RESULTS = 150
    const TIME_BUDGET_MS = options.mailboxPath ? 30000 : 12000
    const deadline = Date.now() + TIME_BUDGET_MS
    const results: MessageSummary[] = []

    for (const mb of mailboxes) {
      if (results.length >= MAX_RESULTS) break
      if (Date.now() >= deadline) break
      try {
        const lock = await client.getMailboxLock(mb.path)
        try {
          const uids = await client.search(searchQuery, { uid: true })
          if (!uids || !uids.length) continue

          // IMAP SEARCH returns UIDs in ascending order, which tracks with
          // arrival order per mailbox — taking the tail biases the cap
          // towards the most recently received matches rather than the
          // oldest ones.
          const remaining = MAX_RESULTS - results.length
          const slice = uids.slice(-remaining)
          const indexContacts = mb.specialUse === 'Inbox' || mb.specialUse === 'Sent'
          const existingByUid = new Map(cachedListMessages(accountId, mb.path).map((m) => [m.uid, m]))

          for await (const msg of client.fetch(
            slice,
            { envelope: true, flags: true, bodyStructure: true, uid: true },
            { uid: true }
          )) {
            const { hasAttachments } = analyzeBodyStructure(msg.bodyStructure as never)
            const existing = existingByUid.get(msg.uid)
            const summary: MessageSummary = {
              accountId,
              mailboxPath: mb.path,
              uid: msg.uid,
              messageId: msg.envelope?.messageId || '',
              subject: msg.envelope?.subject || '(no subject)',
              from: toAddresses(msg.envelope?.from),
              to: toAddresses(msg.envelope?.to),
              cc: toAddresses(msg.envelope?.cc),
              date: (msg.envelope?.date || new Date()).toISOString(),
              flags: {
                seen: msg.flags?.has('\\Seen') ?? false,
                flagged: msg.flags?.has('\\Flagged') ?? false,
                answered: msg.flags?.has('\\Answered') ?? false,
                draft: msg.flags?.has('\\Draft') ?? false,
                deleted: msg.flags?.has('\\Deleted') ?? false
              },
              hasAttachments,
              snippet: existing?.snippet ?? ''
            }
            upsertMessage(summary)
            if (indexContacts) indexContactsFromMessage(summary)
            if (!options.hasAttachment || hasAttachments) results.push(summary)
          }
        } finally {
          lock.release()
        }
      } catch (err) {
        console.error('[imap] server search failed for mailbox', mb.path, err)
      }
    }

    results.sort((a, b) => (a.date < b.date ? 1 : -1))
    return results
  }

  // Last-resort fallback for getMessageBody/getAttachmentContent: downloads
  // and fully parses the entire raw message, attachments and all. Used only
  // when a message's bodyStructure doesn't yield a usable text/html part
  // (or is missing outright) — astronomically rare for a real message, but
  // cheaper to handle than to assume away. `partId` for attachments found
  // this way is a "legacy:<array index>" marker rather than a real IMAP
  // BODYSTRUCTURE part specifier (mailparser doesn't preserve one), which
  // getAttachmentContent above recognizes and routes back through this same
  // full-parse path so the index still means the same thing both times.
  //
  // Split into a lock-free core (for getMessageBody, which calls this as a
  // fallback from within a mailbox lock it's already holding) and a
  // locking wrapper (for getAttachmentContent's standalone legacy branch).
  private async downloadAndParseRaw(
    client: ImapFlow,
    accountId: string,
    mailboxPath: string,
    uid: number
  ): Promise<Awaited<ReturnType<typeof simpleParser>>> {
    const { content } = await client.download(String(uid), undefined, { uid: true })
    if (!content) {
      // Drop the phantom row so the list stops offering a message that can
      // never be opened, and tell the renderer why it disappeared.
      removeMessage(accountId, mailboxPath, uid)
      this.emit({ type: 'message-removed', data: { accountId, mailboxPath, uid } })
      throw new Error(MESSAGE_GONE_CODE)
    }
    return await simpleParser(content)
  }

  private async downloadAndParse(
    accountId: string,
    mailboxPath: string,
    uid: number
  ): Promise<Awaited<ReturnType<typeof simpleParser>>> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      return await this.downloadAndParseRaw(client, accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  async getAttachmentContent(
    accountId: string,
    mailboxPath: string,
    uid: number,
    partId: string
  ): Promise<{ filename: string; contentType: string; content: Buffer }> {
    if (partId.startsWith('legacy:')) {
      const parsed = await this.downloadAndParse(accountId, mailboxPath, uid)
      const attachment = (parsed.attachments || [])[Number(partId.slice('legacy:'.length))]
      if (!attachment) throw new Error(`Attachment part ${partId} not found on message ${uid}`)
      return {
        filename: attachment.filename || `attachment-${partId}`,
        contentType: attachment.contentType,
        content: attachment.content
      }
    }

    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const { meta, content } = await client.download(String(uid), partId, { uid: true })
      if (!content) {
        removeMessage(accountId, mailboxPath, uid)
        this.emit({ type: 'message-removed', data: { accountId, mailboxPath, uid } })
        throw new Error(MESSAGE_GONE_CODE)
      }
      return {
        filename: meta?.filename || `attachment-${partId}`,
        contentType: meta?.contentType || 'application/octet-stream',
        content: await streamToBuffer(content)
      }
    } finally {
      lock.release()
    }
  }

  // Downloads only what's needed to render the message: the bodyStructure
  // itself (cheap — no content), then the html part if there is one or
  // else the text part, plus the bytes for any inline-referenced images the
  // html actually uses. A real attachment's bytes are never touched here —
  // its metadata (filename/size/contentType) comes straight from
  // bodyStructure, and the content is fetched separately, on demand, only
  // if the user opens or saves it. Previously this always downloaded the
  // *entire* raw message (every attachment included) just to show the
  // text, which made opening a message with a large attachment as slow as
  // downloading that attachment.
  async getMessageBody(accountId: string, mailboxPath: string, uid: number): Promise<MessageBody> {
    const cached = getMessageBody(accountId, mailboxPath, uid)
    // A row cached before rawHeaders/replyTo/returnPath existed has an
    // empty rawHeaders — every real message has headers, so that's an
    // unambiguous "written by an older version" signal rather than a
    // genuine empty value. Re-fetching once backfills it instead of
    // permanently leaving View Headers and the Reply-To warning blank for
    // anything synced before this feature shipped.
    if (cached && cached.rawHeaders) return cached

    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const info = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, bodyStructure: true, headers: true },
        { uid: true }
      )
      if (!info) {
        removeMessage(accountId, mailboxPath, uid)
        this.emit({ type: 'message-removed', data: { accountId, mailboxPath, uid } })
        throw new Error(MESSAGE_GONE_CODE)
      }

      const { htmlPartId, textPartId, parts } = extractBodyParts(info.bodyStructure)

      // No usable body part found via bodyStructure at all (an exotic or
      // malformed message) — fall back to the old, slower but bulletproof
      // full-parse path rather than show a blank message.
      if (!htmlPartId && !textPartId) {
        const parsed = await this.downloadAndParseRaw(client, accountId, mailboxPath, uid)
        const attachments: MessageAttachment[] = (parsed.attachments || []).map((a, idx) => ({
          filename: a.filename || `attachment-${idx + 1}`,
          contentType: a.contentType,
          size: a.size,
          partId: `legacy:${idx}`,
          contentId: a.cid,
          inline: a.contentDisposition === 'inline'
        }))
        const rawHtml = typeof parsed.html === 'string' ? parsed.html : null
        const body: MessageBody = {
          accountId,
          mailboxPath,
          uid,
          html: rawHtml ? resolveInlineImages(rawHtml, parsed.attachments || []) : null,
          text: parsed.text || null,
          attachments,
          replyTo: toAddresses(parsed.replyTo?.value),
          returnPath: extractReturnPath(parsed.headers),
          rawHeaders: parsed.headerLines.map((h) => h.line).join('\n')
        }
        saveMessageBody(body)
        return body
      }

      const rawHeaders = info.headers ? info.headers.toString('utf-8') : ''

      let html: string | null = null
      let text: string | null = null
      if (htmlPartId) {
        const { content } = await client.download(String(uid), htmlPartId, { uid: true })
        html = content ? (await streamToBuffer(content)).toString('utf-8') : null
      } else if (textPartId) {
        const { content } = await client.download(String(uid), textPartId, { uid: true })
        text = content ? (await streamToBuffer(content)).toString('utf-8') : null
      }

      // Only fetch bytes for inline images the html actually references —
      // a part can be flagged "inline" by disposition/content-id alone
      // without the html ever using it.
      if (html) {
        const inlineImages: InlineImage[] = []
        for (const part of parts) {
          if (!part.inline || !part.contentId || !html.includes(`cid:${part.contentId}`)) continue
          const { content } = await client.download(String(uid), part.partId, { uid: true })
          if (!content) continue
          inlineImages.push({
            cid: part.contentId,
            contentType: part.contentType,
            content: await streamToBuffer(content)
          })
        }
        html = resolveInlineImages(html, inlineImages)
      }

      const attachments: MessageAttachment[] = parts.map((p) => ({
        filename: p.filename,
        contentType: p.contentType,
        size: p.size,
        partId: p.partId,
        contentId: p.contentId ?? undefined,
        inline: p.inline
      }))

      const body: MessageBody = {
        accountId,
        mailboxPath,
        uid,
        html,
        text,
        attachments,
        replyTo: toAddresses(info.envelope?.replyTo),
        returnPath: extractReturnPathFromRaw(rawHeaders),
        // The raw header block exactly as the server sent it (folding and
        // casing intact) — more faithful than reconstructing it from
        // mailparser's parsed header lines, and cheaper to get besides.
        rawHeaders
      }
      saveMessageBody(body)
      return body
    } finally {
      lock.release()
    }
  }

  async setFlags(
    accountId: string,
    mailboxPath: string,
    uid: number,
    flags: Partial<MessageSummary['flags']>
  ): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const add: string[] = []
      const remove: string[] = []
      if (flags.seen === true) add.push('\\Seen')
      if (flags.seen === false) remove.push('\\Seen')
      if (flags.flagged === true) add.push('\\Flagged')
      if (flags.flagged === false) remove.push('\\Flagged')
      if (flags.answered === true) add.push('\\Answered')
      if (flags.draft === true) add.push('\\Draft')
      if (flags.draft === false) remove.push('\\Draft')

      if (add.length) await client.messageFlagsAdd({ uid: String(uid) }, add)
      if (remove.length) await client.messageFlagsRemove({ uid: String(uid) }, remove)

      setMessageFlags(accountId, mailboxPath, uid, flags)
    } finally {
      lock.release()
    }
  }

  async moveMessage(accountId: string, mailboxPath: string, uid: number, destPath: string): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageMove({ uid: String(uid) }, destPath)
      removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  async deleteMessage(accountId: string, mailboxPath: string, uid: number): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageDelete({ uid: String(uid) })
      removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  // Bulk counterparts of setFlags/moveMessage/deleteMessage — one IMAP
  // command covering every UID instead of one round trip per message,
  // which matters a lot once "select all" can mean 700+ messages (a
  // Junk/Spam cleanup being the obvious case). ImapFlow accepts an array
  // of UIDs directly as a range and joins it into a single comma-separated
  // set itself.
  async setFlagsMany(
    accountId: string,
    mailboxPath: string,
    uids: number[],
    flags: Partial<MessageSummary['flags']>
  ): Promise<void> {
    if (uids.length === 0) return
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const add: string[] = []
      const remove: string[] = []
      if (flags.seen === true) add.push('\\Seen')
      if (flags.seen === false) remove.push('\\Seen')
      if (flags.flagged === true) add.push('\\Flagged')
      if (flags.flagged === false) remove.push('\\Flagged')
      if (flags.answered === true) add.push('\\Answered')
      if (flags.draft === true) add.push('\\Draft')
      if (flags.draft === false) remove.push('\\Draft')

      if (add.length) await client.messageFlagsAdd(uids, add, { uid: true })
      if (remove.length) await client.messageFlagsRemove(uids, remove, { uid: true })

      for (const uid of uids) setMessageFlags(accountId, mailboxPath, uid, flags)
    } finally {
      lock.release()
    }
  }

  async moveMessages(accountId: string, mailboxPath: string, uids: number[], destPath: string): Promise<void> {
    if (uids.length === 0) return
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageMove(uids, destPath, { uid: true })
      for (const uid of uids) removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  async deleteMessages(accountId: string, mailboxPath: string, uids: number[]): Promise<void> {
    if (uids.length === 0) return
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageDelete(uids, { uid: true })
      for (const uid of uids) removeMessage(accountId, mailboxPath, uid)
    } finally {
      lock.release()
    }
  }

  // Passing an array of segments (rather than a pre-joined string) to
  // ImapFlow lets it handle the server's actual hierarchy delimiter ('/'
  // vs '.', etc.) itself instead of us having to know it up front.
  async createMailbox(accountId: string, name: string, parentPath: string | null = null): Promise<void> {
    const client = await this.getClient(accountId)
    if (!parentPath) {
      await client.mailboxCreate([name])
    } else {
      const delimiter = cachedListMailboxes(accountId).find((m) => m.path === parentPath)?.delimiter || '/'
      await client.mailboxCreate([...parentPath.split(delimiter), name])
    }
    await this.listMailboxes(accountId)
  }

  async renameMailbox(accountId: string, path: string, newName: string): Promise<void> {
    const client = await this.getClient(accountId)
    const delimiter = cachedListMailboxes(accountId).find((m) => m.path === path)?.delimiter || '/'
    const segments = path.split(delimiter)
    segments[segments.length - 1] = newName
    const newPath = segments.join(delimiter)

    await client.mailboxRename(path, newPath)
    removeCachedMailbox(accountId, path)
    await this.listMailboxes(accountId)
  }

  async deleteMailbox(accountId: string, path: string): Promise<void> {
    const client = await this.getClient(accountId)
    await client.mailboxDelete(path)
    removeCachedMailbox(accountId, path)
    await this.listMailboxes(accountId)
  }

  async emptyMailbox(accountId: string, path: string): Promise<void> {
    const client = await this.getClient(accountId)
    const lock = await client.getMailboxLock(path)
    try {
      const total = (client.mailbox as MailboxObject).exists
      if (total > 0) await client.messageDelete('1:*', { uid: false })
    } finally {
      lock.release()
    }
    clearMailboxMessages(accountId, path)
    await this.listMailboxes(accountId)
  }

  async appendMessage(
    accountId: string,
    mailboxPath: string,
    raw: Buffer,
    flags: string[]
  ): Promise<void> {
    const client = await this.getClient(accountId)
    await client.append(mailboxPath, raw, flags)
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.logout()
      } catch {
        // ignore
      }
    }
    this.clients.clear()
  }
}
