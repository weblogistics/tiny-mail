import { useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { TrafficLights } from './TrafficLights'
import { AdvancedSearch } from './AdvancedSearch'
import { IconChevronDown, IconCompose, IconGetMail, IconSearch, IconSidebar } from './Icons'
import styles from './Toolbar.module.css'

export function Toolbar(): JSX.Element {
  const [searchFocused, setSearchFocused] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const search = useMailStore((s) => s.search)
  const clearSearch = useMailStore((s) => s.clearSearch)
  const searchScope = useMailStore((s) => s.searchScope)
  const searchSinceDays = useMailStore((s) => s.searchSinceDays)
  const searchFields = useMailStore((s) => s.searchFields)
  const setSearchScope = useMailStore((s) => s.setSearchScope)
  const setSearchSinceDays = useMailStore((s) => s.setSearchSinceDays)
  const setSearchFields = useMailStore((s) => s.setSearchFields)
  const getMail = useMailStore((s) => s.getMail)
  const isManualSyncing = useMailStore((s) => s.isManualSyncing)
  const openCompose = useMailStore((s) => s.openCompose)

  const currentMailboxName =
    (selectedAccountId &&
      mailboxesByAccount[selectedAccountId]?.find((b) => b.path === selectedMailboxPath)?.name) ||
    null
  const searchPlaceholder = searchScope === 'current' ? `Search ${currentMailboxName ?? 'Mailbox'}` : 'Search All Mailboxes'

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
        className={`${styles.iconButton} ${isManualSyncing ? styles.spinning : ''} no-drag`}
        title={isManualSyncing ? 'Checking for mail…' : 'Get Mail'}
        disabled={!selectedAccountId || isManualSyncing}
        onClick={() => getMail()}
      >
        <IconGetMail />
      </button>

      <div className={styles.spacer} />

      <div className={`${styles.search} no-drag ${searchFocused ? styles.searchFocused : ''}`}>
        <IconSearch width={13} height={13} />
        <input
          placeholder={searchPlaceholder}
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
        <button
          className={`${styles.advancedToggle} ${advancedOpen ? styles.advancedToggleActive : ''}`}
          title="Search Options"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <IconChevronDown width={11} height={11} />
        </button>
        {advancedOpen && (
          <AdvancedSearch
            mailboxName={currentMailboxName}
            scope={searchScope}
            sinceDays={searchSinceDays}
            fields={searchFields}
            onScopeChange={setSearchScope}
            onSinceDaysChange={setSearchSinceDays}
            onFieldsChange={setSearchFields}
            onClose={() => setAdvancedOpen(false)}
          />
        )}
      </div>

      <button className={`${styles.composeButton} no-drag`} title="New Message" onClick={() => openCompose('new')}>
        <IconCompose />
      </button>
    </div>
  )
}
