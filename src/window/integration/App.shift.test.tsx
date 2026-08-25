import { expect } from 'bun:test'
import path from 'node:path'
import { OPENED_IN } from '../../between/folder'
import { elsewhereFolder, windowTestKit } from './windowTestKit'

const { onScreen, test } = windowTestKit()
const elsewhere = elsewhereFolder()

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
