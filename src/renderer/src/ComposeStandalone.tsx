import { useEffect, useRef, useState } from 'react'
import type { AccountConfig, ComposeAttachment, ComposeDraft, ComposeMode } from '@shared/types'
import { TrafficLights } from './components/TrafficLights'
import { RichTextToolbar } from './components/RichTextToolbar'
import { AddressField } from './components/AddressField'
import { IconClose, IconPaperclip } from './components/Icons'
import { extractInlineImages } from './utils/inlineImages'
import { insertInlineImageFromFile } from './utils/insertInlineImage'
import styles from './ComposeStandalone.module.css'

function emptyDraft(accountId: string): ComposeDraft {
  return { accountId, to: '', cc: '', bcc: '', subject: '', html: '', attachments: [] }
}

function titleFor(mode: ComposeMode): string {
  if (mode === 'reply') return 'Reply'
  if (mode === 'replyAll') return 'Reply All'
  if (mode === 'forward') return 'Forward'
  return 'New Message'
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ComposeStandalone(): JSX.Element | null {
  const [accounts, setAccounts] = useState<AccountConfig[]>([])
  const [mode, setMode] = useState<ComposeMode>('new')
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [showCc, setShowCc] = useState(false)
  const [sending, setSending] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const initialHtml = useRef('')

  useEffect(() => {
    void (async () => {
      const [accountList, seed] = await Promise.all([window.api.accounts.list(), window.api.compose.getInit()])
      setAccounts(accountList)
      const accountId = seed?.accountId ?? accountList[0]?.id ?? ''
      const account = accountList.find((a) => a.id === accountId)

      const nextDraft = { ...emptyDraft(accountId), ...seed?.draft }
      if (account?.signature.trim()) {
        const signatureHtml = `<div>${account.signature.replace(/\n/g, '<br>')}</div><br>`
        nextDraft.html = signatureHtml + nextDraft.html
      }

      setMode(seed?.mode ?? 'new')
      setDraft(nextDraft)
      initialHtml.current = nextDraft.html
      setShowCc(!!(nextDraft.cc || nextDraft.bcc))
    })()
  }, [])

  if (!draft) return null

  const account = accounts.find((a) => a.id === draft.accountId)
  const update = (patch: Partial<ComposeDraft>): void => setDraft((d) => (d ? { ...d, ...patch } : d))

  const handleSend = async (): Promise<void> => {
    const rawHtml = bodyRef.current?.innerHTML ?? draft.html
    // Inline images live in the body as data: URLs so they render while
    // composing; rewrite them to cid: references and pull their bytes out
    // as attachments the SMTP layer sends as inline MIME parts.
    const { html, attachments: inlineAttachments } = extractInlineImages(rawHtml)
    const finalDraft = { ...draft, html, attachments: [...draft.attachments, ...inlineAttachments] }

    setSending(true)
    try {
      await window.api.compose.send(finalDraft)
      window.api.window.close()
    } catch (err) {
      setSending(false)
      window.alert(`Couldn't send this message: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleAttach = async (): Promise<void> => {
    const picked = await window.api.compose.pickAttachments()
    if (picked.length === 0) return
    update({ attachments: [...draft.attachments, ...picked] })
  }

  const removeAttachment = (index: number): void => {
    update({ attachments: draft.attachments.filter((_, i) => i !== index) })
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    const imageItem = Array.from(e.clipboardData.items).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    )
    if (!imageItem) return // not an image paste — let the default text/html paste happen
    const file = imageItem.getAsFile()
    if (!file) return
    e.preventDefault()
    insertInlineImageFromFile(file)
  }

  const handleBodyDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return // not an image drop (e.g. dragging a message from the main window)
    e.preventDefault()
    for (const file of imageFiles) insertInlineImageFromFile(file)
  }

  return (
    <div className={styles.window}>
      <div className={`${styles.titleBar} drag-region`}>
        <TrafficLights />
        <span className={styles.title}>{titleFor(mode)}</span>
        <div className={styles.titleBarSpacer} />
      </div>

      <div className={styles.fields}>
        {accounts.length > 1 ? (
          <div className={styles.fieldRow}>
            <label>From:</label>
            <select value={draft.accountId} onChange={(e) => update({ accountId: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} &lt;{a.email}&gt;
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className={styles.fieldRow}>
            <label>From:</label>
            <span className={styles.fromValue}>{account ? `${account.displayName} <${account.email}>` : ''}</span>
          </div>
        )}
        <div className={styles.fieldRow}>
          <label>To:</label>
          <AddressField value={draft.to} onChange={(to) => update({ to })} autoFocus={!draft.to} />
          {!showCc && (
            <button className={styles.ccToggle} onClick={() => setShowCc(true)}>
              Cc/Bcc
            </button>
          )}
        </div>
        {showCc && (
          <>
            <div className={styles.fieldRow}>
              <label>Cc:</label>
              <AddressField value={draft.cc} onChange={(cc) => update({ cc })} />
            </div>
            <div className={styles.fieldRow}>
              <label>Bcc:</label>
              <AddressField value={draft.bcc} onChange={(bcc) => update({ bcc })} />
            </div>
          </>
        )}
        <div className={styles.fieldRow}>
          <label>Subject:</label>
          <input value={draft.subject} onChange={(e) => update({ subject: e.target.value })} />
        </div>
      </div>

      {draft.attachments.length > 0 && (
        <div className={styles.attachments}>
          {draft.attachments.map((a: ComposeAttachment, i: number) => (
            <div key={a.path ?? i} className={styles.attachmentChip}>
              <IconPaperclip width={12} height={12} />
              <span className={styles.attachmentName}>{a.filename}</span>
              <span className={styles.attachmentSize}>{formatBytes(a.size)}</span>
              <button
                className={styles.attachmentRemove}
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${a.filename}`}
              >
                <IconClose width={9} height={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <RichTextToolbar targetRef={bodyRef} />

      <div
        ref={bodyRef}
        className={styles.body}
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) e.preventDefault()
        }}
        onDrop={handleBodyDrop}
        dangerouslySetInnerHTML={{ __html: initialHtml.current }}
      />

      <div className={styles.footer}>
        <button className={styles.attachButton} title="Attach File" onClick={handleAttach}>
          <IconPaperclip width={15} height={15} />
        </button>
        <div className={styles.footerSpacer} />
        <button className={styles.sendButton} disabled={sending || !draft.to.trim()} onClick={handleSend}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
