/**
 * Every key the window answers to, written down once.
 *
 * The list is the only place a key and what it does are put next to each other:
 * the window presses them off this table, the help overlay reads them off it,
 * and the dialogue box takes the words under her permission question off it too
 * — a key that moves in one of those places moves in all of them, because there
 * is nowhere else for it to be written.
 */

/** What pressing it does. Not all of them are the window's to do: `send` is the
 * input's own, moving through a list and choosing off it belong to the list —
 * and so does narrowing it, which is every letter typed at it rather than one
 * key — and `leave` belongs to the renderer, which is the one that knows how to
 * put the terminal back. They are here to be listed. */
export type Does =
  | 'send'
  | 'new-line'
  | 'stop'
  | 'allow'
  | 'always'
  | 'refuse'
  | 'details'
  | 'blocks'
  | 'keys'
  | 'close'
  | 'leave'
  | 'models'
  | 'who'
  | 'speaks'
  | 'where'
  | 'talks'
  | 'fresh'
  | 'report'
  | 'repo'
  | 'persona'
  | 'scroll-up'
  | 'scroll-down'
  | 'previous'
  | 'next'
  | 'choose'
  | 'tick'
  | 'narrow'
  | 'clear'
  | 'go'
  | 'cancel'
  | 'retry'
  | 'dismiss'
  | 'copy-line'
  | 'copy-page'

/**
 * The ones the window does not do itself, and so does not take the key away
 * from whatever is underneath: the line she is spoken to on takes Enter, an
 * open list and an open report take the arrows, the list takes Enter, and the
 * renderer takes Ctrl-C.
 */
const THEIRS: Does[] = ['send', 'previous', 'next', 'choose', 'tick', 'narrow', 'go', 'leave', 'scroll-up', 'scroll-down']

/** Whether pressing it is the window's own to act on — and so to keep from
 * reaching what is drawn under it. */
export const takes = (does: Does) => !THEIRS.includes(does)

/** When a key is worth anything: whenever, while there is a line to type into,
 * while she has said something, while she is working, while she is waiting to
 * be allowed, while what she is waiting on is narrow enough to be allowed for
 * the rest of the session, while something is in the way of her working at all
 * — with or without her session left standing — while a list is open, while
 * the open list takes several rows rather than one, while the open list can be
 * narrowed by typing at it, while it has been, while a path is being typed
 * into one, while there is something she wrote to read, while it is open,
 * while how the work stands is on screen, while who she is is, or while these
 * keys are. */
type When =
  | 'always'
  | 'typing'
  | 'said'
  | 'working'
  | 'asked'
  | 'standing'
  | 'gone'
  | 'troubled'
  | 'picking'
  | 'ticking'
  | 'narrows'
  | 'narrowed'
  | 'path'
  | 'reported'
  | 'reading'
  | 'checking'
  | 'meeting'
  | 'up'

export type Shortcut = {
  /** As the terminal names it: the key, with `ctrl+` in front if it is held. */
  press: string
  does: Does
  /** What it does, in the words the screen uses. */
  says: string
}

/** Where the window is when a key arrives. */
export type Where = {
  /** Whether these keys are the thing on screen. */
  up: boolean
  isWorking: boolean
  /** Whether she is waiting to be allowed something. */
  asked: boolean
  /** Whether what she is waiting on can be allowed for the rest of the session
   * — which it can only be when there are words narrow enough to say what that
   * would cover. */
  standing: boolean
  /** Whether there is a list open to pick something off. */
  picking: boolean
  /** Whether the open list takes several rows rather than one: her question,
   * when she has said more than one answer will do. */
  ticking: boolean
  /** Whether the open list can be narrowed by typing at it: what she thinks
   * with, which runs to hundreds of rows. Letters are letters there. */
  narrows: boolean
  /** Whether something has been typed at it — so there is something for ESC
   * to clear before it puts the list away. */
  narrowed: boolean
  /** Whether a folder is being typed out rather than picked off a list. */
  path: boolean
  /** Whether what she wrote is open and being read. */
  reading: boolean
  /** Whether she has written something there is a report to open at all. */
  hasReport: boolean
  /** Whether how the work stands in her folder is what is on screen. */
  checking: boolean
  /** Whether the words she is played from are what is on screen. */
  meeting: boolean
  /** Whether there is a line of hers in the box to be copied. */
  said: boolean
  /** What is in the way, if anything is: something she is still standing
   * behind, or something that took her session with it. */
  trouble: 'stuck' | 'gone' | null
}

