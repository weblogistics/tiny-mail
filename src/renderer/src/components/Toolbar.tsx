import { useEffect, useRef, useState } from 'react'
import { useMailStore } from '../store/useMailStore'
import { TrafficLights } from './TrafficLights'
import { AdvancedSearch } from './AdvancedSearch'
import { IconChevronDown, IconCompose, IconGetMail, IconSearch, IconSidebar } from './Icons'
import styles from './Toolbar.module.css'

export function Toolbar(): JSX.Element {
  const [searchFocused, setSearchFocused] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const selectedAccountId = useMailStore((s) => s.selectedAccountId)
  const selectedMailboxPath = useMailStore((s) => s.selectedMailboxPath)
  const mailboxesByAccount = useMailStore((s) => s.mailboxesByAccount)
  const searchQuery = useMailStore((s) => s.searchQuery)
  const search = useMailStore((s) => s.search)
  const clearSearch = useMailStore((s) => s.clearSearch)
  const searchScope = useMailStore((s) => s.searchScope)
  const searchSinceDays = useMailStore((s) => s.searchSinceDays)
  const searchFields = useMailStore((s) => s.searchFields)
  const searchHasAttachment = useMailStore((s) => s.searchHasAttachment)
  const setSearchScope = useMailStore((s) => s.setSearchScope)
  const setSearchSinceDays = useMailStore((s) => s.setSearchSinceDays)
  const setSearchFields = useMailStore((s) => s.setSearchFields)
  const setSearchHasAttachment = useMailStore((s) => s.setSearchHasAttachment)
  const getMail = useMailStore((s) => s.getMail)
  const isManualSyncing = useMailStore((s) => s.isManualSyncing)
  const openCompose = useMailStore((s) => s.openCompose)

  const currentMailboxName =
    (selectedAccountId &&
      mailboxesByAccount[selectedAccountId]?.find((b) => b.path === selectedMailboxPath)?.name) ||
    null
  const searchPlaceholder = searchScope === 'current' ? `Search ${currentMailboxName ?? 'Mailbox'}` : 'Search All Mailboxes'

  // Closing on an outside click is handled here, against the whole search
  // widget (input + toggle + panel), rather than inside AdvancedSearch
  // against just the panel. Scoping it to only the panel let a click on the
  // toggle button itself count as "outside" — the button's own onClick
  // toggle and this listener's onClose then fired for the same click and
  // fought each other, so the panel could never actually stay open.
  useEffect(() => {
    if (!advancedOpen) return
    const handleClick = (e: MouseEvent): void => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setAdvancedOpen(false)
    }
    // 'click' rather than 'mousedown': mousedown fires (and used to close
    // the panel) before the toggle button's own click handler re-opens it,
    // which is exactly the race that made the toggle button unusable.
    // Listening on 'click' here puts both on the same, later event so there
    // is nothing left to race.
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [advancedOpen])

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

      <div
        ref={searchRef}
        className={`${styles.search} no-drag ${searchFocused || advancedOpen ? styles.searchFocused : ''}`}
      >
        <IconSearch width={13} height={13} />
        <input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {searchQuery && (
          <button
            className={styles.clearSearch}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearSearch}
          >
            ×
          </button>
        )}
        <button
          className={`${styles.advancedToggle} no-drag ${advancedOpen ? styles.advancedToggleActive : ''}`}
          title="Search Options"
          // Clicking this button would otherwise blur the search input first
          // (as any mousedown on a different element does), which — while
          // the input was focused, i.e. exactly when there's already a
          // query — immediately shrinks the search box back to its
          // unfocused width mid-click. On a real (non-instant) mouse click,
          // that shift happens between mousedown and mouseup, so the click
          // lands wherever the box's content ended up, not on this button —
          // most often back on the input itself, which just refocuses it
          // and makes the toggle look like it silently did nothing.
          // preventDefault on mousedown stops the browser from moving focus
          // at all, so the box never moves under the cursor mid-click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <IconChevronDown width={13} height={13} />
        </button>
        {advancedOpen && (
          <AdvancedSearch
            mailboxName={currentMailboxName}
            scope={searchScope}
            sinceDays={searchSinceDays}
            fields={searchFields}
            hasAttachment={searchHasAttachment}
            onScopeChange={setSearchScope}
            onSinceDaysChange={setSearchSinceDays}
            onFieldsChange={setSearchFields}
            onHasAttachmentChange={setSearchHasAttachment}
          />
        )}
      </div>

      <button className={`${styles.composeButton} no-drag`} title="New Message" onClick={() => openCompose('new')}>
        <IconCompose />
      </button>
    </div>
  )
}
