import { useEffect, useMemo, useRef, useState } from 'react'
import type { MailboxSummary } from '@shared/types'
import { buildMailboxTree, type MailboxTreeNode } from '../utils/mailboxTree'
import styles from './FolderPicker.module.css'

interface FolderPickerProps {
  x: number
  y: number
  boxes: MailboxSummary[]
  currentPath: string | null
  onPick: (path: string) => void
  onClose: () => void
}

interface Row {
  mb: MailboxSummary
  depth: number
}

function flattenTree(nodes: MailboxTreeNode[], depth = 0): Row[] {
  return nodes.flatMap((n) => [{ mb: n.mb, depth }, ...flattenTree(n.children, depth + 1)])
}

export function FolderPicker({ x, y, boxes, currentPath, onPick, onClose }: FolderPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selectable = useMemo(
    () => boxes.filter((b) => !b.flags.includes('\\Noselect') && b.path !== currentPath),
    [boxes, currentPath]
  )

  // Hierarchy only means something when the whole list is shown; once
  // filtered, the matches are scattered across the tree and the surviving
  // indentation would imply parent/child relationships that aren't there.
  const rows = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return flattenTree(buildMailboxTree(selectable))
    return selectable
      .filter((b) => b.path.toLowerCase().includes(trimmed))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((mb) => ({ mb, depth: 0 }))
  }, [selectable, query])

  // Real accounts routinely have same-named folders in different places
  // (a top-level "Spam" and an "INBOX.Spam", say). Indentation alone
  // doesn't separate them when they sit at the same depth, so any name
  // that isn't unique earns its full path alongside it.
  const ambiguousNames = useMemo(() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.mb.name)) dupes.add(row.mb.name)
      seen.add(row.mb.name)
    }
    return dupes
  }, [rows])

  useEffect(() => setActiveIndex(0), [query])

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[activeIndex]
      if (row) {
        onPick(row.mb.path)
        onClose()
      }
    }
  }

  const clampedX = Math.min(x, window.innerWidth - 272)
  const clampedY = Math.min(y, window.innerHeight - 340)

  return (
    <div
      ref={ref}
      className={styles.picker}
      style={{ left: Math.max(8, clampedX), top: Math.max(8, clampedY) }}
      onKeyDown={handleKeyDown}
    >
      <input
        autoFocus
        className={styles.search}
        placeholder="Move to mailbox…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        {rows.length === 0 && <div className={styles.empty}>No matching mailbox</div>}
        {rows.map((row, idx) => (
          <button
            key={row.mb.path}
            className={`${styles.item} ${idx === activeIndex ? styles.active : ''}`}
            style={{ paddingLeft: 10 + row.depth * 13 }}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => {
              onPick(row.mb.path)
              onClose()
            }}
          >
            <span className={styles.itemName}>{row.mb.name}</span>
            {row.mb.path !== row.mb.name && (query.trim() || ambiguousNames.has(row.mb.name)) && (
              <span className={styles.itemPath}>{row.mb.path}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
