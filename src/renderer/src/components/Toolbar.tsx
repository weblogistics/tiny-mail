import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { TrafficLights } from './TrafficLights'
import {
  IconArchive,
  IconCompose,
  IconFlagOutline,
  IconForward,
  IconGetMail,
  IconReply,
  IconReplyAll,
  IconSearch,
  IconSidebar,
  IconTrash
} from './Icons'
import styles from './Toolbar.module.css'

export function Toolbar(): JSX.Element {
  const [searchFocused, setSearchFocused] = useState(false)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const selectedUid = useMailStore((s) => s.selectedUid)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const search = useMailStore((s) => s.search)
  const clearSearch = useMailStore((s) => s.clearSearch)
  const refreshMailboxes = useMailStore((s) => s.refreshMailboxes)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const setFlags = useMailStore((s) => s.setFlags)
  const openCompose = useMailStore((s) => s.openCompose)
  const messagesByKey = useMailStore((s) => s.messagesByKey)

  const hasSelection = selectedUid != null
  const selectedMessage =
    selectedAccountId && selectedMailboxPath && selectedUid != null
      ? messagesByKey[`${selectedAccountId}::${selectedMailboxPath}`]?.find((m) => m.uid === selectedUid)
      : undefined

  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = boxes.find((b) => b.specialUse === 'Archive')

  const replyTo = selectedMessage
    ? { to: selectedMessage.from.map((a) => a.address).join(', '), subject: `Re: ${selectedMessage.subject}`.replace(/^Re: Re: /, 'Re: ') }
    : null

  return (
    <div className={`${styles.toolbar} drag-region`}>
      <TrafficLights />

      <button
        className={`${styles.iconButton} no-drag`}
        title="Toggle Sidebar"
        onClick={() => document.body.classList.toggle('sidebar-collapsed')}
      >
        <IconSidebar />
      </button>

      <div className={`${styles.group} no-drag`}>
        <button
          className={styles.iconButton}
          title="Get Mail"
          onClick={() => selectedAccountId && refreshMailboxes(selectedAccountId)}
        >
          <IconGetMail />
        </button>
        <button
          className={styles.iconButton}
          title="Delete"
          disabled={!hasSelection}
          onClick={() => selectedUid != null && deleteMessage(selectedUid)}
        >
          <IconTrash />
        </button>
        <button
          className={styles.iconButton}
          title="Archive"
          disabled={!hasSelection || !archiveBox}
          onClick={() => selectedUid != null && archiveBox && moveMessage(selectedUid, archiveBox.path)}
        >
          <IconArchive />
        </button>
      </div>

      <div className={`${styles.group} no-drag`}>
        <button
          className={styles.iconButton}
          title="Reply"
          disabled={!hasSelection}
          onClick={() => replyTo && openCompose('reply', { to: replyTo.to, subject: replyTo.subject })}
        >
          <IconReply />
        </button>
        <button
          className={styles.iconButton}
          title="Reply All"
          disabled={!hasSelection}
          onClick={() => replyTo && openCompose('replyAll', { to: replyTo.to, subject: replyTo.subject })}
        >
          <IconReplyAll />
        </button>
        <button
          className={styles.iconButton}
          title="Forward"
          disabled={!hasSelection}
          onClick={() => selectedMessage && openCompose('forward', { subject: `Fwd: ${selectedMessage.subject}` })}
        >
          <IconForward />
        </button>
      </div>

      <button
        className={`${styles.iconButton} no-drag`}
        title="Flag"
        disabled={!hasSelection}
        onClick={() => selectedUid != null && selectedMessage && setFlags(selectedUid, { flagged: !selectedMessage.flags.flagged })}
      >
        <IconFlagOutline />
      </button>

      <div className={styles.spacer} />

      <div className={`${styles.search} no-drag ${searchFocused ? styles.searchFocused : ''}`}>
        <IconSearch width={13} height={13} />
        <input
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {searchQuery && (
          <button className={styles.clearSearch} onClick={clearSearch}>
            ×
          </button>
        )}
      </div>

      <button className={`${styles.composeButton} no-drag`} title="New Message" onClick={() => openCompose('new')}>
        <IconCompose />
      </button>
    </div>
  )
}
