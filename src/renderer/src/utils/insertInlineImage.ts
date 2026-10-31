function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// Inserts `file` as an inline <img> at the current selection via
// execCommand('insertHTML', ...), which acts on whatever the live DOM
// selection is at the moment it runs. `beforeInsert` fires right then,
// synchronously, just before the exec call — pass it when the compose
// body needs its selection restored first (a toolbar button steals focus
// when clicked, so a saved selection has to be put back; a paste event
// doesn't need this since the body already has focus and a live caret).
export function insertInlineImageFromFile(file: File, beforeInsert?: () => void): void {
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : null
    if (!dataUrl) return
    const cid = `${crypto.randomUUID()}@tinymail.local`
    beforeInsert?.()
    // max-width keeps a large photo from blowing out the compose window;
    // the filename is kept as a data attribute so the real attachment
    // built at send time can use it instead of a generic placeholder.
    document.execCommand(
      'insertHTML',
      false,
      `<img src="${dataUrl}" data-cid="${cid}" data-filename="${escapeAttr(file.name || 'image.png')}" style="max-width:100%">`
    )
  }
  reader.readAsDataURL(file)
}
