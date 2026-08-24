import { expect, test } from 'bun:test'
import { LINE_HOLDS } from '../App'
import { windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

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

test('typed onto the end of a page-long line, every letter lands and is on screen', async () => {
  const { her, wakeUp, paste, type, enter, frame } = await onScreen()
  await wakeUp()

  // Right up against what the line holds, which is where the cursor
  // underneath used to run out of numbers: it stopped at 65,535 and stayed
  // there, the line went on being drawn from where the cursor was rather than
  // from where the words were, and of three letters typed only the first
  // reached the sentence.
  await paste('x'.repeat(LINE_HOLDS - 3))
  await type('ZZZ')

  // On screen as well as in the sentence — the end of the line is what a line
  // this long is drawn from, and it going blank was how this showed.
  expect(frame()).toContain('ZZZ')

  await enter()
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS - 3) + 'ZZZ'])
})

test('a full line refuses the next letter out loud rather than swallowing it', async () => {
  const { her, wakeUp, paste, type, enter, frame } = await onScreen()
  await wakeUp()

  await paste('x'.repeat(LINE_HOLDS))
  await type('Z')

  expect(frame()).toContain('the line is full')

  await enter()
  // And the Z is nowhere: refused is not the same as taken and lost, and only
  // one of the two says so.
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS)])
})

test('a character too wide for the last of the room is refused whole, not halved', async () => {
  const { her, wakeUp, paste, drop, enter, frame } = await onScreen()
  await wakeUp()

  // One unit of room left, and the next character is two of them wide. Half
  // of it is not half a character — it is a broken one, and it arrives as a
  // black diamond in place of what was typed.
  //
  // Pressed as the bytes a terminal sends for it rather than typed letter by
  // letter: typing splits a text into its units, and half of this one is not
  // a key anybody's keyboard has.
  await paste('x'.repeat(LINE_HOLDS - 1))
  await drop('😀')

  expect(frame()).toContain('the line is full')

  await enter()
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS - 1)])
})

test('a paste cut off at that same place is cut between characters', async () => {
  const { her, wakeUp, paste, enter, frame } = await onScreen()
  await wakeUp()

  await paste('x'.repeat(LINE_HOLDS - 1))
  await paste('😀')

  // One character turned away, said as one: it is two of the units the line
  // is measured in, and the units are not what anybody reading this counts.
  expect(frame()).toContain('the last 1 character would not fit')

  await enter()
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS - 1)])
})

test('a paste of more than a page keeps the whole of what it kept', async () => {
  const { her, wakeUp, paste, enter, frame } = await onScreen()
  await wakeUp()

  await paste('x'.repeat(70_000))
  expect(frame()).toContain(`the last ${70_000 - LINE_HOLDS} characters would not fit`)

  await enter()
  expect(her.asked).toEqual(['x'.repeat(LINE_HOLDS)])
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
