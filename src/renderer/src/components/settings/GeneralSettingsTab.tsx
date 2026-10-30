import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import styles from './SettingsTab.module.css'

export function GeneralSettingsTab(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    await window.api.settings.update(patch)
  }

  if (!settings) return <div className={styles.loading}>Loading…</div>

  return (
    <div>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Checking for Mail</h3>
        <label className={styles.radioRow}>
          Check every
          <select
            className={styles.inlineSelect}
            value={settings.syncIntervalSeconds}
            onChange={(e) => update({ syncIntervalSeconds: Number(e.target.value) })}
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={1800}>30 minutes</option>
          </select>
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Reading</h3>
        <label className={styles.radioRow}>
          <input
            type="radio"
            name="markAsRead"
            checked={settings.markAsReadBehavior === 'instant'}
            onChange={() => update({ markAsReadBehavior: 'instant' })}
          />
          Mark messages as read when selected
        </label>
        <label className={styles.radioRow}>
          <input
            type="radio"
            name="markAsRead"
            checked={settings.markAsReadBehavior === 'never'}
            onChange={() => update({ markAsReadBehavior: 'never' })}
          />
          Never mark messages as read automatically
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Privacy</h3>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={settings.loadRemoteImagesByDefault}
            onChange={(e) => update({ loadRemoteImagesByDefault: e.target.checked })}
          />
          Automatically load remote images in messages
        </label>
        <p className={styles.hint}>
          Remote images can be used to confirm you've read a message, so Tiny Mail blocks them by
          default. You can still choose to load them for an individual message from the reading pane.
        </p>
      </section>
    </div>
  )
}
