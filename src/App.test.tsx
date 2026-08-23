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

import { App, LINE_HOLDS } from './App'
import { CAST, remember, remembered } from './cast'
import { OPENED_IN } from './folder'
import type { BridgeEvent } from './protocol'
import { LOST, MODELS, Stand, STUCK, TALKS } from './stand'

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
  // Everything the window handed the terminal for its clipboard, in order.
  // The mock terminal has no clipboard to read back; what is checked is what
  // went out through the one door there is.
  const clipboard: string[] = []
  setup.renderer.copyToClipboardOSC52 = (text: string) => {
    clipboard.push(text)
    return true
  }
  return {
    her: sessions[0]!,
    sessions,
    clipboard,
    /** The terminal saying it will not take a clipboard write. */
    refuseClipboard: () => {
      setup.renderer.copyToClipboardOSC52 = () => false
    },
    frame: () => setup.captureCharFrame(),
    /** A drag with the mouse over some words on screen, let go of just past
     * the end of them: the renderer takes the cell it is let go of on as the
     * edge of the selection rather than part of it. */
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
    /** Put in all at once by a terminal that does not wrap pastes: the bytes
     * arrive as one chunk and are read as keys, a newline among them as
     * Enter. */
    drop: (text: string) => settle(() => keys.pressKeys([text])),
    enter: () => settle(() => keys.pressEnter()),
    escape: () => settle(() => keys.pressEscape()),
    tab: () => settle(() => keys.pressTab()),
    arrow: (way: 'up' | 'down' | 'left') => settle(() => keys.pressArrow(way)),
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

test('a sentence pasted in is sent by Enter, the same as one typed', async () => {
  const { her, wakeUp, paste, enter, frame } = await onScreen()
  await wakeUp()

  await paste('good morning')
  await enter()

  expect(her.asked).toEqual(['good morning'])
  expect(frame()).not.toContain('good morning')
})

test('a paste landing in the middle of what was typed keeps both', async () => {
  const { her, wakeUp, type, paste, arrow, enter } = await onScreen()
  await wakeUp()

  await type('good evening')
  for (let i = 0; i < 'evening'.length; i++) await arrow('left')
  await paste('morning, not ')
  await enter()

  expect(her.asked).toEqual(['good morning, not evening'])
})

test('a sentence dropped in with its Enter, by a terminal that does not wrap pastes, is sent', async () => {
  const { her, wakeUp, drop, type, enter, frame } = await onScreen()
  await wakeUp()

  // Every byte of it lands before the window has drawn once: the sentence and
  // the Enter at the end of it in the same breath. Enter is the carriage
  // return — the byte the key sends, and not the one a line break is.
  await drop('good morning\r')

  expect(her.asked).toEqual(['good morning'])
  // And the line is empty for the next thing, not still holding a sentence she
  // already has.
  expect(frame()).not.toContain('good morning')
  await type('and again')
  await enter()
  expect(her.asked).toEqual(['good morning', 'and again'])
})

test('a paste with lines in it is one prompt, with its lines, sent once', async () => {
  const { her, wakeUp, paste, enter, frame } = await onScreen()
  await wakeUp()

  await paste('line one\nline two\nline three')
  // On the line, where it can still be read over and typed at, with each break
  // written down rather than dropped.
  expect(frame()).toContain('line one↵line two↵line three')

  await enter()

  expect(her.asked).toEqual(['line one\nline two\nline three'])
})

test('the same paste, by a terminal that does not wrap it, is still one prompt', async () => {
  const { her, wakeUp, drop, enter } = await onScreen()
  await wakeUp()

  // Read as keys, one at a time, a line break among them being the key it is
  // rather than the Enter it is not.
  await drop('line one\nline two\nline three')
  await enter()

  expect(her.asked).toEqual(['line one\nline two\nline three'])
})

test('a paste with more in it than the line will hold says what did not fit', async () => {
  const { her, wakeUp, paste, enter, frame } = await onScreen()
  await wakeUp()

  await paste('x'.repeat(LINE_HOLDS - 4))
  await paste('a page too far')

  // Four of the fourteen fit on the end of it; the ten that did not are said to
  // be gone, rather than quietly not arriving.
  expect(frame()).toContain('the last 10 characters would not fit')

  await enter()
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS - 4) + 'a pa'])
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