/**
 * In order, and the order is the answer: the first one that both matches the
 * key and holds where the window is wins. So ESC puts these keys away rather
 * than refusing her a tool, and refuses her a tool rather than stopping her —
 * the narrower thing on screen gets the key first.
 */
const KEYS: (Shortcut & { when: When })[] = [
  { when: 'up', press: 'escape', does: 'close', says: 'put these away' },
  { when: 'up', press: 'ctrl+k', does: 'close', says: 'put these away' },

  // An open report takes the arrows to be scrolled by and ESC to be put away,
  // the same way a list does — what is on screen is what is being answered.
  { when: 'reading', press: 'escape', does: 'close', says: 'put it away' },
  { when: 'reading', press: 'up', does: 'scroll-up', says: 'back up a bit' },
  { when: 'reading', press: 'down', does: 'scroll-down', says: 'on down a bit' },
  // The same key that takes her line takes the page while the page is what is
  // open: what is on screen is what is copied.
  { when: 'reading', press: 'ctrl+y', does: 'copy-page', says: 'copy it' },

  // How the work stands is a glance rather than a page: there is nothing on it
  // to move through and nothing to copy. The key that opened it closes it as
  // well, the way the keys overlay's does — pressed a second time it would
  // otherwise be the one key on the window that does nothing at all.
  { when: 'checking', press: 'escape', does: 'close', says: 'put it away' },
  { when: 'checking', press: 'ctrl+t', does: 'close', says: 'put it away' },

  // Who she is is the other way about: a document, longer than any box it can
  // be drawn in, so it takes the arrows the way what she wrote does rather
  // than being a glance. The key that opened it closes it as well, since the
  // panel above it set that habit and a page is no different from inside.
  { when: 'meeting', press: 'escape', does: 'close', says: 'put it away' },
  { when: 'meeting', press: 'ctrl+s', does: 'close', says: 'put it away' },
  { when: 'meeting', press: 'up', does: 'scroll-up', says: 'back up a bit' },
  { when: 'meeting', press: 'down', does: 'scroll-down', says: 'on down a bit' },

  // A list takes the keys that move through it and the one that takes what it
  // is on, and it takes ESC before she does: the list is what is being answered
  // while it is open, not her.
  // A path being typed is the list one step further in: the rows have been put
  // away and the same ESC that would have closed them closes this.
  { when: 'path', press: 'return', does: 'go', says: 'work there' },
  { when: 'path', press: 'escape', does: 'cancel', says: 'never mind' },

  // A list that can be typed at is the same list with every letter on it. No
  // key is called `type`, so nothing pressed ever comes to this — the list
  // takes the letters itself — but it is the list's to print, and the only
  // place it can be written down is here with the rest.
  { when: 'narrows', press: 'type', does: 'narrow', says: 'to narrow it' },

  // A list that takes several rows is the same list with one more key on it:
  // the one that ticks a row without leaving, so that Enter can mean done. It
  // is a question she asked, which is why Enter says what it says — "use it"
  // is for a model, not for an answer.
  { when: 'ticking', press: 'space', does: 'tick', says: 'tick it' },
  { when: 'ticking', press: 'return', does: 'choose', says: "that's all" },

  { when: 'picking', press: 'up', does: 'previous', says: 'the one above' },
  { when: 'picking', press: 'down', does: 'next', says: 'the one below' },
  { when: 'picking', press: 'return', does: 'choose', says: 'use it' },
  // Once something has been typed at the list, ESC takes that back first and
  // the list away second: the rows that went away are the nearer thing to
  // undo. Next to the ESC it stands in for, so the list prints them in the
  // same spot whichever one it is.
  { when: 'narrowed', press: 'escape', does: 'clear', says: 'start over' },
  { when: 'picking', press: 'escape', does: 'cancel', says: 'never mind' },

  // Something in the way takes the box the line she is spoken to on lives in,
  // and her question with it — both are drawn there and neither is drawn while
  // this is. Which key is offered is which way out there is: a session that
  // went with it can only be opened again, and one that survived only has to be
  // let go of.
  { when: 'gone', press: 'r', does: 'retry', says: 'try her again' },
  { when: 'troubled', press: 'escape', does: 'dismiss', says: 'put it away' },

  // None of these reach her from behind anything: a page, a list or a path over
  // the scene takes the whole keyboard, her question included — see `answerable`
  // below, which is the one place that is said.
  { when: 'asked', press: 'y', does: 'allow', says: 'let her' },
  { when: 'asked', press: 'n', does: 'refuse', says: "don't" },
  // Yes, and yes to the same thing again without being asked, for as long as
  // this session lasts and no longer. What "the same thing" comes to is printed
  // next to it by the box: it is the whole of what is being given away, and it
  // is different every time.
  { when: 'standing', press: 'a', does: 'always', says: 'always let her' },
  { when: 'asked', press: 'escape', does: 'refuse', says: "don't" },
  // A look before deciding, and the same key again to stop looking. It answers
  // nothing either way: y and n mean what they meant with it open.
  { when: 'asked', press: 'tab', does: 'details', says: 'what exactly' },

  { when: 'working', press: 'escape', does: 'stop', says: 'stop her' },

  { when: 'typing', press: 'return', does: 'send', says: 'say it' },
  // A break in what is being said rather than the end of it. Enter is the only
  // key that sends, so a sentence with more than one line in it has to be got
  // onto the line some other way — and this is the key a terminal is already
  // sending when it hands over a pasted line break of its own.
  //
  // A clipboard written on Windows is the one this cannot save: its breaks are
  // a carriage return and a linefeed both, the first of them is Enter by every
  // reading, and it has sent before the second arrives. Short of holding every
  // Enter back to see what comes behind it, a paste like that from a terminal
  // that does not wrap one still goes off a line at a time.
  { when: 'typing', press: 'ctrl+j', does: 'new-line', says: 'another line' },

  // Her words and nothing else — not the frame around them, and not what was
  // typed to her. Ctrl-Y because the keys that read as "copy" are spoken for:
  // Ctrl-C is the way out, and the line she is spoken to on has the rest.
  { when: 'said', press: 'ctrl+y', does: 'copy-line', says: 'copy her line' },
  { when: 'reported', press: 'ctrl+r', does: 'report', says: 'read what she wrote' },

  { when: 'always', press: 'ctrl+k', does: 'keys', says: 'these keys' },
  { when: 'always', press: 'ctrl+p', does: 'models', says: 'what she thinks with' },
  { when: 'always', press: 'ctrl+g', does: 'who', says: 'who is on shift' },
  // L for the language, and it is free where the obvious letters are not: the
  // line she is spoken to on wants Ctrl-A, Ctrl-E and Ctrl-U for itself.
  { when: 'always', press: 'ctrl+l', does: 'speaks', says: 'what she answers in' },
  { when: 'always', press: 'ctrl+f', does: 'where', says: 'where she works' },
  { when: 'always', press: 'ctrl+t', does: 'repo', says: 'how the work stands' },
  // Not the same question as who is on shift: that one swaps her, this one is
  // the words the girl already standing there is being played from.
  //
  // S for herself, rather than the W that "written" asks for: Ctrl-W is
  // rubbing out the last word on the line she is spoken to on, and it is the
  // only key that does — the other one the input answers to for it is
  // Ctrl-Backspace, which a terminal too old for the kitty protocol cannot
  // tell apart from plain Backspace. Taking Ctrl-K off that line costs a
  // half-written sentence that can be selected and typed over; taking this
  // would cost the key anybody rubbing out a word reaches for first.
  { when: 'always', press: 'ctrl+s', does: 'persona', says: 'how she is written' },
  { when: 'always', press: 'ctrl+o', does: 'talks', says: 'an earlier conversation' },
  // The way out of one, as well as the way to start over: the conversation a
  // window opens with is off that list the moment it is left, because nothing
  // was ever said in it, so without this a conversation picked up is a
  // conversation there is no leaving.
  { when: 'always', press: 'ctrl+n', does: 'fresh', says: 'a new conversation' },
  { when: 'always', press: 'ctrl+b', does: 'blocks', says: 'swap how she is drawn' },
  { when: 'always', press: 'ctrl+c', does: 'leave', says: 'leave' },
]

