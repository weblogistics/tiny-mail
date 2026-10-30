import { useRef, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { IconClose } from './Icons'
import styles from './ComposeWindow.module.css'

export function ComposeWindow(): JSX.Element | null {
  const compose = useMailStore((s) => s.compose)
  const updateCompose = useMailStore((s) => s.updateCompose)
  const closeCompose = useMailStore((s) => s.closeCompose)
  const sendCompose = useMailStore((s) => s.sendCompose)
  const accounts = useMailStore((s) => s.accounts)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [showCc, setShowCc] = useState(false)
  const [sending, setSending] = useState(false)

  if (!compose) return null

  const account = accounts.find((a) => a.id === compose.draft.accountId)
  const title =
    compose.mode === 'reply' ? 'Re:' : compose.mode === 'replyAll' ? 'Re: (All)' : compose.mode === 'forward' ? 'Fwd:' : 'New Message'

  const handleSend = async (): Promise<void> => {
    updateCompose({ html: bodyRef.current?.innerHTML ?? '' })
    setSending(true)
    try {
      await sendCompose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.window}>
        <div className={styles.titleBar}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeButton} onClick={closeCompose} aria-label="Close">
            <IconClose width={11} height={11} />
          </button>
        </div>

        <div className={styles.fields}>
          <div className={styles.fieldRow}>
            <label>From:</label>
            <span className={styles.fromValue}>
              {account ? `${account.displayName} <${account.email}>` : ''}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <label>To:</label>
            <input value={compose.draft.to} onChange={(e) => updateCompose({ to: e.target.value })} />
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
                <input value={compose.draft.cc} onChange={(e) => updateCompose({ cc: e.target.value })} />
              </div>
              <div className={styles.fieldRow}>
                <label>Bcc:</label>
                <input value={compose.draft.bcc} onChange={(e) => updateCompose({ bcc: e.target.value })} />
              </div>
            </>
          )}
          <div className={styles.fieldRow}>
            <label>Subject:</label>
            <input value={compose.draft.subject} onChange={(e) => updateCompose({ subject: e.target.value })} />
          </div>
        </div>

        <div
          ref={bodyRef}
          className={styles.body}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: compose.draft.html }}
        />

        <div className={styles.footer}>
          <button
            className={styles.sendButton}
            disabled={sending || !compose.draft.to.trim()}
            onClick={handleSend}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
