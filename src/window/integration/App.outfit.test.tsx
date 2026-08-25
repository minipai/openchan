import { expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

/** The one she opens the door in, and the one the list offers instead. Both are
 * folders of her pictures rather than anything she is told about herself. */
const UNIFORM = 'in her uniform'
const ONE_PIECE = 'in her one-piece'

test('what she has on is picked off a list of what she has been drawn in', async () => {
  const { wakeUp, hold, frame } = await onScreen()
  await wakeUp()
  expect(frame()).toContain(UNIFORM)

  await hold('d')

  // Marked where she stands, the same as every other list: whoever opens it is
  // asking what she has on now.
  expect(frame()).toContain('What she is wearing')
  expect(frame()).toContain('● Uniform')
  expect(frame()).toContain('One-piece')
})

test('picking one puts her in it there and then', async () => {
  const { her, sessions, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()

  await hold('d')
  await arrow('down')
  await enter()

  // Nothing was closed and nothing waits for the next session: an outfit is a
  // folder of pictures, and no part of it goes into the agent.
  expect(frame()).not.toContain('What she is wearing')
  expect(frame()).toContain(ONE_PIECE)
  expect(her.closed).toBe(false)
  expect(sessions).toHaveLength(1)
})

test('she changes in the middle of a conversation without leaving it', async () => {
  const { her, sessions, wakeUp, type, enter, hold, arrow, frame } = await onScreen()
  await wakeUp()
  await type('good morning')
  await enter()

  await hold('d')
  await arrow('down')
  await enter()

  // Unlike sending for one of the others, there is nothing here to interrupt —
  // so nobody is told to wait for the next shift.
  expect(frame()).toContain(ONE_PIECE)
  expect(frame()).not.toContain('takes the next shift')
  expect(her.closed).toBe(false)
  expect(sessions).toHaveLength(1)
})

test('what she was put in is what the next window opens on', async () => {
  const first = await onScreen()
  await first.wakeUp()
  await first.hold('d')
  await first.arrow('down')
  await first.enter()
  expect(first.frame()).toContain(ONE_PIECE)

  // Through the note on disk rather than through anything this process is
  // still holding: the next window is a different one tomorrow, and what it
  // opens on has to have survived the one that picked it.
  expect(fs.readFileSync(path.join(os.homedir(), '.openchan', 'outfits'), 'utf8')).toContain(
    'kotone/one-piece',
  )

  const next = await onScreen()
  await next.wakeUp()

  expect(next.frame()).toContain(ONE_PIECE)
})

test('the girl who walks in wears her own, not the one who just left', async () => {
  const { wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()
  await hold('d')
  await arrow('down')
  await enter()
  expect(frame()).toContain(ONE_PIECE)

  // Nothing had been said, so くるみ comes out now — in whatever she was last
  // put in, which is nothing at all: the note is written a girl to a line.
  await hold('g')
  await arrow('down')
  await enter()

  expect(frame()).toContain('╭─ くるみ')
  expect(frame()).toContain(UNIFORM)
})
