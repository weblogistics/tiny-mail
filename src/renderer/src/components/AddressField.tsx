import { useEffect, useRef, useState } from 'react'
import type { Contact } from '@shared/types'
import { getLastAddressToken, replaceLastAddressToken } from '../utils/addressToken'
import styles from './AddressField.module.css'

interface AddressFieldProps {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

export function AddressField({ value, onChange, autoFocus }: AddressFieldProps): JSX.Element {
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runSearch = (token: string): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!token) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const requestId = ++requestIdRef.current
    debounceRef.current = setTimeout(() => {
      window.api.addressBook.search(token).then((results) => {
        if (requestId !== requestIdRef.current) return // a newer keystroke already superseded this lookup
        setSuggestions(results)
        setOpen(results.length > 0)
        setHighlighted(0)
      })
    }, 150)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const next = e.target.value
    onChange(next)
    runSearch(getLastAddressToken(next))
  }

  const applySuggestion = (contact: Contact): void => {
    const label = contact.name ? `${contact.name} <${contact.address}>` : contact.address
    onChange(replaceLastAddressToken(value, label))
    setOpen(false)
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      applySuggestion(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={styles.container}>
      <input
        className={styles.input}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        // The delay lets a suggestion's onClick fire first — onMouseDown on
        // the suggestion button also prevents it from stealing focus, but
        // belt-and-suspenders here means a stray blur can't race the click.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        autoFocus={autoFocus}
      />
      {open && (
        <ul className={styles.dropdown}>
          {suggestions.map((c, i) => (
            <li key={c.address}>
              <button
                type="button"
                className={`${styles.suggestion} ${i === highlighted ? styles.highlighted : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(c)}
                onMouseEnter={() => setHighlighted(i)}
              >
                {c.name && <span className={styles.name}>{c.name}</span>}
                <span className={styles.address}>{c.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
