import { useState } from 'react'
import { IconCopy } from './Icons'
import styles from './MessageHeadersDialog.module.css'

interface MessageHeadersDialogProps {
  subject: string
  rawHeaders: string
  onClose: () => void
}

export function MessageHeadersDialog({ subject, rawHeaders, onClose }: MessageHeadersDialogProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(rawHeaders)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can fail silently (permissions); the text is still
      // fully selectable in the <pre> below as a fallback.
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>Message Headers</h3>
          <button className={styles.closeButton} onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <p className={styles.subtitle}>{subject || '(no subject)'}</p>
        <p className={styles.hint}>
          These are the raw, unedited headers this message arrived with — including the full
          delivery path (Received) and any authentication results (SPF/DKIM/DMARC) the receiving
          server recorded. Unlike the From name shown in the reading pane, these are much harder
          to fake convincingly.
        </p>
        <pre className={styles.headers}>{rawHeaders || '(no headers captured)'}</pre>
        <div className={styles.footer}>
          <button className={styles.copyButton} onClick={handleCopy}>
            <IconCopy width={13} height={13} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className={styles.doneButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
