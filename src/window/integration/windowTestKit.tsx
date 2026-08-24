import { afterAll, afterEach, beforeEach, mock } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import type { Expression } from '../../her/cast'
import { spriteColumns } from '../SpriteLayer'

/**
 * Her, written down rather than drawn.
 *
 * The real sprite goes out through the terminal's graphics protocol and never
 * lands in the character grid, so the face the window hands it could not be
 * read off the screen — which is how that one line went untested while the
 * rest of the window was not. This one puts the face into the grid as a word,
 * worded so that finding it on screen means that and nothing else.
 */
mock.module('../SpriteLayer', () => ({
  spriteColumns,
  SpriteLayer: ({ expression }: { expression: Expression }) => (
    <box position="absolute" top={0} left={0}>
      <text>{`her face is ${expression}`}</text>
    </box>
  ),
}))

import { App } from '../App'
import { CAST, remember, remembered, speak, spoken } from '../../her/cast'
import { OPENED_IN } from '../../between/folder'
import type { BridgeEvent } from '../../between/protocol'
import { Stand } from '../../opencode/stand'

/** What a terminal is unless someone has resized it. */
const TERMINAL = { width: 80, height: 24 }

/** The last piece of the folder the window was started in: what the strip
 * keeps of it however much of the rest it has to cut. */
export const HERE = path.basename(OPENED_IN)

/** The line above her box, which is where all three of them are written: what
 * she is doing, what she is thinking with, and where. Found by the box under
 * it rather than by anything written on it, so that a test can say what is
 * missing from it. */
export const strip = (frame: string) => {
  const rows = frame.split('\n')
  return rows[rows.findIndex((row) => row.includes('╭─')) - 1]!
}

/** What she wrote this turn, worded so that finding it on screen means that and
 * nothing else. */
export const REPORT = { title: 'Colours', body: 'The needle was in the second haystack.' }

export const kotone = CAST.find((one) => one.id === 'kotone')!

/**
 * Everything a test file needs to put a window on screen, called once per
 * file so its beforeEach/afterEach/afterAll are that file's own — a hook
 * registered from a module another file already imported never fires for
 * this one, since the module that does the registering only runs once.
 */
export function windowTestKit() {
  // Whoever the master last sent for, put back afterwards: sending for one of
  // them writes her down for the next window, and the window these tests open
  // is reading the same note. Every window here opens on ことね, so that is
  // what each test starts from regardless of who an earlier one sent for.
  const kept = remembered()
  afterAll(() => remember(kept))
  beforeEach(() => remember(kotone))
  // And whatever she was last asked to answer in, the same way: every window
  // here opens having been asked for nothing, so a test that asks for
  // something is the only reason one of these is ever answering in it.
  const asked = spoken()
  afterAll(() => speak(asked))
  beforeEach(() => speak(null))

  /** Every window a test opened, so the next test starts on an empty terminal
   * rather than on top of the last one's. */
  const opened: { renderer: { destroy(): void } }[] = []
  afterEach(() => {
    for (const setup of opened.splice(0)) setup.renderer.destroy()
  })

  /**
   * The whole window over a stand-in, with the keyboard to drive it by.
   *
   * The terminal speaks the kitty keyboard protocol, because a bare ESC byte
   * is the start of every other escape sequence and a mock terminal swallows
   * it waiting for the rest — and ESC is the key that puts most of this
   * window away.
   *
   * Everything pressed or said is settled before the screen is looked at:
   * what is being checked is what the window did about it, and that is an
   * effect rather than a render.
   */
  async function onScreen(terminal = TERMINAL) {
    // Every session the window has opened, in order: swapping her or moving
    // her closes one and opens another.
    const sessions: Stand[] = []
    const setup = await testRender(
      <App
        behind={undefined}
        open={(say, who, folder, speaks) => {
          const her = new Stand(say, who, folder, speaks)
          sessions.push(her)
          return her
        }}
      />,
      { ...terminal, kittyKeyboard: true },
    )
    opened.push(setup)
    const settle = async (work: () => void | Promise<void>) => {
      await act(async () => void (await work()))
      await setup.flush()
    }
    await act(async () => void (await setup.flush()))
    const keys = setup.mockInput
    // Whoever is standing there now: after a swap or a move that is the girl
    // who walked in, not the one whose session was closed behind her.
    const now = () => sessions[sessions.length - 1]!
    // Everything the window handed the terminal for its clipboard, in order.
    // The mock terminal has no clipboard to read back; what is checked is
    // what went out through the one door there is.
    const clipboard: string[] = []
    setup.renderer.copyToClipboardOSC52 = (text: string) => {
      clipboard.push(text)
      return true
    }
    return {
      her: sessions[0]!,
      sessions,
      clipboard,
      /** Something done to the window from outside it, settled before the
       * screen is looked at: moving the clock on, the same as pressing a
       * key. */
      settle,
      /** The terminal saying it will not take a clipboard write. */
      refuseClipboard: () => {
        setup.renderer.copyToClipboardOSC52 = () => false
      },
      frame: () => setup.captureCharFrame(),
      /** A drag with the mouse over some words on screen, let go of just past
       * the end of them: the renderer takes the cell it is let go of on as
       * the edge of the selection rather than part of it. */
      dragOver: (words: string) => {
        const rows = setup.captureCharFrame().split('\n')
        const y = rows.findIndex((row) => row.includes(words))
        const x = rows[y]!.indexOf(words)
        return settle(() => setup.mockMouse.drag(x, y, x + words.length, y))
      },
      wakeUp: () => settle(() => now().wakeUp()),
      giveUp: () => settle(() => now().giveUp()),
      getStuck: () => settle(() => now().getStuck()),
      raise: (event: BridgeEvent) => settle(() => now().raise(event)),
      /** Held with Ctrl, which is how every key that opens one of these is
       * pressed. */
      hold: (key: string) => settle(() => keys.pressKey(key, { ctrl: true })),
      /** A letter on its own: the ones that answer her question, and the one
       * that opens her again. */
      press: (key: string) => settle(() => keys.pressKey(key)),
      type: (text: string) => settle(() => keys.typeText(text)),
      /** Put in all at once, the way a terminal hands over a paste it has
       * wrapped: one event carrying the whole of it. */
      paste: (text: string) => settle(() => keys.pasteBracketedText(text)),
      /** Put in all at once by a terminal that does not wrap pastes: the
       * bytes arrive as one chunk and are read as keys, a newline among them
       * as Enter. */
      drop: (text: string) => settle(() => keys.pressKeys([text])),
      enter: () => settle(() => keys.pressEnter()),
      escape: () => settle(() => keys.pressEscape()),
      tab: () => settle(() => keys.pressTab()),
      arrow: (way: 'up' | 'down' | 'left') => settle(() => keys.pressArrow(way)),
    }
  }

  return { onScreen }
}

/** Somewhere to move her that is a real folder — the window refuses to open
 * a session onto one that is not there — and is gone again afterwards. Only
 * moving her writes the master's folders down, so only the test file that
 * does that needs this. */
export function elsewhereFolder() {
  const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-window-')))
  const NOTE = path.join(os.homedir(), '.openchan', 'folders')
  const note = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : null
  afterAll(() => {
    fs.rmSync(elsewhere, { recursive: true, force: true })
    if (note === null) fs.rmSync(NOTE, { force: true })
    else fs.writeFileSync(NOTE, note)
  })
  return elsewhere
}