/** What the shortcuts are grouped under, in the order they are shown. */
const HEADINGS: Record<When, string> = {
  up: 'While these are up',
  reading: 'While what she wrote is open',
  checking: 'While how the work stands is up',
  meeting: 'While who she is is up',
  picking: 'While a list is open',
  ticking: 'While a list is open',
  narrows: 'While a list is open',
  narrowed: 'While a list is open',
  path: 'While a path is being typed',
  gone: 'While she cannot be reached',
  troubled: 'While something is in the way',
  asked: 'While she is waiting to be allowed',
  // Under a heading of its own, because the heading is where the one thing the
  // key cannot say in the width the box has for it gets said: what it gives
  // away is given away until she is closed and no longer.
  standing: 'For as long as this session lasts',
  working: 'While she is working',
  // Two of them, because what can be typed and what can be pressed read as one
  // thing to whoever is looking — they are shown under the one heading.
  typing: 'Whenever',
  // Under the same heading as the rest: having said or written something is
  // not a state she is in, it is one more thing that can be taken from wherever
  // the window happens to be.
  said: 'Whenever',
  reported: 'Whenever',
  always: 'Whenever',
}

export type Group = { heading: string; keys: Shortcut[] }

/**
 * Whether anything is standing over the scene: these keys, a page of what she
 * wrote or of who she is, the glance at how the work stands, a list, or a path
 * being typed in place of one. All of them are drawn over the box, so while one
 * of them holds the box is not what is being looked at.
 */
