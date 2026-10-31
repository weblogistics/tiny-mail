import { useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { MessageAddress, MessageAttachment } from '@shared/types'
import { sanitizeMessageHtml } from '../utils/sanitizeHtml'
import { IconPaperclip } from './Icons'
import { MessageActionBar } from './MessageActionBar'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import styles from './ReadingPane.module.css'

function addressList(addrs: MessageAddress[]): string {
  return addrs.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')
}

function initial(addrs: MessageAddress[]): string {
  const first = addrs[0]
  const label = first?.name || first?.address || '?'
  return label.charAt(0).toUpperCase()
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ReadingPane(): JSX.Element {
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const selectedUid = useMailStore((s) => s.selectedUid)
  const messagesByKey = useMailStore((s) => s.messagesByKey)
  const searchResults = useMailStore((s) => s.searchResults)
  const bodyCache = useMailStore((s) => s.bodyCache)
  const settings = useMailStore((s) => s.settings)
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)
  const [openingPartId, setOpeningPartId] = useState<string | null>(null)
  const [attachMenu, setAttachMenu] = useState<{ x: number; y: number; attachment: MessageAttachment } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const list = searchResults ?? (key ? messagesByKey[key] ?? [] : [])
  const message = list.find((m) => m.uid === selectedUid)
  const bodyKey = selectedAccountId && selectedMailboxPath && selectedUid != null ? `${selectedAccountId}::${selectedMailboxPath}::${selectedUid}` : null
  const body = bodyKey ? bodyCache[bodyKey] : undefined

  // Reset to the user's default for each newly-opened message rather than
  // leaving remote images permanently unblocked after the first "Load
  // Remote Content" click of the session.
  useEffect(() => {
    setAllowRemoteImages(settings?.loadRemoteImagesByDefault ?? false)
  }, [bodyKey, settings?.loadRemoteImagesByDefault])

  const sanitized = useMemo(() => {
    if (!body?.html) return null
    return sanitizeMessageHtml(body.html, allowRemoteImages)
  }, [body?.html, allowRemoteImages])

  if (!message) {
    return (
      <div className={styles.pane}>
        <div className={styles.emptyState}>No Message Selected</div>
      </div>
    )
  }

  const handleOpenAttachment = async (a: MessageAttachment): Promise<void> => {
    if (!selectedAccountId || !selectedMailboxPath) return
    setOpeningPartId(a.partId)
    try {
      await window.api.mail.openAttachment(selectedAccountId, selectedMailboxPath, message.uid, a.partId)
    } catch (err) {
      window.alert(`Couldn't open "${a.filename}": ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setOpeningPartId(null)
    }
  }

  const handleSaveAttachment = async (a: MessageAttachment): Promise<void> => {
    if (!selectedAccountId || !selectedMailboxPath) return
    try {
      await window.api.mail.saveAttachment(selectedAccountId, selectedMailboxPath, message.uid, a.partId)
    } catch (err) {
      window.alert(`Couldn't save "${a.filename}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const attachMenuItems: ContextMenuItem[] = attachMenu
    ? [
        { label: 'Open', onSelect: () => handleOpenAttachment(attachMenu.attachment) },
        { label: 'Save As…', onSelect: () => handleSaveAttachment(attachMenu.attachment) }
      ]
    : []

  const srcDoc = sanitized
    ? `<!doctype html><html><head><base target="_blank"><meta charset="utf-8"><style>
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f;margin:0;padding:16px;word-wrap:break-word;}
        img{max-width:100%;}
        a{color:#0a84ff;}
      </style></head><body>${sanitized.html}</body></html>`
    : null

  return (
    <div className={styles.pane}>
      <MessageActionBar message={message} body={body} />
      <div className={styles.header}>
        <div className={styles.subjectRow}>
          <h1 className={styles.subject}>{message.subject || '(no subject)'}</h1>
        </div>
        <div className={styles.metaRow}>
          <div className={styles.avatar}>{initial(message.from)}</div>
          <div className={styles.metaText}>
            <div className={styles.fromLine}>
              <span className={styles.fromName}>{message.from[0]?.name || message.from[0]?.address}</span>
            </div>
            <div className={styles.toLine}>To: {addressList(message.to)}</div>
          </div>
          <div className={styles.dateText}>{new Date(message.date).toLocaleString()}</div>
        </div>
        {body && body.attachments.length > 0 && (
          <div className={styles.attachments}>
            {body.attachments.map((a) => (
              <button
                key={a.partId}
                className={styles.attachmentChip}
                disabled={openingPartId === a.partId}
                onClick={() => handleOpenAttachment(a)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setAttachMenu({ x: e.clientX, y: e.clientY, attachment: a })
                }}
                title={`Open ${a.filename}`}
              >
                <IconPaperclip width={13} height={13} />
                <span className={styles.attachmentName}>{a.filename}</span>
                <span className={styles.attachmentSize}>
                  {openingPartId === a.partId ? 'Opening…' : formatBytes(a.size)}
                </span>
              </button>
            ))}
          </div>
        )}
        {sanitized?.hadRemoteImages && !allowRemoteImages && (
          <div className={styles.remoteBanner}>
            <span>Images have been blocked to protect your privacy.</span>
            <button onClick={() => setAllowRemoteImages(true)}>Load Remote Content</button>
          </div>
        )}
      </div>
      <div className={styles.bodyWrap}>
        {srcDoc ? (
          <iframe ref={iframeRef} className={styles.bodyFrame} sandbox="allow-same-origin allow-popups" srcDoc={srcDoc} />
        ) : (
          <pre className={styles.plainBody}>{body?.text || ''}</pre>
        )}
      </div>
      {attachMenu && (
        <ContextMenu x={attachMenu.x} y={attachMenu.y} items={attachMenuItems} onClose={() => setAttachMenu(null)} />
      )}
    </div>
  )
}
