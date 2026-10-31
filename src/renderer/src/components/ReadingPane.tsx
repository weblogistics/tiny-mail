import { useEffect, useMemo, useRef, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import type { MessageAddress, MessageAttachment } from '@shared/types'
import { sanitizeMessageHtml } from '../utils/sanitizeHtml'
import { IconMoon, IconPaperclip, IconSun } from './Icons'
import { MessageActionBar } from './MessageActionBar'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { useSystemColorScheme } from '../hooks/useSystemColorScheme'
import styles from './ReadingPane.module.css'

// An arbitrary HTML email can't be reliably "re-themed" by overriding a few
// colors — it may set any combination of explicit inline colors/
// backgrounds. invert+hue-rotate is the same trick browser dark-mode
// extensions use: it flips the whole rendered page (light backgrounds
// become dark, dark text becomes light) while staying colorimetrically
// closer to the original than a flat invert, and re-inverting images/video
// specifically cancels the effect for them so photos don't render as
// negatives.
const EMAIL_DARK_MODE_CSS = `
  html { filter: invert(1) hue-rotate(180deg); }
  img, svg, video, picture { filter: invert(1) hue-rotate(180deg); }
`

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
  const [emailDark, setEmailDark] = useState(false)
  const [openingPartId, setOpeningPartId] = useState<string | null>(null)
  const [attachMenu, setAttachMenu] = useState<{ x: number; y: number; attachment: MessageAttachment } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const systemScheme = useSystemColorScheme()

  const key = selectedAccountId && selectedMailboxPath ? `${selectedAccountId}::${selectedMailboxPath}` : null
  const list = searchResults ?? (key ? messagesByKey[key] ?? [] : [])
  const message = list.find((m) => m.uid === selectedUid)
  // Keyed off the message's own mailbox rather than the selected one: a
  // search result can come from any folder, and keying by the sidebar
  // selection would look up (or collide with) a different message's body.
  const bodyKey = message ? `${message.accountId}::${message.mailboxPath}::${message.uid}` : null
  const body = bodyKey ? bodyCache[bodyKey] : undefined

  // Reset to the user's default for each newly-opened message rather than
  // leaving remote images permanently unblocked after the first "Load
  // Remote Content" click of the session.
  useEffect(() => {
    setAllowRemoteImages(settings?.loadRemoteImagesByDefault ?? false)
  }, [bodyKey, settings?.loadRemoteImagesByDefault])

  // Default each newly-opened message to match the app's current theme —
  // most emails are authored assuming a light background, so a bright
  // white message sitting inside an otherwise-dark app is exactly the
  // "hard to read" contrast jump being fixed here — but still let the
  // toggle override it per-message, since inverting can occasionally make
  // a specific email (e.g. one already dark-themed) look worse, not better.
  useEffect(() => {
    setEmailDark(systemScheme === 'dark')
  }, [bodyKey, systemScheme])

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
    setOpeningPartId(a.partId)
    try {
      await window.api.mail.openAttachment(message.accountId, message.mailboxPath, message.uid, a.partId)
    } catch (err) {
      window.alert(`Couldn't open "${a.filename}": ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setOpeningPartId(null)
    }
  }

  const handleSaveAttachment = async (a: MessageAttachment): Promise<void> => {
    try {
      await window.api.mail.saveAttachment(message.accountId, message.mailboxPath, message.uid, a.partId)
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
    ? `<!doctype html><html><head><base target="_blank"><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
        /* Explicit white is the real baseline here, not a stylistic choice —
           without it, body has no background at all (an iframe's canvas is
           transparent by default, unlike a top-level page), so it was
           showing the host app's own --reading-bg through underneath:
           invisible-looking near-black-on-near-black in dark mode once the
           per-message toggle switched email rendering back to "light".
           The dark-mode filter below inverts this white to black, which is
           the behavior that actually makes the toggle's two states correct
           opposites of each other. The color-scheme meta tag is equally
           load-bearing: without it, Chromium's own automatic dark-theming
           for web content that doesn't declare a scheme kept re-darkening
           this iframe underneath our filter-based toggle, fighting it
           invisibly — "light" mode still rendered dark despite every one
           of our own styles correctly saying otherwise.  */
        html{color-scheme:light;}
        html, body{background:#fff;}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f;margin:0;padding:16px;word-wrap:break-word;}
        img{max-width:100%;}
        a{color:#0a84ff;}
        ${emailDark ? EMAIL_DARK_MODE_CSS : ''}
      </style></head><body>${sanitized.html}</body></html>`
    : null

  return (
    <div className={styles.pane}>
      <MessageActionBar message={message} body={body} />
      <div className={styles.header}>
        <div className={styles.subjectRow}>
          <h1 className={styles.subject}>{message.subject || '(no subject)'}</h1>
          {srcDoc && (
            <button
              className={styles.darkToggle}
              title={emailDark ? 'Show message in light mode' : 'Show message in dark mode'}
              onClick={() => setEmailDark((d) => !d)}
            >
              {emailDark ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
            </button>
          )}
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
