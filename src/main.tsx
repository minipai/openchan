import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { askTerminalBackground } from './behind'

// Before the renderer takes the keyboard: the answer comes back on stdin.
const behind = await askTerminalBackground()

const renderer = await createCliRenderer()

/**
 * She is not written into the screen the way letters are — the terminal is
 * handed the picture and keeps it until it is told to let go. Leaving the
 * alternate screen usually takes her with it, so this is the belt to that
 * brace: on the way out, tell it to drop every picture it was given, or she is
 * left standing over the master's shell.
 */
process.on('exit', () => {
  if (process.stdout.isTTY) process.stdout.write('\x1b_Ga=d,d=A\x1b\\')
})

createRoot(renderer).render(<App behind={behind} />)