test('a selection made with the mouse reaches the clipboard when it is let go of', async () => {
  const { wakeUp, raise, dragOver, clipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'The needle was in the second haystack.' })
  await raise({ kind: 'done' })

  await dragOver('needle was in the second')
  // The words dragged over and nothing else — not the rest of her line, and
  // not the cell the drag was let go of on.
  expect(clipboard).toEqual(['needle was in the second'])
  expect(frame()).toContain('copied the selection')
})

test('her whole line is copied from the keyboard, as she said it', async () => {
  const { wakeUp, raise, hold, clipboard, frame } = await onScreen()
  await wakeUp()
  // Nothing to copy yet, so nothing is copied and nothing is said about it.
  await hold('y')
  expect(clipboard).toEqual([])
  expect(frame()).not.toContain('copied')

  await raise({ kind: 'says', line: 'Good morning, master.\nThe needle was in the second haystack.' })
  await raise({ kind: 'done' })
  await hold('y')
  // As she said it, with the break between her two lines — not as the box
  // wrapped it.
  expect(clipboard).toEqual(['Good morning, master.\nThe needle was in the second haystack.'])
  expect(frame()).toContain('copied her line')
})

test('while what she wrote is open, the same key copies the page', async () => {
  const { wakeUp, raise, hold, clipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'reports', report: REPORT })
  await raise({ kind: 'done' })

  await hold('r')
  await hold('y')
  expect(clipboard).toEqual([REPORT.body])
  // Said under the page rather than behind it.
  expect(frame()).toContain('copied the page')
  expect(frame()).toContain('ESC put it away')
})

test('a terminal that will not take a clipboard write is said to have refused', async () => {
  const { wakeUp, raise, hold, refuseClipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'done' })

  refuseClipboard()
  await hold('y')
  expect(frame()).not.toContain('copied')
  expect(frame()).toContain('this terminal will not take a clipboard write')
})

test('the key that copies her line is listed, and takes nothing from the line she is spoken to on', async () => {
  const { wakeUp, raise, hold, type, escape, frame } = await onScreen()
  await wakeUp()
  await hold('k')
  expect(frame()).not.toContain('copy her line')
  await escape()

  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'done' })
  await hold('k')
  expect(frame()).toContain('Ctrl-Y')
  expect(frame()).toContain('copy her line')
  // Pressed from there, with the keys still up: what it says is in the strip
  // under the box, whole, rather than half behind the keys.
  await hold('y')
  expect(frame()).toContain('copied her line')
  expect(frame()).toContain('Ctrl-Y')
  await escape()

  // Half a sentence, the key, and the rest of it: nothing typed is lost to it.
  await type('where was')
  await hold('y')
  await type(' it?')
  expect(frame()).toContain('where was it?')
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

test('a half-written sentence is still on the line once her question has been answered', async () => {
  const { her, wakeUp, type, enter, raise, press, frame } = await onScreen()
  await wakeUp()
  await type('tidy up')
  await enter()

  // Typed ahead while she works, and then her question takes the line's place
  // in the box. The line comes back with the sentence on it, not empty.
  await type('half written')
  await raise({ kind: 'ask-permission', askId: 'ask-1', toolName: 'bash', summary: 'ls', detail: '' })
  expect(frame()).not.toContain('half written')
  await press('y')

  expect(frame()).toContain('half written')
  await type(' and sent')
  await enter()
  expect(her.asked).toEqual(['tidy up', 'half written and sent'])
})

