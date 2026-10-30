import { IconClose } from './Icons'
import styles from './TrafficLights.module.css'

export function TrafficLights(): JSX.Element {
  return (
    <div className={`${styles.lights} no-drag`}>
      <button
        className={styles.red}
        aria-label="Close"
        onClick={() => window.api.window.close()}
      >
        <IconClose className={styles.glyph} width={8} height={8} strokeWidth={2.4} />
      </button>
      <button
        className={styles.yellow}
        aria-label="Minimize"
        onClick={() => window.api.window.minimize()}
      >
        <span className={styles.minusGlyph} />
      </button>
      <button
        className={styles.green}
        aria-label="Zoom"
        onClick={() => window.api.window.toggleMaximize()}
      />
    </div>
  )
}
