import { useEffect } from 'react'
import { useMailStore } from '../store/useMailStore'
import { IconClose } from './Icons'
import styles from './Toast.module.css'

// Matches the window an undo-able move/delete stays reversible for — after
// this, the toast just disappears on its own rather than sitting there
// implying an action that's no longer available.
const UNDO_TIMEOUT_MS = 7000

export function Toast(): JSX.Element | null {
  const undo = useMailStore((s) => s.undo)
  const dismissUndo = useMailStore((s) => s.dismissUndo)

  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => dismissUndo(), UNDO_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [undo, dismissUndo])

  if (!undo) return null

  return (
    <div className={`${styles.toast} no-drag`} role="status">
      <span className={styles.message}>{undo.message}</span>
      <button className={styles.undoButton} onClick={() => undo.run()}>
        Undo
      </button>
      <button className={styles.closeButton} title="Dismiss" onClick={dismissUndo}>
        <IconClose width={12} height={12} />
      </button>
    </div>
  )
}
