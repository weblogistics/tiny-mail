import type { SearchFields } from '@shared/types'
import styles from './AdvancedSearch.module.css'

interface AdvancedSearchProps {
  mailboxName: string | null
  scope: 'current' | 'all'
  sinceDays: number | null
  fields: SearchFields
  hasAttachment: boolean
  onScopeChange: (scope: 'current' | 'all') => void
  onSinceDaysChange: (days: number | null) => void
  onFieldsChange: (fields: SearchFields) => void
  onHasAttachmentChange: (value: boolean) => void
}

const SINCE_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Any time', days: null },
  { label: 'Past day', days: 1 },
  { label: 'Past week', days: 7 },
  { label: 'Past month', days: 30 },
  { label: 'Past 6 months', days: 182 },
  { label: 'Past year', days: 365 }
]

export function AdvancedSearch({
  mailboxName,
  scope,
  sinceDays,
  fields,
  hasAttachment,
  onScopeChange,
  onSinceDaysChange,
  onFieldsChange,
  onHasAttachmentChange
}: AdvancedSearchProps): JSX.Element {
  const toggleField = (key: keyof SearchFields): void => {
    const next = { ...fields, [key]: !fields[key] }
    // Keep at least one field selected — with none on, nothing could ever
    // match, which reads as a broken search rather than a deliberate choice.
    if (!next.subject && !next.from && !next.to && !next.body) return
    onFieldsChange(next)
  }

  return (
    <div className={`${styles.panel} no-drag`}>
      <div className={styles.section}>
        <div className={styles.label}>Search In</div>
        <div className={styles.segmented}>
          <button
            type="button"
            className={scope === 'current' ? styles.active : ''}
            title={mailboxName ?? 'This folder'}
            onClick={() => onScopeChange('current')}
          >
            {mailboxName ?? 'This Folder'}
          </button>
          <button
            type="button"
            className={scope === 'all' ? styles.active : ''}
            onClick={() => onScopeChange('all')}
          >
            All Mailboxes
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Date</div>
        <select
          value={sinceDays ?? ''}
          onChange={(e) => onSinceDaysChange(e.target.value ? Number(e.target.value) : null)}
        >
          {SINCE_OPTIONS.map((o) => (
            <option key={o.label} value={o.days ?? ''}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Fields</div>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={fields.subject} onChange={() => toggleField('subject')} />
          Subject
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={fields.from} onChange={() => toggleField('from')} />
          From
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={fields.to} onChange={() => toggleField('to')} />
          To
        </label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={fields.body} onChange={() => toggleField('body')} />
          Message Body
        </label>
      </div>

      <div className={styles.section}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={hasAttachment}
            onChange={(e) => onHasAttachmentChange(e.target.checked)}
          />
          Has Attachment
        </label>
      </div>
    </div>
  )
}
