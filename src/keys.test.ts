import { expect, test } from 'bun:test'
import { cornerFor, keyFor, keysNow, pressed, shownAs, type Where } from './keys'

const idle: Where = { up: false, isWorking: false, asked: false }
const working: Where = { ...idle, isWorking: true }
const asked: Where = { ...working, asked: true }
const up = (where: Where): Where => ({ ...where, up: true })

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
  for (const where of [idle, working, asked, up(idle), up(asked)]) {
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
})

test('the words under her permission question come off the same list', () => {
  expect(keyFor('allow')).toEqual({ press: 'y', does: 'allow', says: 'let her' })
  expect(keyFor('refuse').press).toBe('n')
})

test('keys are printed the way they are pressed, not the way the terminal names them', () => {
  expect(shownAs('escape')).toBe('ESC')
  expect(shownAs('return')).toBe('Enter')
  expect(shownAs('ctrl+k')).toBe('Ctrl-K')
  expect(shownAs('y')).toBe('y')
})

const headings = (where: Where) => keysNow(where).map((group) => group.heading)
const offered = (where: Where) => keysNow(where).flatMap((group) => group.keys.map((key) => key.does))

/** Every key written down, and everywhere the window can be while one arrives. */
const EVERY_PRESS = ['escape', 'ctrl+k', 'y', 'n', 'return', 'ctrl+b', 'ctrl+c']
const EVERYWHERE: Where[] = [false, true].flatMap((up) =>
  [false, true].flatMap((isWorking) => [false, true].map((asked) => ({ up, isWorking, asked }))),
)
