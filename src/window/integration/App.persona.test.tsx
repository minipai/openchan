import { expect, test } from 'bun:test'
import { kotone, windowTestKit } from './windowTestKit'
import { personaFor } from '../../her/cast'

const { onScreen } = windowTestKit()

/** The opening of the girl on shift's own file, short enough that the page
 * cannot have wrapped it: finding it on screen means her words are there
 * rather than a heading that could have come from any of them. */
const HER_OPENING = personaFor(kotone)
  .split('\n')
  .find((line) => line.startsWith('You are'))!
  .slice(0, 12)

test('who she is is opened over the scene, and put away again', async () => {
  const { wakeUp, type, enter, raise, hold, escape, frame } = await onScreen()
  await wakeUp()
  await type('are you there?')
  await enter()
  await raise({ kind: 'says', line: 'Kotone is here ♪' })
  await raise({ kind: 'done' })

  await hold('s')
  expect(frame()).toContain(`How ${kotone.name} is written`)
  expect(frame()).toContain('# Personality')
  expect(frame()).toContain('ESC put it away')
  // And the way to the rest of her, which does not fit the box.
  expect(frame()).toContain('↓ on down a bit')

  await escape()
  // The scene is where it was left: she is still standing there, her line is
  // still in the box, and the line she is spoken to on is hers to type on.
  expect(frame()).not.toContain('# Personality')
  expect(frame()).toContain('Kotone is here ♪')
  expect(frame()).toContain('her face is')
  await type('good')
  expect(frame()).toContain('good')
})

test('her page is her own words, and it is only a page', async () => {
  const { her, wakeUp, hold, escape, frame } = await onScreen()
  await wakeUp()

  await hold('s')
  // Off the file her session was opened with, rather than a description of her
  // written for the screen.
  expect(frame()).toContain(HER_OPENING)
  // The filing at the top of that file is not writing of hers, so it is not on
  // the page either.
  expect(frame()).not.toContain('personality:')
  expect(frame()).not.toContain('outfits:')

  // Nothing was said to her about being looked at, and the turn she was not
  // having was not interrupted.
  await escape()
  expect(her.asked).toEqual([])
  expect(her.interrupted).toBe(0)
})

test('she can be read before there is a session at all, and while she is busy', async () => {
  // Nothing has woken up: no models, no conversation, nobody to ask. Her
  // persona is a file in the house rather than something the session carries,
  // so the page opens anyway.
  const { her, wakeUp, hold, escape, type, enter, frame } = await onScreen()
  await hold('s')
  expect(frame()).toContain('# Personality')
  expect(her.asked).toEqual([])
  await escape()

  await wakeUp()
  await type('a long one, please')
  await enter()
  expect(frame()).toContain('…')

  await hold('s')
  expect(frame()).toContain('# Personality')
  // Reading her does not stop her: ESC belongs to the page while it is up, and
  // she is still working underneath it when the page goes away.
  await escape()
  expect(her.interrupted).toBe(0)
})

test('it is the girl standing there who is read, not the one sent for', async () => {
  const { wakeUp, type, enter, hold, arrow, frame } = await onScreen()
  await wakeUp()
  // Something has been said, so this conversation is hers to finish: the girl
  // picked off the list takes the next shift rather than walking in now.
  await type('good morning')
  await enter()
  await hold('g')
  await arrow('down')
  await enter()
  expect(frame()).toContain('takes the next shift')

  // So the page is the words the girl on screen is being played from, not the
  // words of whoever is due after her — nobody is being played from those yet.
  await hold('s')
  expect(frame()).toContain(`How ${kotone.name} is written`)
  expect(frame()).toContain(HER_OPENING)
  expect(frame()).not.toContain('You are くるみ')
})

test('the key that opens her closes her too', async () => {
  const { wakeUp, hold, type, frame } = await onScreen()
  await wakeUp()

  await hold('s')
  expect(frame()).toContain('# Personality')
  await hold('s')
  expect(frame()).not.toContain('# Personality')

  await type('back')
  expect(frame()).toContain('back')
})
