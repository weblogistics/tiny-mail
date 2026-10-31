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
          <input
            type="radio"
            name="syncMode"
            checked={settings.syncMode === 'push'}
            onChange={() => update({ syncMode: 'push' })}
          />
          As they arrive
        </label>
        <label className={styles.radioRow}>
          <input
            type="radio"
            name="syncMode"
            checked={settings.syncMode === 'interval'}
            onChange={() => update({ syncMode: 'interval' })}
          />
          Every
          <select
            className={styles.inlineSelect}
            value={settings.syncIntervalSeconds}
            disabled={settings.syncMode !== 'interval'}
            onChange={(e) => update({ syncIntervalSeconds: Number(e.target.value) })}
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={1800}>30 minutes</option>
          </select>
        </label>
        <p className={styles.hint}>
          "As they arrive" keeps a live connection open and shows new mail the moment the server
          notifies Tiny Mail, for whichever mailbox you currently have open.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Mailbox History</h3>
        <label className={styles.radioRow}>
          Download messages from the last
          <select
            className={styles.inlineSelect}
            value={settings.syncLookbackDays}
            onChange={(e) => update({ syncLookbackDays: Number(e.target.value) })}
          >
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={30}>1 month</option>
            <option value={90}>3 months</option>
            <option value={180}>6 months</option>
            <option value={365}>1 year</option>
            <option value={0}>All mail</option>
          </select>
        </label>
        <p className={styles.hint}>
          Older messages stay on the server and won't appear in a mailbox until you search for
          them, which always checks the server regardless of this setting.
        </p>
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
        <h3 className={styles.sectionTitle}>Organization</h3>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={settings.groupByThread}
            onChange={(e) => update({ groupByThread: e.target.checked })}
          />
          Group messages by thread
        </label>
        <p className={styles.hint}>
          Groups messages that share a subject into a single expandable conversation.
        </p>
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
