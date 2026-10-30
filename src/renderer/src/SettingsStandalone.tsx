import { useState } from 'react'
import { TrafficLights } from './components/TrafficLights'
import { IconGear, IconPerson } from './components/Icons'
import { GeneralSettingsTab } from './components/settings/GeneralSettingsTab'
import { AccountsSettingsTab } from './components/settings/AccountsSettingsTab'
import styles from './SettingsStandalone.module.css'

type Tab = 'general' | 'accounts'

export function SettingsStandalone(): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className={styles.window}>
      <div className={`${styles.titleBar} drag-region`}>
        <TrafficLights />
      </div>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${tab === 'general' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('general')}
        >
          <IconGear width={20} height={20} />
          General
        </button>
        <button
          className={`${styles.tabButton} ${tab === 'accounts' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('accounts')}
        >
          <IconPerson width={20} height={20} />
          Accounts
        </button>
      </div>

      <div className={styles.content}>{tab === 'general' ? <GeneralSettingsTab /> : <AccountsSettingsTab />}</div>
    </div>
  )
}
