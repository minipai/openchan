import { expect } from 'bun:test'
import { OPENED_IN } from '../../between/folder'
import { MODELS, TALKS } from '../../opencode/stand'
import { kotone, windowTestKit } from './windowTestKit'

const { onScreen, test } = windowTestKit()

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