const covered = (where: Where) =>
  where.up || where.reading || where.checking || where.meeting || where.picking || where.path

/**
 * Whether her question is what a key would be answering. Only where nothing is
 * over the scene: her question is drawn in the box and a page goes over the box,
 * so a key pressed at the page would be granting a tool call the one pressing it
 * cannot see. It is not lost by that — it is still open on the server, still
 * where it was, and answerable again the moment the page is put away — it is
 * only that the keyboard belongs to whatever is in front of it. Which is the
 * same reason the letters were never hers while a path was being written out or
 * a list typed at: y, n and a are letters, and a folder under `~/Sync` would
 * otherwise answer her halfway through being typed.
 *
 * And her question is behind the note the same way the line she is spoken to on
 * is: still open on the server, not on screen, and so not answerable until the
 * note is put away.
 *
 * The box asks this as well as the window does. What is over the scene is drawn
 * up the middle of it and the box is pinned to the bottom, so the bottom of the
 * box shows under every one of them — and a row left saying "y let her" below a
 * page that has taken y is the promise this was fixed to stop making.
 */
export const answerable = (where: Where) => where.asked && !covered(where) && where.trouble === null

/**
 * Whether a group of keys is worth anything from where the window is.
 *
 * Having these keys on screen is not a state she is in — it is a sheet of paper
 * held up in front of one — so it takes ESC and the key that brought it, and
 * nothing else. Everything she was already waiting on is still waiting, and is
 * waiting still when the paper comes down; what it is not, while the paper is
 * up, is answerable, so none of it is listed here as though it were.
 */
