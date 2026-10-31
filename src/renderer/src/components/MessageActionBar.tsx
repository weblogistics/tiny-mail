import { useMailStore } from '../store/useMailStore'
import { buildForwardSeed, buildReplySeed } from '../utils/quote'
import type { MessageBody, MessageSummary } from '@shared/types'
import {
  IconArchive,
  IconFlagFilled,
  IconFlagOutline,
  IconForward,
  IconJunk,
  IconReply,
  IconReplyAll,
  IconTrash
} from './Icons'
import styles from './MessageActionBar.module.css'

interface MessageActionBarProps {
  message: MessageSummary
  body: MessageBody | undefined
}

export function MessageActionBar({ message, body }: MessageActionBarProps): JSX.Element {
  const accounts = useMailStore((s) => s.accounts)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const setFlags = useMailStore((s) => s.setFlags)
  const openCompose = useMailStore((s) => s.openCompose)

  const selfEmail = accounts.find((a) => a.id === selectedAccountId)?.email.toLowerCase()
  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = boxes.find((b) => b.specialUse === 'Archive')
  const junkBox = boxes.find((b) => b.specialUse === 'Junk')

  const handleReply = (all: boolean): void => {
    openCompose(all ? 'replyAll' : 'reply', buildReplySeed(message, body, selfEmail, all))
  }

  const handleForward = (): void => {
    openCompose('forward', buildForwardSeed(message, body))
  }

  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <button className={styles.iconButton} title="Reply" onClick={() => handleReply(false)}>
          <IconReply />
        </button>
        <button className={styles.iconButton} title="Reply All" onClick={() => handleReply(true)}>
          <IconReplyAll />
        </button>
        <button className={styles.iconButton} title="Forward" onClick={handleForward}>
          <IconForward />
        </button>
      </div>

      <div className={styles.group}>
        <button
          className={styles.iconButton}
          title="Archive"
          disabled={!archiveBox}
          onClick={() => archiveBox && moveMessage(message.uid, archiveBox.path)}
        >
          <IconArchive />
        </button>
        <button
          className={styles.iconButton}
          title="Move to Junk"
          disabled={!junkBox}
          onClick={() => junkBox && moveMessage(message.uid, junkBox.path)}
        >
          <IconJunk />
        </button>
        <button className={styles.iconButton} title="Delete" onClick={() => deleteMessage(message.uid)}>
          <IconTrash />
        </button>
      </div>

      <div className={styles.spacer} />

      <button
        className={`${styles.iconButton} ${message.flags.flagged ? styles.flagged : ''}`}
        title={message.flags.flagged ? 'Remove Flag' : 'Flag'}
        onClick={() => setFlags(message.uid, { flagged: !message.flags.flagged })}
      >
        {message.flags.flagged ? <IconFlagFilled /> : <IconFlagOutline />}
      </button>
    </div>
  )
}
