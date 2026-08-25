import { expect, test } from 'bun:test'
import {
  checkingKeys,
  cornerFor,
  meetingKeys,
  keyFor,
  keysNow,
  listKeys,
  pathKeys,
  pressed,
  readingKeys,
  shownAs,
  spendingKeys,
  takes,
  type Where,
} from './keys'

const idle: Where = {
  up: false,
  standing: false,
  picking: false,
  ticking: false,
  narrows: false,
  narrowed: false,
  path: false,
  reading: false,
  checking: false,
  spending: false,
  meeting: false,
  hasReport: false,
  said: false,
  dressed: false,
  isWorking: false,
  asked: false,
  trouble: null,
}
const working: Where = { ...idle, isWorking: true }
const asked: Where = { ...working, asked: true }
/** Waiting to be allowed something narrow enough to be allowed for the rest of
 * the session — a command, a file, a host. */
const narrow: Where = { ...asked, standing: true }
const up = (where: Where): Where => ({ ...where, up: true })
const picking = (where: Where): Where => ({ ...where, picking: true })
/** Her question, when several rows answer it: the list with ticks on it. */
const ticking = (where: Where): Where => ({ ...where, picking: true, ticking: true })
/** The list of what she thinks with: the one that can be typed at, with
 * nothing typed at it yet. */
const narrows = (where: Where): Where => ({ ...where, picking: true, narrows: true })
/** …and with something typed at it. */
const narrowed = (where: Where): Where => ({ ...where, picking: true, narrows: true, narrowed: true })
/** The folder list, one step further in: the rows are away and a path is being
 * written out in their place. */
const typingPath = (where: Where): Where => ({ ...where, path: true })
/** She has written something, and it has not been opened. */
const wrote = (where: Where): Where => ({ ...where, hasReport: true })
/** …and it is open, which it can only be if there is one. */
const reading = (where: Where): Where => ({ ...where, hasReport: true, reading: true })
/** How the work stands in her folder, on screen over the scene. */
const checking = (where: Where): Where => ({ ...where, checking: true })
/** …and what she has spent, which is over it the same way. */
const spending = (where: Where): Where => ({ ...where, spending: true })
/** …and the page of the words she is played from, which is over it the same
 * way. */
const meeting = (where: Where): Where => ({ ...where, meeting: true })
/** The girl standing there has been drawn in more than one thing. */
const dressed = (where: Where): Where => ({ ...where, dressed: true })
/** She has said something, so there is a line in the box. */
const said = (where: Where): Where => ({ ...where, said: true })
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
  // behind it — and behind it is not answerable, so it is not listed either.
  expect(headings(picking(asked))).toEqual(['While a list is open', 'Whenever'])
  expect(pressed(press('y'), picking(asked))).toBeNull()
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
  // Looking at what she would do is the window's own, the same as answering
  // her: it changes nothing underneath and nothing underneath wants the key.
  expect(takes('details')).toBe(true)
})

test('a line break is the window\'s, whichever name the terminal gives it', () => {
  // Ctrl-J and a linefeed are the same key: one is what the terminal calls it
  // when it can, the other is the byte itself — and the byte is also what every
  // line break in a paste comes in as, from a terminal that does not wrap one.
  expect(pressed(press('ctrl+j'), idle)).toBe('new-line')
  expect(pressed({ name: 'linefeed' }, idle)).toBe('new-line')
  // Taken from the line rather than left to it: the line would read it as an
  // Enter and send half a pasted sentence.
  expect(takes('new-line')).toBe(true)
  // And not the window's while the line is behind something: a list is what is
  // being typed at while it is open.
  expect(pressed({ name: 'linefeed' }, picking(idle))).toBeNull()
})

test('what she would do with it can be looked at, and only while she is asking', () => {
  expect(pressed(press('tab'), asked)).toBe('details')
  expect(pressed(press('tab'), working)).toBeNull()
  expect(pressed(press('tab'), idle)).toBeNull()
})

