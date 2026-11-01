import { useEffect } from 'react'
import { useMailStore } from '../store/useMailStore'
import { buildForwardSeed, buildReplySeed } from '../utils/quote'
import { isOutgoingMailbox } from '../utils/isOutgoingMailbox'

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      const state = useMailStore.getState()

      // Escape always works, even while typing, to back out of a dialog.
      // (Compose is its own OS window now, with no escape-to-close of its
      // own — losing a half-written message to a stray Escape is worse
      // than requiring the close button.)
      if (e.key === 'Escape') {
        if (state.isAccountDialogOpen && state.accounts.length > 0) {
          state.setAccountDialogOpen(false)
          e.preventDefault()
        } else if (state.selectedUids.size > 0) {
          state.clearMultiSelection()
          e.preventDefault()
        }
        return
      }

      if (isTypingTarget(e.target)) return

      const key = state.selectedAccountId && state.selectedMailboxPath ? `${state.selectedAccountId}::${state.selectedMailboxPath}` : null
      const list = state.searchResults ?? (key ? state.messagesByKey[key] ?? [] : [])
      const selected = list.find((m) => m.uid === state.selectedUid)
      const bodyKey = key && state.selectedUid != null ? `${key}::${state.selectedUid}` : null
      const body = bodyKey ? state.bodyCache[bodyKey] : undefined

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        state.openCompose('new')
        return
      }

      if (mod && e.key === ',') {
        e.preventDefault()
        window.api.settings.openWindow()
        return
      }

      if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[placeholder="Search"]')?.focus()
        return
      }

      if (mod && e.key.toLowerCase() === 'r' && selected) {
        e.preventDefault()
        const all = e.shiftKey
        const selfEmail = state.accounts.find((a) => a.id === state.selectedAccountId)?.email
        const boxes = state.selectedAccountId ? state.mailboxesByAccount[state.selectedAccountId] ?? [] : []
        const isOutgoing = isOutgoingMailbox(boxes, selected.mailboxPath)
        state.openCompose(all ? 'replyAll' : 'reply', buildReplySeed(selected, body, selfEmail, all, isOutgoing))
        return
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'f' && selected) {
        e.preventDefault()
        state.openCompose('forward', buildForwardSeed(selected, body))
        return
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'u' && state.selectedUid != null && selected) {
        e.preventDefault()
        state.setFlags(state.selectedUid, { seen: !selected.flags.seen })
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedUids.size > 1) {
          e.preventDefault()
          state.bulkDelete()
          return
        }
        if (state.selectedUid != null) {
          e.preventDefault()
          state.deleteMessage(state.selectedUid)
          return
        }
      }

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length > 0) {
        e.preventDefault()
        const idx = list.findIndex((m) => m.uid === state.selectedUid)
        const nextIdx =
          idx < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1)
        state.selectMessage(list[nextIdx].uid)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
