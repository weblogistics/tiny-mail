import { useEffect, useRef, useState } from 'react'
import { IconBulletList, IconClearFormat, IconImage, IconLink, IconNumberedList } from './Icons'
import { PromptDialog } from './PromptDialog'
import { insertInlineImageFromFile } from '../utils/insertInlineImage'
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
  const [showLinkPrompt, setShowLinkPrompt] = useState(false)
  const savedRange = useRef<Range | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

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

  // Both the custom link dialog and the native file picker steal focus away
  // from the compose body, which would otherwise collapse its text
  // selection/caret before we get a chance to act on it. Save it first and
  // restore it right before the insertion so execCommand still has
  // somewhere to insert into.
  const saveSelection = (): void => {
    const selection = window.getSelection()
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  }

  const restoreSelection = (): void => {
    targetRef.current?.focus()
    if (savedRange.current) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(savedRange.current)
    }
  }

  const runLink = (e: React.MouseEvent): void => {
    e.preventDefault()
    saveSelection()
    setShowLinkPrompt(true)
  }

  const submitLink = (url: string): void => {
    setShowLinkPrompt(false)
    restoreSelection()
    exec('createLink', url)
  }

  const runInsertImage = (e: React.MouseEvent): void => {
    e.preventDefault()
    saveSelection()
    imageInputRef.current?.click()
  }

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    insertInlineImageFromFile(file, restoreSelection)
  }

  const cls = (isActive: boolean): string => `${styles.btn} ${isActive ? styles.active : ''}`

  return (
    <div className={styles.toolbar}>
      {/* tabIndex={-1} on every button here: this toolbar sits between the
          Subject field and the compose body in DOM order, so without it
          Tab from Subject would stop at each formatting button in turn
          instead of going straight to the body, where someone starting a
          new message almost always wants to land next. Still fully
          clickable with the mouse either way. */}
      <button className={cls(active.bold)} title="Bold" tabIndex={-1} onMouseDown={run('bold')}>
        <b>B</b>
      </button>
      <button className={cls(active.italic)} title="Italic" tabIndex={-1} onMouseDown={run('italic')}>
        <i>I</i>
      </button>
      <button className={cls(active.underline)} title="Underline" tabIndex={-1} onMouseDown={run('underline')}>
        <u>U</u>
      </button>
      <div className={styles.separator} />
      <button
        className={cls(active.insertUnorderedList)}
        title="Bulleted List"
        tabIndex={-1}
        onMouseDown={run('insertUnorderedList')}
      >
        <IconBulletList width={15} height={15} />
      </button>
      <button
        className={cls(active.insertOrderedList)}
        title="Numbered List"
        tabIndex={-1}
        onMouseDown={run('insertOrderedList')}
      >
        <IconNumberedList width={15} height={15} />
      </button>
      <div className={styles.separator} />
      <button className={styles.btn} title="Link" tabIndex={-1} onMouseDown={runLink}>
        <IconLink width={15} height={15} />
      </button>
      <button className={styles.btn} title="Insert Image" tabIndex={-1} onMouseDown={runInsertImage}>
        <IconImage width={15} height={15} />
      </button>
      <button className={styles.btn} title="Remove Formatting" tabIndex={-1} onMouseDown={run('removeFormat')}>
        <IconClearFormat width={15} height={15} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageSelected}
      />

      {showLinkPrompt && (
        <PromptDialog
          title="Add Link"
          label="URL:"
          defaultValue="https://"
          confirmLabel="Add"
          onSubmit={submitLink}
          onCancel={() => setShowLinkPrompt(false)}
        />
      )}
    </div>
  )
}
