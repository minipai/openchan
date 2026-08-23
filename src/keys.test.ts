import { expect, test } from 'bun:test'
import { cornerFor, keyFor, keysNow, listKeys, pressed, shownAs, takes, type Where } from './keys'

const idle: Where = { up: false, picking: false, isWorking: false, asked: false }
const working: Where = { ...idle, isWorking: true }
const asked: Where = { ...working, asked: true }
const up = (where: Where): Where => ({ ...where, up: true })
const picking = (where: Where): Where => ({ ...where, picking: true })

/** A key as the terminal hands it over, from how the table writes it down. */
const press = (written: string) =>
  written.startsWith('ctrl+')
    ? { name: written.slice('ctrl+'.length), ctrl: true }
    : { name: written, ctrl: false }

test('the keys can be brought up, and put away by the key that brought them', () => {
  expect(pressed(press('ctrl+k'), idle)).toBe('keys')
  expect(pressed(press('ctrl+k'), up(idle))).toBe('close')
  expect(pressed(press('escape'), up(idle))).toBe('close')
})

test('while the keys are up, escape puts them away rather than stopping her', () => {
  expect(pressed(press('escape'), working)).toBe('stop')
  expect(pressed(press('escape'), up(working))).toBe('close')
})

test('while the keys are up, escape does not answer her question for her', () => {
  expect(pressed(press('escape'), asked)).toBe('refuse')
  expect(pressed(press('escape'), up(asked))).toBe('close')
})

test('a tool she is waiting on is allowed or refused', () => {
  expect(pressed(press('y'), asked)).toBe('allow')
  expect(pressed(press('n'), asked)).toBe('refuse')
})

test('an open list takes the keys that move through it and the one that takes a row', () => {
  expect(pressed(press('up'), picking(idle))).toBe('previous')
  expect(pressed(press('down'), picking(idle))).toBe('next')
  expect(pressed(press('return'), picking(idle))).toBe('choose')
  // Nothing moves through a list that is not open — those keys belong to the
  // line she is spoken to on the rest of the time.
  expect(pressed(press('up'), idle)).toBeNull()
  expect(pressed(press('return'), idle)).toBe('send')
})

test('while a list is open, escape puts it away rather than stopping her', () => {
  expect(pressed(press('escape'), picking(working))).toBe('cancel')
  expect(pressed(press('escape'), picking(asked))).toBe('cancel')
  // Nothing about cancelling touches what she thinks with: the key says put it
  // away and there is no other thing it can mean.
  expect(keyFor('cancel').says).toBe('never mind')
})

test('what a list is picked from is offered under its own heading', () => {
  expect(headings(picking(idle))).toEqual(['While a list is open', 'Whenever'])
  // The list is the thing being answered, so what she is in the middle of is
  // behind it — but she is still hers to be answered.
  expect(headings(picking(asked))).toEqual([
    'While a list is open',
    'While she is waiting to be allowed',
    'Whenever',
  ])
  expect(pressed(press('y'), picking(asked))).toBe('allow')
})

test('nothing is offered on the line that is behind an open list', () => {
  // The same rule as the keys overlay: the input is blurred under a list, so
  // Enter never reaches it and is the list's to take.
  expect(offered(picking(idle))).not.toContain('send')
})

test('the list of what she thinks with can be brought up at any time', () => {
  for (const where of [idle, working, asked, picking(idle)]) {
    expect(pressed(press('ctrl+p'), where)).toBe('models')
  }
})

test('the keys a list and an input answer for themselves are not taken from them', () => {
  // Pressing them has to reach what is drawn under the window, or the list
  // never moves and the sentence never goes.
  expect([takes('previous'), takes('next'), takes('choose'), takes('send')]).toEqual([
    false,
    false,
    false,
    false,
  ])
  expect([takes('cancel'), takes('models'), takes('stop')]).toEqual([true, true, true])
})

test('a key that means nothing from here is nothing', () => {
  expect(pressed(press('escape'), idle)).toBeNull()
  expect(pressed(press('y'), idle)).toBeNull()
  expect(pressed(press('q'), working)).toBeNull()
})

test('the look she is drawn in can be changed at any time', () => {
  for (const where of [idle, working, asked, up(idle)]) {
    expect(pressed(press('ctrl+b'), where)).toBe('blocks')
  }
})

test('only the keys that mean something from here are listed', () => {
  expect(headings(idle)).toEqual(['Whenever'])
  expect(headings(working)).toEqual(['While she is working', 'Whenever'])
  expect(headings(asked)).toEqual(['While she is waiting to be allowed', 'Whenever'])
})