test('a key that means nothing from here is nothing', () => {
  expect(pressed(press('escape'), idle)).toBeNull()
  expect(pressed(press('y'), idle)).toBeNull()
  expect(pressed(press('q'), working)).toBeNull()
})

test('a new conversation can be started at any time', () => {
  // From wherever, and from the list of the earlier ones in particular: that
  // is the list this is the way out of.
  for (const where of [idle, working, asked, picking(idle), narrows(idle)]) {
    expect(pressed(press('ctrl+n'), where)).toBe('fresh')
  }
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

test('the list does not answer her question for whoever is reading it', () => {
  // The likeliest reason to want it is her asking to be allowed something —
  // which is exactly why y must not carry through it: what she is asking for is
  // drawn in the box, and the box is behind this.
  expect(headings(up(asked))).toEqual(['While these are up', 'Whenever'])
  expect(pressed(press('y'), up(asked))).toBeNull()
  expect(pressed(press('n'), up(asked))).toBeNull()
  // Put away, and she is where she was: nothing about opening these lost her
  // question.
  expect(pressed(press('y'), asked)).toBe('allow')
})

test('nothing over the scene answers a question drawn behind it', () => {
  // All of them, because the hole belongs to how anything over the scene shares
  // the keyboard with the box rather than to any one page: these keys, what she
  // wrote, how the work stands, what she has spent, who she is, a list, a path
  // being typed into one.
  for (const behind of [up, reading, checking, spending, meeting, picking, typingPath]) {
    expect(pressed(press('y'), behind(narrow))).toBeNull()
    expect(pressed(press('n'), behind(narrow))).toBeNull()
    expect(pressed(press('a'), behind(narrow))).toBeNull()
    expect(pressed(press('tab'), behind(narrow))).toBeNull()
    // …and still hers to answer the moment it is put away. The question was
    // never lost, only covered.
    expect(pressed(press('y'), narrow)).toBe('allow')
    expect(pressed(press('a'), narrow)).toBe('always')
  }
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

test('a list that takes several rows ticks them, and Enter means done', () => {
  expect(pressed(press('space'), ticking(idle))).toBe('tick')
  expect(pressed(press('return'), ticking(idle))).toBe('choose')
  expect(pressed(press('escape'), ticking(working))).toBe('cancel')
  // Space is nothing to a list that takes one row: Enter is the whole of it.
  expect(pressed(press('space'), picking(idle))).toBeNull()
  expect(pressed(press('space'), idle)).toBeNull()

  // What the list prints is the ticking keys and then the rest, with Enter
  // said once and saying the ticking thing — the same key listed twice doing
  // two things would be the keys table failing at the one thing it is for.
  expect(listKeys({ ticking: true }).map((key) => [key.press, key.does])).toEqual([
    ['space', 'tick'],
    ['return', 'choose'],
    ['up', 'previous'],
    ['down', 'next'],
    ['escape', 'cancel'],
  ])
  expect(listKeys({ ticking: true }).find((key) => key.press === 'return')?.says).toBe("that's all")
  expect(headings(ticking(idle))).toEqual(['While a list is open', 'Whenever'])
  expect(offered(ticking(idle)).filter((does) => does === 'choose')).toHaveLength(1)
})

test('a list that can be typed at says so, and ESC clears what was typed before it puts the list away', () => {
  // The letters never come to the window — the list takes them — so the only
  // key of it the window answers is ESC, and only once there is something
  // typed to take back.
  expect(pressed(press('escape'), narrows(idle))).toBe('cancel')
  expect(pressed(press('escape'), narrowed(idle))).toBe('clear')
  expect(pressed(press('escape'), narrowed(working))).toBe('clear')
  expect(pressed(press('escape'), narrowed(asked))).toBe('clear')
  expect(takes('narrow')).toBe(false)
  expect(takes('clear')).toBe(true)

  // What the list prints: that it can be typed at, in front, and ESC saying
  // whichever of its two things it does right now — in the same spot, so the
  // keys do not shuffle as the first letter goes in.
  expect(listKeys({ narrows: true }).map((key) => [key.press, key.does])).toEqual([
    ['type', 'narrow'],
    ['up', 'previous'],
    ['down', 'next'],
    ['return', 'choose'],
    ['escape', 'cancel'],
  ])
  expect(listKeys({ narrows: true, narrowed: true }).map((key) => [key.press, key.does])).toEqual([
    ['type', 'narrow'],
    ['up', 'previous'],
    ['down', 'next'],
    ['return', 'choose'],
    ['escape', 'clear'],
  ])
  expect(shownAs('type')).toBe('Type')
  // The other lists print exactly what they printed before there was such a
  // thing: they are four names, and cannot be typed at.
  expect(listKeys().map((key) => key.press)).toEqual(['up', 'down', 'return', 'escape'])
  expect(listKeys().some((key) => key.does === 'narrow')).toBe(false)
})

test('a letter typed at a list is not an answer to what she is waiting to be allowed', () => {
  // The same rule as a path: y, n and r are letters, and "anthropic" has two
  // of them. Her question is still there to be answered once the list is away.
  expect(pressed(press('y'), narrows(asked))).toBeNull()
  expect(pressed(press('n'), narrows(asked))).toBeNull()
  expect(pressed(press('r'), narrows(gone))).toBeNull()
  expect(pressed(press('r'), picking(gone))).toBe('retry')
  // And the corner under the list says what ESC does from here.
  expect(cornerFor(narrows(idle))).toBe('ESC never mind')
  expect(cornerFor(narrowed(idle))).toBe('ESC start over')
})

test('which of them is on shift is opened with a key of its own', () => {
  // The same shape as the list of what she thinks with: one key, from wherever
  // the window is, and the words next to it are the table's.
  expect(pressed(press('ctrl+g'), idle)).toBe('who')
  expect(pressed(press('ctrl+g'), asked)).toBe('who')
  expect(keyFor('who').says).toBe('who is on shift')
})

test('what she is wearing is opened with a key of its own, and only where there is a choice', () => {
  // Unlike every other key that opens something over the scene, this one comes
  // and goes with the girl: one drawn in a single outfit has nothing to pick,
  // and a key listed over a list of one would be the table promising what it
  // cannot do.
  expect(pressed(press('ctrl+d'), dressed(idle))).toBe('wears')
  expect(pressed(press('ctrl+d'), dressed(asked))).toBe('wears')
  expect(pressed(press('ctrl+d'), idle)).toBeNull()
  expect(offered(dressed(idle))).toContain('wears')
  expect(offered(idle)).not.toContain('wears')
  expect(keyFor('wears').says).toBe('what she is wearing')
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
  expect(shownAs('tab')).toBe('Tab')
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

test('her line is copied by a key of its own, and only while there is one', () => {
  // An empty box has nothing to copy: the key copying nothing and saying so
  // would be worse than the key not being there.
  expect(pressed(press('ctrl+y'), idle)).toBeNull()
  expect(offered(idle)).not.toContain('copy-line')
  expect(pressed(press('ctrl+y'), said(idle))).toBe('copy-line')
  expect(pressed(press('ctrl+y'), said(working))).toBe('copy-line')
  expect(pressed(press('ctrl+y'), said(asked))).toBe('copy-line')
  expect(pressed(press('ctrl+y'), said(up(idle)))).toBe('copy-line')
  expect(offered(said(idle))).toContain('copy-line')
  // Listed with the rest of what can be taken from anywhere, not as a state.
  expect(keysNow(said(idle)).find((group) => group.keys.some((key) => key.does === 'copy-line'))?.heading).toBe(
    'Whenever',
  )
})

test('while what she wrote is open, the same key copies the page instead', () => {
  expect(pressed(press('ctrl+y'), reading(idle))).toBe('copy-page')
  expect(pressed(press('ctrl+y'), said(reading(idle)))).toBe('copy-page')
  // Once, as the page: a key listed twice doing two things is a key that does
  // one of them.
  expect(offered(said(reading(idle))).filter((does) => does.startsWith('copy'))).toEqual(['copy-page'])
})

test('copying is the window’s own, and takes nothing from the line she is spoken to on', () => {
  expect([takes('copy-line'), takes('copy-page')]).toEqual([true, true])
  // The line keeps Enter either way.
  expect(pressed(press('return'), said(idle))).toBe('send')
})

test('what an open report answers to is what the page itself prints', () => {
  expect(readingKeys().map((key) => key.does)).toEqual(['close', 'scroll-up', 'scroll-down', 'copy-page'])
  for (const key of readingKeys()) {
    expect(pressed(press(key.press), reading(idle))).toBe(key.does)
  }
})

test('how the work stands is a glance: putting it away is the whole of it', () => {
  // Two keys and one thing to do: ESC, and the key that opened it — pressed
  // again it puts it away rather than opening what is already open.
  expect(checkingKeys().map((key) => key.does)).toEqual(['close', 'close'])
  expect(pressed(press('escape'), checking(idle))).toBe('close')
  expect(pressed(press('ctrl+t'), checking(idle))).toBe('close')
  // What is on screen is what ESC answers: the panel goes away before she is
  // stopped, the same as every other thing held up in front of her.
  expect(pressed(press('escape'), checking(working))).toBe('close')
  // The panel is one thing over the scene like the rest: the line underneath
  // is blurred behind it, so nothing is offered on it.
  expect(pressed(press('return'), checking(idle))).toBeNull()
  expect(offered(checking(idle))).not.toContain('send')
  // And the corner is behind it, saying nothing the panel is not already
  // saying better.
  expect(cornerFor(checking(idle))).toBe('')
})

test('what she has spent is a glance too: putting it away is the whole of it', () => {
  // The same two keys and the same one thing to do as the panel it was written
  // after: ESC, and the key that opened it.
  expect(spendingKeys().map((key) => key.does)).toEqual(['close', 'close'])
  expect(pressed(press('escape'), spending(idle))).toBe('close')
  expect(pressed(press('ctrl+u'), spending(idle))).toBe('close')
  // Opened from anywhere, since nothing about it is hers to be interrupted: she
  // can be working, waiting to be allowed something, or not there at all.
  for (const where of [idle, working, asked, gone]) {
    expect(pressed(press('ctrl+u'), where)).toBe('spend')
  }
  // What is on screen is what ESC answers: the panel goes away before she is
  // stopped.
  expect(pressed(press('escape'), spending(working))).toBe('close')
  // And it takes the keyboard the way the rest of them do: the line underneath
  // is blurred behind it, and the corner says nothing the panel is not already
  // saying better.
  expect(pressed(press('return'), spending(idle))).toBeNull()
  expect(offered(spending(idle))).not.toContain('send')
  expect(cornerFor(spending(idle))).toBe('')
})

test('the key that opens what she has spent is the window\'s rather than the line\'s', () => {
  // Ctrl-U rubs out the front of a line for the input underneath, so the window
  // has to be the one that takes it or the panel opens and the sentence goes.
  expect(takes('spend')).toBe(true)
})

test('who she is is a page rather than a glance: it scrolls, and it is put away', () => {
  // The arrows are the page's own, the way an open report's are — listed here
  // and handed on rather than taken.
  expect(meetingKeys().map((key) => key.does)).toEqual(['close', 'close', 'scroll-up', 'scroll-down'])
  for (const key of meetingKeys()) {
    expect(pressed(press(key.press), meeting(idle))).toBe(key.does)
  }
  // What is on screen is what ESC answers: the page goes away before she is
  // stopped.
  expect(pressed(press('escape'), meeting(working))).toBe('close')
  // The line underneath is blurred behind it, so nothing is offered on it.
  expect(pressed(press('return'), meeting(idle))).toBeNull()
  expect(offered(meeting(idle))).not.toContain('send')
  // And the corner says nothing the page is not already saying better.
  expect(cornerFor(meeting(idle))).toBe('')
})

test('she can be read from anywhere, including before there is a session', () => {
  for (const where of [idle, working, asked, gone, stuck, up(idle), picking(idle)]) {
    expect(pressed(press('ctrl+s'), where)).toBe('persona')
  }
})

test('the folder can be asked about from anywhere, including while she is busy', () => {
  for (const where of [idle, working, asked, gone, stuck, up(idle), picking(idle)]) {
    expect(pressed(press('ctrl+t'), where)).toBe('repo')
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
  'ctrl+l',
  'ctrl+f',
  'ctrl+r',
  'ctrl+t',
  'ctrl+y',
  'y',
  'n',
  'a',
  'r',
  'tab',
  'return',
  'up',
  'down',
  'space',
  'type',
  'ctrl+o',
  'ctrl+n',
  'ctrl+b',
  'ctrl+c',
  'ctrl+s',
  'ctrl+d',
  'ctrl+u',
]
const EVERYWHERE: Where[] = [false, true].flatMap((up) =>
  // A list and a path being typed are one thing over the scene in two states:
  // taking the row that asks for a path is what puts the rows away.
  [
    { picking: false, ticking: false, narrows: false, narrowed: false, path: false },
    { picking: true, ticking: false, narrows: false, narrowed: false, path: false },
    { picking: true, ticking: true, narrows: false, narrowed: false, path: false },
    { picking: true, ticking: false, narrows: true, narrowed: false, path: false },
    { picking: true, ticking: false, narrows: true, narrowed: true, path: false },
    { picking: false, ticking: false, narrows: false, narrowed: false, path: true },
  ].flatMap((over) =>
    [false, true].flatMap((isWorking) =>
      [false, true].flatMap((asked) =>
      [false, true].flatMap((standing) =>
        // Only the three the window can actually be in: it never opens a
        // report it does not have.
        [
          { hasReport: false, reading: false },
          { hasReport: true, reading: false },
          { hasReport: true, reading: true },
        ].flatMap((written) =>
          [false, true].flatMap((said) =>
            [false, true].flatMap((wardrobe) =>
            // Only ever one thing over the scene, so the two glance panels and
            // the page of who she is are states of one axis rather than a flag
            // each of their own.
            [
              { checking: false, spending: false, meeting: false },
              { checking: true, spending: false, meeting: false },
              { checking: false, spending: true, meeting: false },
              { checking: false, spending: false, meeting: true },
            ].flatMap((glance) =>
              (['stuck', 'gone', null] as const).map((trouble) => ({
                up,
                isWorking,
                asked,
                standing,
                trouble,
                said,
                dressed: wardrobe,
                ...glance,
                ...over,
                ...written,
              })),
            ),
            ),
          ),
        ),
      ),
      ),
    ),
  ),
)

test('what she can be allowed for the whole session says so where the width is there to say it', () => {
  // The box has room for the key and what it would cover and not a word more,
  // so how long it lasts is said in the heading these are listed under.
  expect(offered(asked)).not.toContain('always')
  expect(offered(narrow)).toContain('always')
  expect(headings(narrow)).toEqual([
    'While she is waiting to be allowed',
    'For as long as this session lasts',
    'Whenever',
  ])
})

test('a standing yes is not given away by a letter typed somewhere else', () => {
  // The same trap r falls into: a is a letter in a path and a letter at a list
  // that can be narrowed by typing at it.
  expect(pressed(press('a'), narrow)).toBe('always')
  expect(pressed(press('a'), { ...narrow, path: true })).toBeNull()
  expect(pressed(press('a'), { ...narrow, picking: true, narrows: true })).toBeNull()
  expect(pressed(press('a'), { ...narrow, trouble: 'stuck' })).toBeNull()
})
