import { useEffect, useRef } from 'react'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const clampedX = Math.min(x, window.innerWidth - 200)
  const clampedY = Math.min(y, window.innerHeight - items.length * 28 - 16)

  return (
    <div ref={ref} className={styles.menu} style={{ left: clampedX, top: clampedY }}>
      {items.map((item, idx) => (
        <div key={idx}>
          {item.separatorBefore && <div className={styles.separator} />}
          <button
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
