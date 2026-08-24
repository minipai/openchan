import { useEffect, useState } from 'react'
import { useRenderer } from '@opentui/react'

/**
 * What colour to pretend is behind her, and when to bother.
 *
 * A terminal that can draw pictures is handed her pixels with their
 * transparency intact and composites them against whatever is really there —
 * nothing to pretend about, so nothing is set and she stands on the master's
 * own colours.
 *
 * A terminal that cannot is drawing her out of half-block characters, and a
 * character cell holds one background colour: every half-transparent pixel has
 * to be resolved to something solid before it is drawn, and with nothing behind
 * her that something is black. Hence the black slab around her.
 */
export function useColourBehindHer(asked: string | undefined, blocks: boolean) {
  const pixels = useDrawsPictures() && !blocks
  return pixels ? undefined : asked
}

/**
 * Whether this terminal takes real pixels, or is going to draw her out of
 * half-block characters. The answer comes back from the terminal rather than
 * being known up front, and it may well land after she is already on screen.
 */
export function useDrawsPictures() {
  const renderer = useRenderer()
  const [draws, setDraws] = useState(renderer.capabilities?.kitty_graphics ?? false)

  useEffect(() => {
    const heard = (capabilities: { kitty_graphics: boolean }) => setDraws(capabilities.kitty_graphics)
    renderer.on('capabilities', heard)
    return () => {
      renderer.off('capabilities', heard)
    }
  }, [renderer])

  return draws
}

/**
 * Ask the terminal what colour it is painted, so nobody has to type it in: the
 * same question every terminal answers for its own background (OSC 11). Asked
 * before the renderer takes the keyboard, because the answer arrives on stdin
 * and there must be nobody else reading it.
 *
 * A terminal that does not answer simply does not, and she falls back to the
 * black slab — so this waits a moment and then gives up.
 */
export async function askTerminalBackground(): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined

  const said = await new Promise<string>((resolve) => {
    let heard = ''
    const stop = (answer: string) => {
      clearTimeout(waited)
      process.stdin.off('data', listen)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      resolve(answer)
    }
    const listen = (chunk: Buffer) => {
      heard += chunk.toString('latin1')
      // Terminated by BEL or ST, depending on the terminal.
      if (/\x1b\]11;[^\x07\x1b]*(\x07|\x1b\\)/.test(heard)) stop(heard)
    }
    const waited = setTimeout(() => stop(heard), 250)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', listen)
    process.stdout.write('\x1b]11;?\x1b\\')
  })

  return readColour(said)
}

/** `rgb:1e1e/2020/2929` — any width per channel, taken down to eight bits. */
export function readColour(said: string): string | undefined {
  const found = /rgba?:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i.exec(said)
  if (!found) return undefined
  const eightBits = (channel: string) =>
    Math.round((parseInt(channel, 16) / (16 ** channel.length - 1)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${eightBits(found[1])}${eightBits(found[2])}${eightBits(found[3])}`
}
