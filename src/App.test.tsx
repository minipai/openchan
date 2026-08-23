import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import type { Expression } from './cast'
import { spriteColumns } from './SpriteLayer'

/**
 * Her, written down rather than drawn.
 *
 * The real sprite goes out through the terminal's graphics protocol and never
 * lands in the character grid, so the face the window hands it could not be
 * read off the screen — which is how that one line went untested while the
 * rest of the window was not. This one puts the face into the grid as a word,
 * worded so that finding it on screen means that and nothing else.
 */
mock.module('./SpriteLayer', () => ({
  spriteColumns,
  SpriteLayer: ({ expression }: { expression: Expression }) => (
    <box position="absolute" top={0} left={0}>
      <text>{`her face is ${expression}`}</text>
    </box>
  ),
}))

import { App } from './App'
import { CAST, remember, remembered } from './cast'
import { OPENED_IN } from './folder'
import type { BridgeEvent } from './protocol'
import { LOST, MODELS, Stand, STUCK } from './stand'

/** What a terminal is unless someone has resized it. */
const TERMINAL = { width: 80, height: 24 }

/** What she wrote this turn, worded so that finding it on screen means that and
 * nothing else. */
const REPORT = { title: 'Colours', body: 'The needle was in the second haystack.' }

/** Whoever the master last sent for, put back afterwards: sending for one of
 * them writes her down for the next window, and the window these tests open is
 * reading the same note. */
const kept = remembered()
afterAll(() => remember(kept))
/** Every window here opens on ことね, whoever the last test sent for. */
const kotone = CAST.find((one) => one.id === 'kotone')!
beforeEach(() => remember(kotone))

/** Somewhere to move her that is a real folder — the window refuses to open a
 * session onto one that is not there — and is gone again afterwards. */
const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-window-')))
/** The note the master's own windows read, put back exactly as it was found:
 * moving her writes the folders down, and this folder is nobody's. */
const NOTE = path.join(os.homedir(), '.openchan', 'folders')
const note = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : null
afterAll(() => {
  fs.rmSync(elsewhere, { recursive: true, force: true })
  if (note === null) fs.rmSync(NOTE, { force: true })
  else fs.writeFileSync(NOTE, note)
})

/** Every window a test opened, so the next test starts on an empty terminal
 * rather than on top of the last one's. */
const opened: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of opened.splice(0)) setup.renderer.destroy()
})

/**
 * The whole window over a stand-in, with the keyboard to drive it by.
 *
 * The terminal speaks the kitty keyboard protocol, because a bare ESC byte is
 * the start of every other escape sequence and a mock terminal swallows it
 * waiting for the rest — and ESC is the key that puts most of this window away.
 *
 * Everything pressed or said is settled before the screen is looked at: what
 * is being checked is what the window did about it, and that is an effect
 * rather than a render.
 */
async function onScreen() {
  // Every session the window has opened, in order: swapping her or moving her
  // closes one and opens another.
  const sessions: Stand[] = []
  const setup = await testRender(
    <App
      behind={undefined}
      open={(say, who, folder) => {
        const her = new Stand(say, who, folder)
        sessions.push(her)
        return her
      }}
    />,
    { ...TERMINAL, kittyKeyboard: true },
  )
  opened.push(setup)
  const settle = async (work: () => void | Promise<void>) => {
    await act(async () => void (await work()))
    await setup.flush()
  }
  await act(async () => void (await setup.flush()))
  const keys = setup.mockInput
  // Whoever is standing there now: after a swap or a move that is the girl who
  // walked in, not the one whose session was closed behind her.
  const now = () => sessions[sessions.length - 1]!
  return {
    her: sessions[0]!,
    sessions,
    frame: () => setup.captureCharFrame(),
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
    enter: () => settle(() => keys.pressEnter()),
    escape: () => settle(() => keys.pressEscape()),
    tab: () => settle(() => keys.pressTab()),
    arrow: (way: 'up' | 'down') => settle(() => keys.pressArrow(way)),
  }
}

test('the line says she is not up yet, and what was said to her waits', async () => {
  const { her, wakeUp, type, enter, frame } = await onScreen()
  expect(frame()).toContain('Waking her up…')

  await type('are you there?')
  await enter()

  // Kept above the box rather than in the input, where the next thing typed
  // would have wiped it.
  expect(her.asked).toEqual([])
  expect(frame()).toContain('waiting for her to wake up')

  await wakeUp()

  expect(her.asked).toEqual(['are you there?'])
  expect(frame()).not.toContain('waiting for her to wake up')
})

test('a sentence typed and sent reaches her, and she is put to work', async () => {
  const { her, wakeUp, type, enter, frame } = await onScreen()
  await wakeUp()
  expect(frame()).toContain('Say something to her…')

  await type('good morning')
  await enter()

  expect(her.asked).toEqual(['good morning'])
  // Working, and the line is hers again: the sentence is gone from it and the
  // corner says how to stop her.
  expect(frame()).toContain('is thinking…')
  expect(frame()).toContain('ESC stop her')
  expect(frame()).not.toContain('good morning')
})

