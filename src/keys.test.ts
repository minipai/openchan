import { expect, test } from 'bun:test'
import {
  cornerFor,
  keyFor,
  keysNow,
  listKeys,
  pathKeys,
  pressed,
  readingKeys,
  shownAs,
  takes,
  type Where,
} from './keys'

const idle: Where = {
  up: false,
  picking: false,
  path: false,
  reading: false,
  hasReport: false,
  isWorking: false,
  asked: false,
  trouble: null,
}
const working: Where = { ...idle, isWorking: true }
const asked: Where = { ...working, asked: true }
const up = (where: Where): Where => ({ ...where, up: true })
const picking = (where: Where): Where => ({ ...where, picking: true })
/** The folder list, one step further in: the rows are away and a path is being
 * written out in their place. */
const typingPath = (where: Where): Where => ({ ...where, path: true })
/** She has written something, and it has not been opened. */
const wrote = (where: Where): Where => ({ ...where, hasReport: true })
/** …and it is open, which it can only be if there is one. */
const reading = (where: Where): Where => ({ ...where, hasReport: true, reading: true })
/** Something in the way with her session gone with it, and something in the way
 * that left her standing there. */
const gone: Where = { ...idle, trouble: 'gone' }
const stuck: Where = { ...idle, trouble: 'stuck' }

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
  for (const where of [idle, working, asked, gone, stuck, up(idle), up(asked), picking(idle), picking(asked)]) {
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

test('a session that has gone can only be opened again', () => {
  expect(pressed(press('r'), gone)).toBe('retry')
  // Putting it away would leave a line to type into with nobody on the other
  // end of it, so it is not offered — the way out is the one key.
  expect(pressed(press('escape'), gone)).toBeNull()
  expect(offered(gone)).not.toContain('dismiss')
})

test('trouble she is still standing behind is put away rather than retried', () => {
  expect(pressed(press('escape'), stuck)).toBe('dismiss')
  // Opening her again is not what gets past this one, and she is not gone.
  expect(pressed(press('r'), stuck)).toBeNull()
  expect(offered(stuck)).not.toContain('retry')
})

test('nothing is offered on the line that is not drawn while something is in the way', () => {
  // The same rule as the overlay and the list: what is in the way takes the box
  // the input lives in, so Enter never reaches it.
  for (const where of [gone, stuck]) {
    expect(pressed(press('return'), where)).toBeNull()
    expect(offered(where)).not.toContain('send')
  }
})

test('what is in the way is listed under what can be done about it', () => {
  expect(headings(gone)).toEqual(['While she cannot be reached', 'Whenever'])
  expect(headings(stuck)).toEqual(['While something is in the way', 'Whenever'])
})

test('a question behind the note is not answered by the key that puts the note away', () => {
  // The note takes the box her question is drawn in, so while it is up the
  // question is not on screen — and answering an invisible one with the key the
  // note says puts it away is the worst of both.
  const troubled: Where = { ...asked, trouble: 'stuck' }

  expect(pressed(press('escape'), troubled)).toBe('dismiss')
  expect(offered(troubled)).not.toContain('allow')
  expect(pressed(press('y'), troubled)).toBeNull()
  // And once it is put away she is waiting to be allowed something, same as she
  // was: the question was never answered for her.
  expect(pressed(press('y'), asked)).toBe('allow')
})

test('opening her again is not behind whatever else is on the screen', () => {
  // The two things that go over the scene are read off it — these keys, and a
  // list — so neither of them is a reason she cannot be opened again.
  expect(pressed(press('r'), up(gone))).toBe('retry')
  expect(pressed(press('r'), picking(gone))).toBe('retry')
})

test('while the keys are up, escape puts them away rather than what is in the way', () => {
  expect(pressed(press('escape'), up(stuck))).toBe('close')
  // And what she thinks with is still a key away — which is the shorter way out
  // of a model she cannot get at.
  expect(pressed(press('ctrl+p'), stuck)).toBe('models')
})

test('the corner says what escape does from here, and never something else', () => {
  expect(cornerFor(idle)).toBe('Ctrl-K these keys')
  expect(cornerFor(working)).toBe('ESC stop her')
  // It used to say ESC whenever she was busy, including while she was waiting
  // to be allowed something — where ESC refuses rather than stops.
  expect(cornerFor(asked)).toBe("ESC don't")
  expect(cornerFor(up(working))).toBe('')
  expect(cornerFor(picking(working))).toBe('ESC never mind')
  expect(cornerFor(stuck)).toBe('ESC put it away')
  // Nothing for ESC to do while she is gone, so the corner says the thing it
  // says when there is nothing better.
  expect(cornerFor(gone)).toBe('Ctrl-K these keys')
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

test('which of them is on shift is opened with a key of its own', () => {
  // The same shape as the list of what she thinks with: one key, from wherever
  // the window is, and the words next to it are the table's.
  expect(pressed(press('ctrl+g'), idle)).toBe('who')
  expect(pressed(press('ctrl+g'), asked)).toBe('who')
  expect(keyFor('who').says).toBe('who is on shift')
})

test('where she works is opened with a key of its own', () => {
  expect(pressed(press('ctrl+f'), idle)).toBe('where')
  expect(pressed(press('ctrl+f'), working)).toBe('where')
  expect(keyFor('where').says).toBe('where she works')
})

test('a path being written out is taken by enter and put away by escape', () => {
  // Enter is the line's own the way it is the input's — the window must not
  // take it — and escape is the same one that would have put the rows away.
  // That nothing else is answered from here is the exhaustive check's, below.
  expect(pressed(press('return'), typingPath(idle))).toBe('go')
  expect(pressed(press('escape'), typingPath(idle))).toBe('cancel')
  expect(takes('go')).toBe(false)
  expect(pathKeys().map((key) => key.does)).toEqual(['go', 'cancel'])
})

test('nothing is offered on the line that is behind a path being written out', () => {
  // The same rule as the list and the open report: the input under it is
  // blurred, so the table must not go on claiming Enter for it.
  expect(offered(typingPath(idle))).not.toContain('send')
  // And the rows are not there to be moved through any more.
  expect(pressed(press('up'), typingPath(idle))).toBeNull()
  expect(offered(typingPath(idle))).not.toContain('choose')
})

test('escape puts the path away rather than stopping her or answering for her', () => {
  expect(pressed(press('escape'), typingPath(working))).toBe('cancel')
  expect(pressed(press('escape'), typingPath(asked))).toBe('cancel')
})

test('a letter in a path is not an answer to what she is waiting to be allowed', () => {
  // y and n are letters, and `~/Sync` is a folder. Her question is still on
  // screen and still answerable — the moment the path is away.
  expect(pressed(press('y'), asked)).toBe('allow')
  expect(pressed(press('y'), typingPath(asked))).toBeNull()
  expect(pressed(press('n'), typingPath(asked))).toBeNull()
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

test('what she wrote is opened by a key of its own, and only while there is one', () => {
  // A key shown or answered with nothing behind it opens an empty page — so it
  // is worth nothing until she has actually written something.
  expect(pressed(press('ctrl+r'), idle)).toBeNull()
  expect(pressed(press('ctrl+r'), wrote(idle))).toBe('report')
  expect(pressed(press('ctrl+r'), wrote(working))).toBe('report')
  expect(offered(idle)).not.toContain('report')
  expect(offered(wrote(idle))).toContain('report')
})

test('an open report is scrolled by the arrows and put away by escape', () => {
  expect(pressed(press('up'), reading(idle))).toBe('scroll-up')
  expect(pressed(press('down'), reading(idle))).toBe('scroll-down')
  expect(pressed(press('escape'), reading(idle))).toBe('close')
  // The same rule as a list: what is on screen is what is being answered, so
  // escape puts the page away rather than stopping her.
  expect(pressed(press('escape'), reading(working))).toBe('close')
  expect(pressed(press('escape'), reading(asked))).toBe('close')
})

test('the key that opens it is worth nothing from inside it', () => {
  expect(pressed(press('ctrl+r'), reading(idle))).toBeNull()
  expect(offered(reading(idle))).not.toContain('report')
})

test('nothing is offered on the line that is behind an open report', () => {
  // The input is blurred under it, the same as under the list, so Enter never
  // reaches it.
  expect(pressed(press('return'), reading(idle))).toBeNull()
  expect(offered(reading(idle))).not.toContain('send')
})

test('scrolling is the page’s own to do, and is not taken from it', () => {
  expect([takes('scroll-up'), takes('scroll-down')]).toEqual([false, false])
  // Opening it is the window’s own: the page is not there yet to answer for it.
  expect(takes('report')).toBe(true)
})

test('what an open report answers to is what the page itself prints', () => {
  expect(readingKeys().map((key) => key.does)).toEqual(['close', 'scroll-up', 'scroll-down'])
  for (const key of readingKeys()) {
    expect(pressed(press(key.press), reading(idle))).toBe(key.does)
  }
})

test('an unread report is what the corner says, once nothing narrower does', () => {
  expect(cornerFor(wrote(idle))).toBe('Ctrl-R read what she wrote')
  // Stopping her is the more pressing of the two while she is still at it.
  expect(cornerFor(wrote(working))).toBe('ESC stop her')
  // With the page itself on screen the corner is behind it, and it is the
  // page that says what it answers to.
  expect(cornerFor(reading(idle))).toBe('')
})

const headings = (where: Where) => keysNow(where).map((group) => group.heading)
const offered = (where: Where) => keysNow(where).flatMap((group) => group.keys.map((key) => key.does))

/** Every key written down, and everywhere the window can be while one arrives. */
const EVERY_PRESS = [
  'escape',
  'ctrl+k',
  'ctrl+p',
  'ctrl+g',
  'ctrl+f',
  'ctrl+r',
  'y',
  'n',
  'r',
  'return',
  'up',
  'down',
  'ctrl+b',
  'ctrl+c',
]
const EVERYWHERE: Where[] = [false, true].flatMap((up) =>
  // A list and a path being typed are one thing over the scene in two states:
  // taking the row that asks for a path is what puts the rows away.
  [
    { picking: false, path: false },
    { picking: true, path: false },
    { picking: false, path: true },
  ].flatMap((over) =>
    [false, true].flatMap((isWorking) =>
      [false, true].flatMap((asked) =>
        // Only the three the window can actually be in: it never opens a
        // report it does not have.
        [
          { hasReport: false, reading: false },
          { hasReport: true, reading: false },
          { hasReport: true, reading: true },
        ].flatMap((written) =>
          (['stuck', 'gone', null] as const).map((trouble) => ({
            up,
            isWorking,
            asked,
            trouble,
            ...over,
            ...written,
          })),
        ),
      ),
    ),
  ),
)