const holds = (when: When, where: Where) =>
  when === 'always' ||
  (when === 'up' && where.up) ||
  (when === 'reading' && where.reading) ||
  (when === 'checking' && where.checking) ||
  (when === 'meeting' && where.meeting) ||
  (when === 'picking' && where.picking) ||
  (when === 'ticking' && where.picking && where.ticking) ||
  (when === 'narrows' && where.picking && where.narrows) ||
  (when === 'narrowed' && where.picking && where.narrowed) ||
  (when === 'path' && where.path) ||
  // Not while a list that takes letters is open: r is a letter, and the list
  // is what is being typed at.
  (when === 'gone' && where.trouble === 'gone' && !where.narrows) ||
  (when === 'troubled' && where.trouble === 'stuck') ||
  // Not while it is already open: the key that opens it is not worth offering
  // from inside it. Something in the way does not take it away — what she wrote
  // is on the scene either way, and a page already written is still readable
  // once she is not.
  (when === 'reported' && where.hasReport && !where.reading) ||
  // An empty box has nothing in it to copy, and a key that copied nothing and
  // said so would be worse than one not offered. The open page takes the same
  // key first, and is written down ahead of this.
  (when === 'said' && where.said) ||
  // The line she is spoken to on is behind these keys while they are up, behind
  // a list or a path being typed or an open report while one of those is, and
  // not drawn at all while something is in the way; a blurred input does not
  // take Enter — so it is not offered while any of those hold.
  // …and not while she is waiting to be allowed something: what she is asking
  // about is drawn where the line is, so there is no line there to type on.
  (when === 'typing' && !covered(where) && !where.asked && where.trouble === null) ||
  (when === 'asked' && answerable(where)) ||
  // Offered only where there is something narrow to say yes to: a tool nothing
  // is known about has no scope to give, and a key that read as "always" and
  // meant "anything" is the one thing this must never be.
  (when === 'standing' && where.standing && answerable(where)) ||
  (when === 'working' && where.isWorking && !where.asked)

/**
 * The keys that mean something right now, under what they belong to.
 *
 * Only what holds is listed, and only once: a key shown but not answered is
 * worse than one not shown at all, and a key the narrower group has already
 * taken would otherwise be listed a second time doing what it no longer does —
 * ESC puts these keys away, and while they are up that is all it does.
 */
export function keysNow(where: Where): Group[] {
  const groups: Group[] = []
  const taken = new Set<string>()
  for (const when of [
    'up',
    'reading',
    'checking',
    'meeting',
    'path',
    'narrows',
    'narrowed',
    'ticking',
    'picking',
    'gone',
    'troubled',
    'asked',
    'standing',
    'working',
    'typing',
    'said',
    'reported',
    'always',
  ] as const) {
    if (!holds(when, where)) continue
    const keys: Shortcut[] = []
    for (const { when: _, ...key } of KEYS.filter((one) => one.when === when)) {
      if (taken.has(key.press)) continue
      taken.add(key.press)
      keys.push(key)
    }
    if (!keys.length) continue
    const under = groups.find((group) => group.heading === HEADINGS[when])
    if (under) under.keys.push(...keys)
    else groups.push({ heading: HEADINGS[when], keys })
  }
  return groups
}

/** What a key press comes to, from where the window is. Nothing, if it is not
 * one of hers. */
export function pressed(key: { name?: string; ctrl?: boolean }, where: Where): Does | null {
  // A linefeed is Ctrl-J by another name: it is the byte that key sends, it is
  // what a terminal too old for the kitty protocol calls it, and it is what a
  // terminal that does not wrap a paste hands over for every line break in one.
  // Written down once, under the name anybody would look for it by.
  const named = key.name === 'linefeed' ? { name: 'j', ctrl: true } : key
  const press = `${named.ctrl ? 'ctrl+' : ''}${named.name ?? ''}`
  return KEYS.find((one) => one.press === press && holds(one.when, where))?.does ?? null
}

/** The key for one of the things the window does, for the places that show it
 * outside the overlay — the words under her permission question are the same
 * words the overlay uses, because they are the same entry. */
export function keyFor(does: Does): Shortcut {
  const found = KEYS.find((one) => one.does === does)!
  const { when: _, ...key } = found
  return key
}

