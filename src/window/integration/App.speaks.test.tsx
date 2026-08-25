import { expect } from 'bun:test'
import { spoken } from '../../her/cast'
import { windowTestKit } from './windowTestKit'

const { onScreen, test } = windowTestKit()

/** What the list calls the two things a house written in English and 繁體中文
 * can be asked for, and the row that asks for neither. */
const CHINESE = '繁體中文'
const HOWEVER = 'however you write'

test('what she answers in is picked off a list, and she comes out answering in it', async () => {
  const { her, sessions, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()

  await hold('l')
  expect(frame()).toContain('What she answers in')
  // The list opens marked on what she is answering in now, which is nothing in
  // particular: English is one row down and 繁體中文 the row under that.
  expect(frame()).toContain(HOWEVER)
  await arrow('down')
  await arrow('down')
  await enter()

  // Nothing had been said, so the language walks in the way a girl does: this
  // session is closed and the next one is opened having been asked for it.
  expect(her.closed).toBe(true)
  expect(sessions.map((one) => one.speaks?.id ?? null)).toEqual([null, 'zh-Hant'])
  expect(frame()).not.toContain('What she answers in')
})

test('the words she is played from are the ones written in what she answers in', async () => {
  const { wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  await hold('l')
  await arrow('down')
  await arrow('down')
  await enter()

  // Her persona in that language, off the café package's own translated file —
  // the page and the session read the same one, so this is what the agent was
  // handed as well.
  await hold('s')
  expect(frame()).toContain('你是 ことね')
})

test('asked for a language mid-conversation, she says which conversation it is for', async () => {
  const { her, sessions, wakeUp, type, enter, hold, arrow, frame } = await onScreen()
  await wakeUp()
  await type('good morning')
  await enter()

  await hold('l')
  await arrow('down')
  await arrow('down')
  await enter()

  // The persona goes into the agent as its server starts, so this conversation
  // cannot have it. Said out loud rather than left to look like a list that did
  // nothing — and written down all the same, for the next window.
  expect(her.closed).toBe(false)
  expect(sessions).toHaveLength(1)
  expect(frame()).toContain(`${CHINESE} next time`)
  expect(spoken()?.id).toBe('zh-Hant')
})

test('taking the pick off puts her back to answering however she is written to', async () => {
  const { sessions, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  await hold('l')
  await arrow('down')
  await arrow('down')
  await enter()

  // Off the top row this time, which the list is now two rows below.
  await hold('l')
  expect(frame()).toContain('What she answers in')
  await arrow('up')
  await arrow('up')
  await enter()

  // A third session, asked for nothing at all — not asked for English, which
  // would be a language like any other and not what she started as.
  expect(sessions.map((one) => one.speaks?.id ?? null)).toEqual([null, 'zh-Hant', null])
  expect(spoken()).toBe(null)
})

test('what she was asked to answer in is what the next window opens on', async () => {
  const first = await onScreen()
  await first.wakeUp()
  await first.hold('l')
  await first.arrow('down')
  await first.arrow('down')
  await first.enter()

  // The note is the whole of what carries it across, the same as the one saying
  // who was last sent for: nothing is asked of the agent, which is not there
  // yet when the window opens.
  const later = await onScreen()
  expect(later.sessions[0]!.speaks?.id).toBe('zh-Hant')
})
