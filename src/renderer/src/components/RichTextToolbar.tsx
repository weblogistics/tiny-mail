import { IconBulletList, IconClearFormat, IconLink, IconNumberedList } from './Icons'
import styles from './RichTextToolbar.module.css'

interface RichTextToolbarProps {
  targetRef: React.RefObject<HTMLDivElement>
}

function exec(command: string, value?: string): void {
  document.execCommand(command, false, value)
}

export function RichTextToolbar({ targetRef }: RichTextToolbarProps): JSX.Element {
  const run = (command: string, value?: string) => (e: React.MouseEvent): void => {
    // Preserve the body's text selection/caret — without this the button
    // itself steals focus first and execCommand has nothing to act on.
    e.preventDefault()
    targetRef.current?.focus()
    exec(command, value)
  }

  const runLink = (e: React.MouseEvent): void => {
    e.preventDefault()
    const url = window.prompt('Link URL')
    if (!url) return
    targetRef.current?.focus()
    exec('createLink', url)
  }

  return (
    <div className={styles.toolbar}>
      <button className={styles.btn} title="Bold" onMouseDown={run('bold')}>
        <b>B</b>
      </button>
      <button className={styles.btn} title="Italic" onMouseDown={run('italic')}>
        <i>I</i>
      </button>
      <button className={styles.btn} title="Underline" onMouseDown={run('underline')}>
        <u>U</u>
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} title="Bulleted List" onMouseDown={run('insertUnorderedList')}>
        <IconBulletList width={15} height={15} />
      </button>
      <button className={styles.btn} title="Numbered List" onMouseDown={run('insertOrderedList')}>
        <IconNumberedList width={15} height={15} />
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} title="Link" onMouseDown={runLink}>
        <IconLink width={15} height={15} />
      </button>
      <button className={styles.btn} title="Remove Formatting" onMouseDown={run('removeFormat')}>
        <IconClearFormat width={15} height={15} />
      </button>
    </div>
  )
}