test('a paste while she is waiting to be allowed something is not hers to take', async () => {
  const { her, paste, drop, press, frame } = await asking()

  // The line is not on screen — her question is drawn in its place — so what
  // is pasted goes nowhere rather than onto a line nobody can see, and the
  // question is still the thing being answered.
  await paste('good morning\nand good evening')
  // The same paste from a terminal that does not wrap one, which arrives as
  // keys: the break in it is not a line to write anywhere either.
  await drop('later\n')
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')

  await press('y')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  // Nothing else was said to her: the sentence she is working on is the one
  // that put her to work.
  expect(her.asked).toEqual(['tidy up'])
  // And the line, back in its place, is empty rather than holding what was
  // pasted at something else.
  expect(frame()).not.toContain('good morning')
  expect(frame()).not.toContain('later')
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

/** Her question with the answers written out, as she asks it. */
const WHICH = {
  header: 'Which first',
  question: 'Which of these should I start on?',
  options: [
    { label: 'The tests', description: 'They are what is red.' },
    { label: 'The docs' },
    { label: 'The release' },
  ],
  multiple: false,
}
const WHICH_ONES = { ...WHICH, header: 'Which ones', question: 'Which of these are worth doing at all?', multiple: true }

/** Her, mid-turn, asking for something to be picked. */
async function choosing(...questions: (typeof WHICH)[]) {
  const window = await onScreen()
  await window.wakeUp()
  await window.type('tidy up')
  await window.enter()
  await window.raise({ kind: 'ask-choice', askId: 'ask-2', questions })
  return window
}

test('a question with choices is on screen as a list, and the row taken is her answer', async () => {
  const { her, frame, arrow, enter } = await choosing(WHICH)

  // The question, under the few words it goes by, with what she had to say
  // about a row under the row.
  expect(frame()).toContain('Which first')
  expect(frame()).toContain('Which of these should I start on?')
  expect(frame()).toContain('The tests')
  expect(frame()).toContain('They are what is red.')
  // She is still at it underneath — the corner says what ESC does from here.
  expect(frame()).toContain('ESC never mind')

  await arrow('down')
  await enter()

  // One question, one row: the answer is the label, as she wrote it.
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The docs']] }])
  expect(frame()).not.toContain('Which of these should I start on?')
  // And she is still at it: answering is not the end of the turn.
  expect(frame()).toContain('ESC stop her')
})

test('a question that takes several is ticked, and Enter hands back whatever is ticked', async () => {
  const { her, frame, press, arrow, enter } = await choosing(WHICH_ONES)

  expect(frame()).toContain('☐ The tests')
  expect(frame()).toContain('Space tick it')

  await press(' ')
  await arrow('down')
  await arrow('down')
  await press(' ')
  expect(frame()).toContain('☑ The tests')
  expect(frame()).toContain('☐ The docs')
  expect(frame()).toContain('☑ The release')
  // Ticking is not answering.
  expect(her.chosen).toEqual([])

  await enter()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests', 'The release']] }])
  expect(frame()).not.toContain('Which of these are worth doing')
})

test('a question put away with ESC is declined, not answered', async () => {
  const { her, frame, arrow, escape } = await choosing(WHICH)

  // Moved onto a row first: the one thing a cancel must not do is hand back
  // whatever the list happened to be on.
  await arrow('down')
  await escape()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: 'declined' }])
  expect(frame()).not.toContain('Which of these should I start on?')
  // ESC went to the question, not past it to her: she is still working.
  expect(her.interrupted).toBe(0)
  expect(frame()).toContain('ESC stop her')
})

test('ticks made and then put away with ESC are not an answer either', async () => {
  const { her, press, escape } = await choosing(WHICH_ONES)

  await press(' ')
  await escape()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: 'declined' }])
})