test('the list does not stop her being answered while it is up', () => {
  // The likeliest reason to want it is her asking to be allowed something, so
  // her question is still on the list and still answerable.
  expect(headings(up(asked))).toEqual([
    'While these are up',
    'While she is waiting to be allowed',
    'Whenever',
  ])
  expect(pressed(press('y'), up(asked))).toBe('allow')
  expect(pressed(press('n'), up(asked))).toBe('refuse')
})

test('the only thing the list takes from her is the key that closes it', () => {
  // ESC belongs to the list while it is up, so stopping her is neither offered
  // nor done until it is put away.
  expect(headings(up(working))).toEqual(['While these are up', 'Whenever'])
  expect(pressed(press('escape'), up(working))).toBe('close')
})

test('what a key is listed as doing is what it does', () => {
  for (const where of [idle, working, asked, up(idle), up(asked), picking(idle), picking(asked)]) {
    for (const group of keysNow(where)) {
      for (const key of group.keys) {
        expect(pressed(press(key.press), where)).toBe(key.does)
      }
    }
  }
})

test('a key that does something from here is one the list owns up to', () => {
  // The other direction: the invariant above only proves that what is listed
  // works, which a key that quietly stopped being listed would still pass.
  for (const where of EVERYWHERE) {
    const listed = new Map(keysNow(where).flatMap((group) => group.keys.map((key) => [key.press, key.does])))
    for (const one of EVERY_PRESS) {
      expect([one, listed.get(one) ?? null]).toEqual([one, pressed(press(one), where)])
    }
  }
})

test('nothing is offered on the line that is behind the list', () => {
  // Enter is not the window's to press — it is the input's, and while the list
  // is up the input is blurred and never sees it. Neither the table nor the
  // list may go on claiming it; nothing outside this file can tell.
  expect(pressed(press('return'), idle)).toBe('send')
  expect(pressed(press('return'), up(idle))).toBeNull()
  expect(offered(up(idle))).not.toContain('send')
  expect(offered(up(asked))).not.toContain('send')
})

test('the corner says what escape does from here, and never something else', () => {
  expect(cornerFor(idle)).toBe('Ctrl-K these keys')
  expect(cornerFor(working)).toBe('ESC stop her')
  // It used to say ESC whenever she was busy, including while she was waiting
  // to be allowed something — where ESC refuses rather than stops.
  expect(cornerFor(asked)).toBe("ESC don't")
  expect(cornerFor(up(working))).toBe('')
  expect(cornerFor(picking(working))).toBe('ESC never mind')
})

test('the words under her permission question come off the same list', () => {
  expect(keyFor('allow')).toEqual({ press: 'y', does: 'allow', says: 'let her' })
  expect(keyFor('refuse').press).toBe('n')
})

test('what an open list answers to is what the list itself prints', () => {
  // The overlay never gets to show these — bringing it up puts the list away —
  // so the list carries them, and off the same table as everything else.
  expect(listKeys().map((key) => key.does)).toEqual(['previous', 'next', 'choose', 'cancel'])
  for (const key of listKeys()) {
    expect(pressed(press(key.press), picking(idle))).toBe(key.does)
  }
})

test('keys are printed the way they are pressed, not the way the terminal names them', () => {
  expect(shownAs('escape')).toBe('ESC')
  expect(shownAs('return')).toBe('Enter')
  // The arrows have a shape rather than a name on them, and printing the word
  // next to ESC and Enter read as a key called `up`.
  expect(shownAs('up')).toBe('↑')
  expect(shownAs('down')).toBe('↓')
  expect(shownAs('ctrl+k')).toBe('Ctrl-K')
  expect(shownAs('y')).toBe('y')
})

const headings = (where: Where) => keysNow(where).map((group) => group.heading)
const offered = (where: Where) => keysNow(where).flatMap((group) => group.keys.map((key) => key.does))

/** Every key written down, and everywhere the window can be while one arrives. */
const EVERY_PRESS = ['escape', 'ctrl+k', 'ctrl+p', 'y', 'n', 'return', 'up', 'down', 'ctrl+b', 'ctrl+c']
const EVERYWHERE: Where[] = [false, true].flatMap((up) =>
  [false, true].flatMap((picking) =>
    [false, true].flatMap((isWorking) =>
      [false, true].map((asked) => ({ up, picking, isWorking, asked })),
    ),
  ),
)
