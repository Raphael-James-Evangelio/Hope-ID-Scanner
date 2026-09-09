let enabled = true
let buffer = ''
let timer = null

function armTimer() {
  clearTimeout(timer)
  timer = setTimeout(() => { buffer = '' }, 1200)
}

function attach(webContents) {
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!enabled) return
    const k = input.key
    if (k === 'F11' || k === 'F12' || k === 'Alt' || k === 'Shift' || k === 'Control' || k === 'Meta') return
    if (k === 'Enter') {
      const uid = buffer.trim()
      buffer = ''
      clearTimeout(timer)
      if (uid) webContents.send('scanner:data', uid)
    } else if (k === 'Backspace') {
      buffer = buffer.slice(0, -1)
      armTimer()
    } else if (k === 'Escape') {
      buffer = ''
    } else if (k.length === 1) {
      if (buffer.length < 64) buffer += k
      armTimer()
    }
    event.preventDefault()
  })
  webContents.on('destroyed', () => clearTimeout(timer))
}

function setEnabled(v) {
  enabled = !!v
  if (!enabled) buffer = ''
}

module.exports = { attach, setEnabled }