test('ESC stops her, and the line is hers to be spoken to on again', async () => {
  const { her, wakeUp, type, enter, escape, frame } = await onScreen()
  await wakeUp()
  await type('good morning')
  await enter()

  await escape()

  expect(her.interrupted).toBe(1)
  expect(frame()).not.toContain('is thinking…')
  expect(frame()).toContain('Say something to her…')
})

test('her line, and the face and mood she signed it with, land in the box', async () => {
  const { wakeUp, type, enter, raise, frame } = await onScreen()
  await wakeUp()
  expect(frame()).toContain('her face is neutral')
  await type('good morning')
  await enter()

  await raise({ kind: 'says', line: 'Good morning, master.' })
  expect(frame()).toContain('Good morning, master.')

  await raise({
    kind: 'says',
    line: 'Good morning, master.',
    expression: 'happy',
    mood: '【 開心 ＼(ˆ ᗜ ˆ)／ 】',
  })
  await raise({ kind: 'done' })

  // The mood takes the corner her waiting line had, once she has stopped, and
  // the face goes to the sprite — the stand-in one, which writes it down.
  expect(frame()).toContain('【 開心 ＼(ˆ ᗜ ˆ)／ 】')
  expect(frame()).toContain('her face is happy')
  expect(frame()).not.toContain('her face is neutral')
  expect(frame()).not.toContain('is thinking…')
})

/** Her, mid-turn, asking to be allowed something. */
async function asking(detail?: string) {
  const window = await onScreen()
  await window.wakeUp()
  await window.type('tidy up')
  await window.enter()
  await window.raise({
    kind: 'ask-permission',
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf node_modules',
    detail,
  })
  return window
}

test('a tool she is waiting to be allowed is let her from the keyboard, and the question goes', async () => {
  const { her, press, frame } = await asking()
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')
  expect(frame()).toContain('y let her')

  await press('y')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(frame()).not.toContain('She wants to use bash')
  // And she is still at it: answering the question is not the end of the turn.
  expect(frame()).toContain('ESC stop her')
})

test('a tool she is waiting to be allowed is refused from the keyboard', async () => {
  const { her, press, frame } = await asking()

  await press('n')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: false }])
  expect(frame()).not.toContain('She wants to use bash')
})

test('the whole of what she would do opens over the question, and shuts again', async () => {
  const { tab, frame } = await asking('rm -rf node_modules\nrm -rf dist')
  expect(frame()).not.toContain('rm -rf dist')

  await tab()
  expect(frame()).toContain('rm -rf dist')
  // The question is unchanged under it.
  expect(frame()).toContain('y let her')

  await tab()
  expect(frame()).not.toContain('rm -rf dist')
})

test('a list is opened, moved through, and the row taken has taken', async () => {
  const { her, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  expect(frame()).toContain('What she thinks with')
  expect(frame()).toContain(`● ${MODELS[0]!.label}`)

  await arrow('down')
  await enter()

  expect(her.handed).toEqual([MODELS[1]!.id])
  expect(frame()).not.toContain('What she thinks with')

  // Marked the next time the list is opened — by what she reported back, not
  // by what was pressed — and the list opens on it.
  await hold('p')
  expect(frame()).toContain(`▶ ● ${MODELS[1]!.label}`)
})

test('sending for one of the others off the list puts her on shift', async () => {
  const { her, sessions, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  expect(frame()).toContain('╭─ ことね')

  await hold('g')
  expect(frame()).toContain('Who is on shift')
  await arrow('down')
  await enter()

  // Nothing had been said, so she comes out now: a different session, with the
  // other girl's name on the plate.
  expect(her.closed).toBe(true)
  expect(sessions.map((one) => one.who.id)).toEqual(['kotone', 'kurumi'])
  expect(frame()).not.toContain('Who is on shift')
  expect(frame()).toContain('╭─ くるみ')
})

test('sending for one of the others mid-conversation says who is next', async () => {
  const { her, sessions, wakeUp, type, enter, hold, arrow, frame } = await onScreen()
  await wakeUp()
  await type('good morning')
  await enter()

  await hold('g')
  await arrow('down')
  await enter()

  // This conversation is hers to finish: nobody walks in, and the screen says
  // who is waiting rather than leaving the pick looking like it did nothing.
  expect(her.closed).toBe(false)
  expect(sessions).toHaveLength(1)
  expect(frame()).toContain('╭─ ことね')
  expect(frame()).toContain('くるみ takes the next shift')
})

/** The line a folder is typed out on, reached the way it is reached: off the
 * last row of the list, which is the one that is not a folder. */
async function typingAPath() {
  const window = await onScreen()
  await window.wakeUp()
  await window.hold('f')
  expect(window.frame()).toContain('Where she works')
  expect(window.frame()).toContain('Type a path…')
  // The list wraps, so up from the top is the last row — checked before Enter,
  // which on any other row would move her somewhere real.
  await window.arrow('up')
  expect(window.frame()).toContain('▶   Type a path…')
  await window.enter()
  expect(window.frame()).toContain('Enter work there')
  return window
}

test('a folder typed out that is not there is refused with the reason, and she is not closed', async () => {
  const { her, sessions, type, enter, frame } = await typingAPath()

  await type(path.join(elsewhere, 'nowhere'))
  await enter()

  expect(frame()).toContain('There is no folder there')
  // Still a line to type on: the mistake is answered by fixing it.
  expect(frame()).toContain('Enter work there')
  expect(her.closed).toBe(false)
  expect(sessions).toHaveLength(1)
})

test('a folder typed out that is there is moved to', async () => {
  const { her, sessions, type, enter, frame } = await typingAPath()

  await type(elsewhere)
  await enter()

  expect(frame()).not.toContain('Enter work there')
  expect(her.closed).toBe(true)
  expect(sessions.map((one) => one.folder)).toEqual([OPENED_IN, elsewhere])
})

test('something she wrote is opened and put away, and her line is still there under it', async () => {
  const { wakeUp, type, enter, raise, hold, escape, frame } = await onScreen()
  await wakeUp()
  await type('where was it?')
  await enter()
  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'reports', report: REPORT })
  await raise({ kind: 'done' })
  expect(frame()).toContain('Ctrl-R read what she wrote')
  expect(frame()).not.toContain('needle')

  await hold('r')
  expect(frame()).toContain('needle')
  expect(frame()).toContain('ESC put it away')

  await escape()
  expect(frame()).not.toContain('needle')
  expect(frame()).toContain('I found it.')
  // And the page is still there to open again.
  expect(frame()).toContain('Ctrl-R read what she wrote')
})

