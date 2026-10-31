import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { TrafficLights } from './TrafficLights'
import { IconCompose, IconGetMail, IconSearch, IconSidebar } from './Icons'
import styles from './Toolbar.module.css'

export function Toolbar(): JSX.Element {
  const [searchFocused, setSearchFocused] = useState(false)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const search = useMailStore((s) => s.search)
  const clearSearch = useMailStore((s) => s.clearSearch)
  const refreshMailboxes = useMailStore((s) => s.refreshMailboxes)
  const syncSelectedMailbox = useMailStore((s) => s.syncSelectedMailbox)
  const openCompose = useMailStore((s) => s.openCompose)

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

      <button
        className={`${styles.iconButton} no-drag`}
        title="Get Mail"
        onClick={() => {
          if (!selectedAccountId) return
          refreshMailboxes(selectedAccountId)
          syncSelectedMailbox()
        }}
      >
        <IconGetMail />
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