test('several questions asked at once are taken one at a time and handed back together', async () => {
  const { her, frame, arrow, press, enter, escape } = await choosing(WHICH, WHICH_ONES)

  expect(frame()).toContain('Which of these should I start on?')
  await arrow('down')
  await enter()

  // The first is answered and kept; the second is up, starting from nothing.
  expect(her.chosen).toEqual([])
  expect(frame()).toContain('Which of these are worth doing at all?')
  expect(frame()).not.toContain('☑')

  await press(' ')
  await enter()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The docs'], ['The tests']] }])

  // And declining halfway through declines the whole of it: she asked them
  // together, and half an answer is not what she asked for.
  await her.raise({ kind: 'ask-choice', askId: 'ask-3', questions: [WHICH, WHICH_ONES] })
  await enter()
  await escape()
  expect(her.chosen[1]).toEqual({ askId: 'ask-3', answers: 'declined' })
})

test('what the window opens goes over her question, and it is back as it was left', async () => {
  const { her, frame, hold, escape, arrow, press, enter } = await choosing(WHICH_ONES)

  // A tick made, and the highlight moved off it, before the list is covered.
  await press(' ')
  await arrow('down')
  expect(frame()).toContain('☑ The tests')

  await hold('p')
  expect(frame()).toContain('What she thinks with')
  expect(frame()).not.toContain('Which of these are worth doing')
  // The keys the covered list answers to are not answered while it is covered:
  // Space here would otherwise tick a row nobody can see.
  await press(' ')

  // ESC puts the model list away, and only that: the question is still hers
  // to answer, not declined by a key aimed at something else.
  await escape()
  expect(frame()).toContain('Which of these are worth doing')
  expect(her.chosen).toEqual([])
  // The tick is still there, and the highlight is where it was — so Enter
  // hands back what was ticked rather than an answer of nothing.
  expect(frame()).toContain('☑ The tests')
  expect(frame()).toContain('☐ The docs')

  await press(' ')
  await enter()
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests', 'The docs']] }])
})

test('something in the way goes over her question, and ESC is the note’s rather than a decline', async () => {
  const { her, frame, getStuck, escape, enter } = await choosing(WHICH)

  await getStuck()
  expect(frame()).toContain(STUCK.title)
  expect(frame()).not.toContain('Which of these should I start on?')

  // Putting the note away declines nothing; the question is back to be
  // answered, as it still is on the server.
  await escape()
  expect(her.chosen).toEqual([])
  expect(frame()).not.toContain(STUCK.title)
  expect(frame()).toContain('Which of these should I start on?')

  await enter()
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests']] }])
})