/** The keys with a shape rather than a name on them. */
const ARROWS: Record<string, string> = { up: '↑', down: '↓' }

/**
 * What an open list answers to, for the list to print along its own bottom
 * edge — with the keys for ticking several rows in front, for a list that
 * takes several, and Enter meaning what it means there rather than twice; and
 * for a list that can be typed at, that it can be, with ESC meaning what it
 * means once something has been.
 *
 * It prints them itself because the overlay never gets the chance to: bringing
 * the overlay up puts the list away, so the two are never on screen together
 * and the list's keys would otherwise be written down nowhere anybody looks.
 */
export function listKeys(list: { ticking?: boolean; narrows?: boolean; narrowed?: boolean } = {}): Shortcut[] {
  const taken = new Set<string>()
  return KEYS.filter(
    (one) =>
      one.when === 'picking' ||
      (list.ticking && one.when === 'ticking') ||
      (list.narrows && one.when === 'narrows') ||
      (list.narrowed && one.when === 'narrowed'),
  )
    .filter((one) => !taken.has(one.press) && taken.add(one.press))
    .map(({ when: _, ...key }) => key)
}

/**
 * What the box a path is typed into answers to. It prints its own for the same
 * reason the list does — it is one thing over the scene, and bringing the
 * overlay up would take it away rather than explain it.
 */
export function pathKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'path').map(({ when: _, ...key }) => key)
}

/**
 * What an open report answers to, for the same reason a list prints its own:
 * the overlay is one thing over the scene and bringing it up puts the report
 * away, so these would be written down nowhere anybody looks.
 */
export function readingKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'reading').map(({ when: _, ...key }) => key)
}

/**
 * What the panel of how the work stands answers to, printed by the panel for
 * the same reason the list and the report print their own: bringing the overlay
 * up puts the panel away, so the two are never on screen together.
 */
export function checkingKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'checking').map(({ when: _, ...key }) => key)
}

/**
 * What the page of who she is answers to, printed by the page for the same
 * reason the report prints its own — and the arrows matter more here than
 * anywhere: her persona does not fit the box, and a page that showed the first
 * screenful of it with nothing saying there was more would read as the whole
 * of her.
 */
export function meetingKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'meeting').map(({ when: _, ...key }) => key)
}

/** A key as it is worth printing: the terminal's names for them are not the
 * ones on the keyboard. */
export function shownAs(press: string): string {
  const held = press.startsWith('ctrl+')
  const name = held ? press.slice('ctrl+'.length) : press
  const shown =
    name === 'escape'
      ? 'ESC'
      : name === 'return'
        ? 'Enter'
        : name === 'tab'
          ? 'Tab'
          : name === 'space'
            ? 'Space'
            : name === 'type'
              ? 'Type'
              : ARROWS[name] ?? name
  return held ? `Ctrl-${shown.toUpperCase()}` : shown
}

/** The one key nobody would guess at, and what the corner falls back to: with
 * nothing else worth saying there, it is what the rest of them are behind. */
const HINT = `${shownAs('ctrl+k')} ${keyFor('keys').says}`

/**
 * What the box says in its bottom corner, which is where this window has always
 * put the key that matters from here.
 *
 * Asked rather than told: ESC is three different things depending on what she
 * is in the middle of, and the corner used to say so whether or not it was
 * true. With these keys up — or with what she wrote open over the box — it says
 * nothing: they are the corner's own subject, and they are on screen saying it
 * better.
 */
export function cornerFor(where: Where): string {
  if (where.up || where.reading || where.checking || where.meeting) return ''
  const escapes = pressed({ name: 'escape' }, where)
  if (escapes) return `${shownAs('escape')} ${keyFor(escapes).says}`
  // Something she wrote is the one thing worth saying from an idle corner — it
  // is the only sign that there is a page there at all, and it goes on saying
  // so for as long as the page is there to open.
  if (where.hasReport) return `${shownAs('ctrl+r')} ${keyFor('report').says}`
  return HINT
}