test('a page taken back from under the reader takes the reader with it', async () => {
  const { wakeUp, raise, hold, type, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'reports', report: REPORT })
  await hold('r')
  expect(frame()).toContain('needle')

  // What looked like a heading until its next character arrived: the page is
  // withdrawn while it is open.
  await raise({ kind: 'reports', report: null })

  // Nothing is standing there any more — the line is hers to type on, rather
  // than blurred behind a reader with no page in it.
  expect(frame()).not.toContain('needle')
  await type('hello')
  expect(frame()).toContain('hello')
})

test('the keys cover the scene, and uncover it', async () => {
  const { wakeUp, hold, escape, frame } = await onScreen()
  await wakeUp()

  await hold('k')
  expect(frame()).toContain('Keys')
  expect(frame()).toContain('put these away')

  await escape()
  expect(frame()).not.toContain('put these away')
  expect(frame()).toContain('Say something to her…')
})

test('a session that went down can be opened again from the keyboard', async () => {
  const { her, giveUp, press, frame } = await onScreen()

  await giveUp()
  expect(frame()).toContain(LOST.title)
  expect(frame()).toContain('r try her again')
  expect(frame()).not.toContain('Waking her up…')

  await press('r')

  expect(her.retries).toBe(1)
  expect(frame()).not.toContain(LOST.title)
})

test('what she had said stays on screen through the connection going and coming back', async () => {
  const { wakeUp, raise, giveUp, press, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'The needle was in the second haystack.' })

  await giveUp()
  expect(frame()).toContain('The needle was in the second haystack.')

  // Opened again into the same conversation: her last line is still the last
  // thing she said, and the window has no reason to take it down.
  await press('r')
  await wakeUp()

  expect(frame()).toContain('The needle was in the second haystack.')
  expect(frame()).not.toContain(LOST.title)
  expect(frame()).toContain('Say something to her…')
})

test('something in the way that left her standing is put away with ESC', async () => {
  const { wakeUp, getStuck, escape, frame } = await onScreen()
  await wakeUp()

  await getStuck()
  expect(frame()).toContain(STUCK.title)
  expect(frame()).toContain('ESC put it away')

  await escape()

  expect(frame()).not.toContain(STUCK.title)
  expect(frame()).toContain('Say something to her…')
})

test('the list opened last is the only one standing', async () => {
  const { wakeUp, hold, arrow, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  expect(frame()).toContain(MODELS[0]!.label)
  await arrow('down')

  await hold('g')
  expect(frame()).toContain('Who is on shift')
  expect(frame()).not.toContain(MODELS[0]!.label)
  // And it is its own list: open on the one in force, not on the row the last
  // list was left on.
  expect(frame()).toContain('▶ ● ことね')
})

test('the keys put away what was over the scene, and go away again', async () => {
  const { wakeUp, hold, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  await hold('k')
  expect(frame()).toContain('put these away')
  expect(frame()).not.toContain(MODELS[0]!.label)

  await hold('k')
  expect(frame()).not.toContain('put these away')
  // And the list they displaced does not come back with them.
  expect(frame()).not.toContain(MODELS[0]!.label)
})

test('what she wrote and a list do not stand on each other', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'reports', report: REPORT })

  await hold('r')
  expect(frame()).toContain('needle')

  await hold('p')
  expect(frame()).toContain(MODELS[0]!.label)
  expect(frame()).not.toContain('needle')
})

test('nothing said reaches her line while something is over it', async () => {
  const { wakeUp, hold, enter, type, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  await type('hello')
  expect(frame()).not.toContain('hello')

  // And the line has it back the moment the list is off the screen.
  await enter()
  await type('hello')
  expect(frame()).toContain('hello')
})