test('the line she is spoken to on does not take Enter while her question is up', async () => {
  const { her, type, enter } = await choosing(WHICH)

  await type('never mind that')
  await enter()

  // Enter took the row, not the sentence.
  expect(her.asked).toEqual(['tidy up'])
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests']] }])
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

test('a list with nothing in it yet takes no letters, so opening her again still works from inside it', async () => {
  // She went down before she ever said what she can think with, so the list
  // opens empty. Nothing there to narrow — and r has to go on meaning the one
  // way out, rather than being swallowed as a letter by a list that would not
  // have taken it anyway.
  const { her, giveUp, hold, press, frame } = await onScreen()
  await giveUp()

  await hold('p')
  expect(frame()).toContain('Nothing to pick from yet')
  expect(frame()).not.toContain('narrow it')

  await press('r')
  expect(her.retries).toBe(1)
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
  const { wakeUp, hold, escape, type, frame } = await onScreen()
  await wakeUp()

  // The list of who is on shift cannot be typed at, so the letters go nowhere.
  await hold('g')
  await type('hello')
  expect(frame()).not.toContain('hello')

  // And the line has it back the moment the list is off the screen.
  await escape()
  await type('hello')
  expect(frame()).toContain('hello')
})

test('the list of models is narrowed by typing, and ESC takes the typing back before the list', async () => {
  const { her, wakeUp, hold, escape, type, enter, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  await type('opus')
  expect(frame()).toContain('› opus')
  expect(frame()).toContain(MODELS[1]!.label)
  expect(frame()).not.toContain(MODELS[0]!.label)

  // The first ESC clears what was typed: the rows are back, the list is still
  // up, open on the one in force.
  await escape()
  expect(frame()).toContain('What she thinks with')
  expect(frame()).toContain(`▶ ● ${MODELS[0]!.label}`)
  expect(frame()).not.toContain('› opus')

  // The second puts it away, as it always did.
  await escape()
  expect(frame()).not.toContain('What she thinks with')

  // Narrowed down to the one row, Enter takes it.
  await hold('p')
  await type('opus')
  await enter()
  expect(her.handed).toEqual([MODELS[1]!.id])
  // Opened again, the list is the whole list: the last search is not a
  // question anyone is still asking.
  await hold('p')
  expect(frame()).toContain(MODELS[0]!.label)
  expect(frame()).not.toContain('› opus')
})

test('a letter typed at the list of models is not an answer to what she is waiting to be allowed', async () => {
  const { her, hold, type, escape, press, frame } = await asking()

  await hold('p')
  await type('any')
  expect(her.answered).toEqual([])
  expect(frame()).toContain('› any')

  // Her question is still there to be answered once the list is away.
  await escape()
  await escape()
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
})

test('the conversations had in this folder are a list, newest first, with the one she is in marked', async () => {
  const { wakeUp, hold, frame } = await onScreen()
  await wakeUp()

  await hold('o')
  expect(frame()).toContain('What you talked about before')
  // The one she is in is where the list opens, marked.
  expect(frame()).toContain(`▶ ● ${TALKS[0]!.title}`)
  expect(frame()).toContain(TALKS[1]!.title)
  // And under each row, the thing that tells two of them apart.
  expect(frame()).toContain('1 hour ago')
  expect(frame()).toContain('5 hours ago')
})

test('an earlier conversation taken off the list is picked up, and the box says where it was left', async () => {
  const { her, wakeUp, raise, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'the sky was grey' })

  await hold('o')
  await arrow('down')
  await enter()

  expect(her.resumed).toEqual([TALKS[1]!.id])
  expect(frame()).not.toContain('What you talked about before')
  // What was on screen belonged to the conversation being left.
  expect(frame()).not.toContain('the sky was grey')
  expect(frame()).toContain(`we left off on ${TALKS[1]!.title}`)

  // And the list marks the one she is in now, not the one she was in.
  await hold('o')
  expect(frame()).toContain(`▶ ● ${TALKS[1]!.title}`)
})

test('the list put away with ESC leaves her in the conversation she was already in', async () => {
  const { her, wakeUp, raise, hold, arrow, escape, type, enter, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'the sky was grey' })

  await hold('o')
  await arrow('down')
  await escape()

  expect(her.resumed).toEqual([])
  expect(frame()).not.toContain('What you talked about before')
  // Nothing moved: her line is where it was, and the next thing said still
  // goes into the conversation it was typed into.
  expect(frame()).toContain('the sky was grey')
  await type('and now?')
  await enter()
  expect(her.asked).toEqual(['and now?'])
})

test('the list of conversations is narrowed by typing, the same as the models are', async () => {
  const { her, wakeUp, hold, type, enter, frame } = await onScreen()
  await wakeUp()

  await hold('o')
  await type('needle')
  expect(frame()).toContain('› needle')
  expect(frame()).toContain(TALKS[1]!.title)
  expect(frame()).not.toContain(TALKS[0]!.title)

  await enter()
  expect(her.resumed).toEqual([TALKS[1]!.id])
})

test('a list open while she works does not have its rows reordered under the highlight', async () => {
  const { her, wakeUp, raise, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()

  await hold('o')
  await arrow('down')
  expect(frame()).toContain(`▶   ${TALKS[1]!.title}`)

  // A turn finishing under it says the list again, and the conversation it
  // happened in goes back to the top. The row the highlight is on must not
  // become a different conversation while somebody is looking at it.
  await raise({ kind: 'talks', talks: [...TALKS].reverse(), current: TALKS[0]!.id })
  expect(frame()).toContain(`▶   ${TALKS[1]!.title}`)

  await enter()
  expect(her.resumed).toEqual([TALKS[1]!.id])
})

test('a new conversation is started from the keyboard, and she stays where she is', async () => {
  const { her, sessions, wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'the sky was grey' })

  await hold('n')

  // Nothing was torn down: one session throughout, the same girl in it, and
  // the same folder — a swap or a move is what opens a second one.
  expect(sessions).toHaveLength(1)
  expect(her.begun).toBe(1)
  expect(her.who).toBe(kotone)
  expect(her.folder).toBe(OPENED_IN)
  expect(frame()).toContain(kotone.name)
  // And the box is empty, because nothing has been said in this one.
  expect(frame()).not.toContain('the sky was grey')
  expect(frame()).toContain('Say something to her…')

  // What she thinks with is where it was left as well.
  await hold('p')
  expect(frame()).toContain(`▶ ● ${MODELS[0]!.label}`)
})

test('a new conversation started while she is working takes the box back from her', async () => {
  const { her, wakeUp, type, enter, raise, hold, frame } = await onScreen()
  await wakeUp()
  await type('what colour is the sky?')
  await enter()
  await raise({ kind: 'says', line: 'grey, mostly' })
  expect(frame()).toContain('grey, mostly')

  await hold('n')

  // Stopping her is the session's own to do — what the window is told is that
  // the conversation on screen is another one, and this one has nothing in it
  // and nothing going on in it.
  expect(her.begun).toBe(1)
  // Stopping her is the session's own to do, off the one key press — not the
  // window telling her twice.
  expect(her.interrupted).toBe(0)
  expect(frame()).not.toContain('grey, mostly')
  expect(frame()).not.toContain('is thinking…')
  expect(frame()).toContain('Say something to her…')
})

test('a new conversation can be started off the list of the earlier ones', async () => {
  const { her, wakeUp, raise, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'the sky was grey' })

  await hold('o')
  // Above the conversations, and so above the one she is in, which is where
  // the list opens.
  expect(frame()).toContain('Start a new conversation')
  await arrow('up')
  await enter()

  expect(her.begun).toBe(1)
  expect(her.resumed).toEqual([])
  expect(frame()).not.toContain('What you talked about before')
  expect(frame()).not.toContain('the sky was grey')

  // And the list marks the one she is in now, which is the new one.
  await hold('o')
  expect(frame()).toContain('▶ ● Nothing said in it yet')
})

test('a new conversation started off the list puts the list away with it', async () => {
  const { wakeUp, hold, frame } = await onScreen()
  await wakeUp()

  await hold('o')
  await hold('n')

  expect(frame()).not.toContain('What you talked about before')
})

test('the list opened before she is up still opens on the conversation she is in', async () => {
  const { wakeUp, hold, frame } = await onScreen()

  await hold('o')
  await wakeUp()

  // The row that starts a new one is above them, and a list that opened on it
  // would take Enter for a conversation nobody meant to leave.
  expect(frame()).toContain(`▶ ● ${TALKS[0]!.title}`)
})

test('a list of conversations with none in it yet is a list with nothing in it', async () => {
  const { her, hold, giveUp, press, frame } = await onScreen()

  await hold('o')
  await giveUp()

  // No rows is nothing to narrow, and the row that starts a new conversation
  // is not a row to narrow down to. So r is still the key that opens her
  // again, rather than a letter typed at a list.
  expect(frame()).not.toContain('type to narrow it')
  await press('r')
  expect(her.retries).toBe(1)
})
