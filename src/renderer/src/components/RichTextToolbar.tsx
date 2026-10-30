import { useEffect, useState } from 'react'
import { IconBulletList, IconClearFormat, IconLink, IconNumberedList } from './Icons'
import styles from './RichTextToolbar.module.css'

interface RichTextToolbarProps {
  targetRef: React.RefObject<HTMLDivElement>
}

interface ActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  insertUnorderedList: boolean
  insertOrderedList: boolean
}

const emptyState: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  insertUnorderedList: false,
  insertOrderedList: false
}

function exec(command: string, value?: string): void {
  document.execCommand(command, false, value)
}

function readActiveState(el: HTMLElement): ActiveState {
  const selection = window.getSelection()
  const anchorNode = selection?.anchorNode
  if (!selection || !anchorNode || !el.contains(anchorNode)) return emptyState
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    insertOrderedList: document.queryCommandState('insertOrderedList')
  }
}

export function RichTextToolbar({ targetRef }: RichTextToolbarProps): JSX.Element {
  const [active, setActive] = useState<ActiveState>(emptyState)

  useEffect(() => {
    const update = (): void => {
      if (targetRef.current) setActive(readActiveState(targetRef.current))
    }
    // selectionchange covers cursor movement and clicks; the body's own
    // input/keyup cover typing, which can change state (e.g. list autoformat)
    // without necessarily moving the selection in a way selectionchange fires for.
    document.addEventListener('selectionchange', update)
    const el = targetRef.current
    el?.addEventListener('keyup', update)
    el?.addEventListener('mouseup', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      el?.removeEventListener('keyup', update)
      el?.removeEventListener('mouseup', update)
    }
  }, [targetRef])

  const run = (command: string, value?: string) => (e: React.MouseEvent): void => {
    // Preserve the body's text selection/caret — without this the button
    // itself steals focus first and execCommand has nothing to act on.
    e.preventDefault()
    targetRef.current?.focus()
    exec(command, value)
    if (targetRef.current) setActive(readActiveState(targetRef.current))
  }

  const runLink = (e: React.MouseEvent): void => {
    e.preventDefault()
    const url = window.prompt('Link URL')
    if (!url) return
    targetRef.current?.focus()
    exec('createLink', url)
  }

  const cls = (isActive: boolean): string => `${styles.btn} ${isActive ? styles.active : ''}`

  return (
    <div className={styles.toolbar}>
      <button className={cls(active.bold)} title="Bold" onMouseDown={run('bold')}>
        <b>B</b>
      </button>
      <button className={cls(active.italic)} title="Italic" onMouseDown={run('italic')}>
        <i>I</i>
      </button>
      <button className={cls(active.underline)} title="Underline" onMouseDown={run('underline')}>
        <u>U</u>
      </button>
      <div className={styles.separator} />
      <button
        className={cls(active.insertUnorderedList)}
        title="Bulleted List"
        onMouseDown={run('insertUnorderedList')}
      >
        <IconBulletList width={15} height={15} />
      </button>
      <button
        className={cls(active.insertOrderedList)}
        title="Numbered List"
        onMouseDown={run('insertOrderedList')}
      >
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
