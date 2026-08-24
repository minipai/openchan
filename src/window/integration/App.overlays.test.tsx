import { expect, test } from 'bun:test'
import { LOST, MODELS, STUCK } from '../../opencode/stand'
import { REPORT, windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

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

test('a letter pressed at what she wrote is not a yes to a tool she asked about', async () => {
  const { her, wakeUp, type, enter, raise, hold, press, escape, frame } = await onScreen()
  await wakeUp()
  await type('tidy up')
  await enter()
  await raise({ kind: 'reports', report: REPORT })
  await raise({
    kind: 'ask-permission',
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf node_modules',
  })

  // The page goes over the box she asks from, so what she is asking for is not
  // on screen — and y, pressed at the page, grants nothing.
  await hold('r')
  expect(frame()).toContain('needle')
  // The row of keys that answer her goes with it: none of them are hers while
  // the page has the keyboard, so none of them are printed as though they were.
  expect(frame()).not.toContain('y let her')
  await press('y')
  expect(her.answered).toEqual([])

  // Put it away and she is still waiting, with the same question.
  await escape()
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
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
  expect(frame()).toContain(`● ${MODELS[0]!.label}`)
  await arrow('down')

  await hold('g')
  expect(frame()).toContain('Who is on shift')
  expect(frame()).not.toContain(`● ${MODELS[0]!.label}`)
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
  expect(frame()).not.toContain(`● ${MODELS[0]!.label}`)

  await hold('k')
  expect(frame()).not.toContain('put these away')
  // And the list they displaced does not come back with them. Looked for as a
  // row rather than as a name: what she is thinking with is written on the
  // strip above her box too, and that does not go away with the list.
  expect(frame()).not.toContain(`● ${MODELS[0]!.label}`)
})

test('what she wrote and a list do not stand on each other', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'reports', report: REPORT })

  await hold('r')
  expect(frame()).toContain('needle')

  await hold('p')
  expect(frame()).toContain(`● ${MODELS[0]!.label}`)
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
