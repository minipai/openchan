import { expect, test } from 'bun:test'
import { keyFor, keysNow, pressed, shownAs, type Where } from './keys'

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
  expect(headings(up(working))).toEqual(['While these are up', 'Whenever'])
})

test('what a key is listed as doing is what it does', () => {
  for (const where of [idle, working, asked, up(idle), up(asked)]) {
    for (const group of keysNow(where)) {
      for (const key of group.keys) {
        // `send` is the input's and `leave` is the renderer's — listed, not
        // pressed here — so what the window itself answers is what is checked.
        if (key.does === 'send' || key.does === 'leave') continue
        expect(pressed(press(key.press), where)).toBe(key.does)
      }
    }
  }
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
