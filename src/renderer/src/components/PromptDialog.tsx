import { useState } from 'react'
import styles from './PromptDialog.module.css'

interface PromptDialogProps {
  title: string
  label?: string
  defaultValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  confirmLabel = 'OK',
  onSubmit,
  onCancel
}: PromptDialogProps): JSX.Element {
  const [value, setValue] = useState(defaultValue)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className={styles.dialog} onSubmit={submit}>
        <h3 className={styles.title}>{title}</h3>
        {label && <label className={styles.label}>{label}</label>}
        <input
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          autoFocus
        />
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.confirmButton} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
