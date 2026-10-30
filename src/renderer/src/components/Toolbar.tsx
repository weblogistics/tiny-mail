import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { TrafficLights } from './TrafficLights'
import { buildForwardSeed, buildReplySeed } from '../utils/quote'
import {
  IconArchive,
  IconCompose,
  IconFlagOutline,
  IconForward,
  IconGetMail,
  IconJunk,
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
  const accounts = useMailStore((s) => s.accounts)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const search = useMailStore((s) => s.search)
  const clearSearch = useMailStore((s) => s.clearSearch)
  const refreshMailboxes = useMailStore((s) => s.refreshMailboxes)
  const syncSelectedMailbox = useMailStore((s) => s.syncSelectedMailbox)
  const deleteMessage = useMailStore((s) => s.deleteMessage)
  const moveMessage = useMailStore((s) => s.moveMessage)
  const setFlags = useMailStore((s) => s.setFlags)
  const openCompose = useMailStore((s) => s.openCompose)
  const messagesByKey = useMailStore((s) => s.messagesByKey)
  const bodyCache = useMailStore((s) => s.bodyCache)

  const hasSelection = selectedUid != null
  const selectedMessage =
    selectedAccountId && selectedMailboxPath && selectedUid != null
      ? messagesByKey[`${selectedAccountId}::${selectedMailboxPath}`]?.find((m) => m.uid === selectedUid)
      : undefined
  const selectedBody =
    selectedAccountId && selectedMailboxPath && selectedUid != null
      ? bodyCache[`${selectedAccountId}::${selectedMailboxPath}::${selectedUid}`]
      : undefined
  const selfEmail = accounts.find((a) => a.id === selectedAccountId)?.email.toLowerCase()

  const boxes = selectedAccountId ? mailboxesByAccount[selectedAccountId] ?? [] : []
  const archiveBox = boxes.find((b) => b.specialUse === 'Archive')
  const junkBox = boxes.find((b) => b.specialUse === 'Junk')

  const handleReply = (all: boolean): void => {
    if (!selectedMessage) return
    openCompose(all ? 'replyAll' : 'reply', buildReplySeed(selectedMessage, selectedBody, selfEmail, all))
  }

  const handleForward = (): void => {
    if (!selectedMessage) return
    openCompose('forward', buildForwardSeed(selectedMessage, selectedBody))
  }

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
          onClick={() => {
            if (!selectedAccountId) return
            refreshMailboxes(selectedAccountId)
            syncSelectedMailbox()
          }}
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
        <button
          className={styles.iconButton}
          title="Move to Junk"
          disabled={!hasSelection || !junkBox}
          onClick={() => selectedUid != null && junkBox && moveMessage(selectedUid, junkBox.path)}
        >
          <IconJunk />
        </button>
      </div>

      <div className={`${styles.group} no-drag`}>
        <button className={styles.iconButton} title="Reply" disabled={!hasSelection} onClick={() => handleReply(false)}>
          <IconReply />
        </button>
        <button
          className={styles.iconButton}
          title="Reply All"
          disabled={!hasSelection}
          onClick={() => handleReply(true)}
        >
          <IconReplyAll />
        </button>
        <button className={styles.iconButton} title="Forward" disabled={!hasSelection} onClick={handleForward}>
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
