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
 * input's own, moving through a list and choosing off it belong to the list,
 * and `leave` belongs to the renderer, which is the one that knows how to put
 * the terminal back. They are here to be listed. */
export type Does =
  | 'send'
  | 'stop'
  | 'allow'
  | 'refuse'
  | 'blocks'
  | 'keys'
  | 'close'
  | 'leave'
  | 'models'
  | 'who'
  | 'report'
  | 'scroll-up'
  | 'scroll-down'
  | 'previous'
  | 'next'
  | 'choose'
  | 'cancel'

/**
 * The ones the window does not do itself, and so does not take the key away
 * from whatever is underneath: the line she is spoken to on takes Enter, an
 * open list and an open report take the arrows, the list takes Enter, and the
 * renderer takes Ctrl-C.
 */
const THEIRS: Does[] = ['send', 'previous', 'next', 'choose', 'leave', 'scroll-up', 'scroll-down']

/** Whether pressing it is the window's own to act on — and so to keep from
 * reaching what is drawn under it. */
export const takes = (does: Does) => !THEIRS.includes(does)

/** When a key is worth anything: whenever, while there is a line to type into,
 * while she is working, while she is waiting to be allowed, while a list is
 * open, while there is something she wrote to read, while it is open, or while
 * these keys are on screen. */
type When = 'always' | 'typing' | 'working' | 'asked' | 'picking' | 'reported' | 'reading' | 'up'

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
  /** Whether there is a list open to pick something off. */
  picking: boolean
  /** Whether what she wrote is open and being read. */
  reading: boolean
  /** Whether she has written something there is a report to open at all. */
  hasReport: boolean
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

  // A list takes the keys that move through it and the one that takes what it
  // is on, and it takes ESC before she does: the list is what is being answered
  // while it is open, not her.
  { when: 'picking', press: 'up', does: 'previous', says: 'the one above' },
  { when: 'picking', press: 'down', does: 'next', says: 'the one below' },
  { when: 'picking', press: 'return', does: 'choose', says: 'use it' },
  { when: 'picking', press: 'escape', does: 'cancel', says: 'never mind' },

  { when: 'asked', press: 'y', does: 'allow', says: 'let her' },
  { when: 'asked', press: 'n', does: 'refuse', says: "don't" },
  { when: 'asked', press: 'escape', does: 'refuse', says: "don't" },

  { when: 'working', press: 'escape', does: 'stop', says: 'stop her' },

  { when: 'typing', press: 'return', does: 'send', says: 'say it' },

  { when: 'reported', press: 'ctrl+r', does: 'report', says: 'read what she wrote' },

  { when: 'always', press: 'ctrl+k', does: 'keys', says: 'these keys' },
  { when: 'always', press: 'ctrl+p', does: 'models', says: 'what she thinks with' },
  { when: 'always', press: 'ctrl+g', does: 'who', says: 'who is on shift' },
  { when: 'always', press: 'ctrl+b', does: 'blocks', says: 'swap how she is drawn' },
  { when: 'always', press: 'ctrl+c', does: 'leave', says: 'leave' },
]

/** What the shortcuts are grouped under, in the order they are shown. */
const HEADINGS: Record<When, string> = {
  up: 'While these are up',
  reading: 'While what she wrote is open',
  picking: 'While a list is open',
  asked: 'While she is waiting to be allowed',
  working: 'While she is working',
  // Two of them, because what can be typed and what can be pressed read as one
  // thing to whoever is looking — they are shown under the one heading.
  typing: 'Whenever',
  // Under the same heading as the rest: having written something is not a state
  // she is in, it is one more thing that can be opened from wherever the window
  // happens to be.
  reported: 'Whenever',
  always: 'Whenever',
}

export type Group = { heading: string; keys: Shortcut[] }

/**
 * Whether a group of keys is worth anything from where the window is.
 *
 * Having these keys on screen is not a state she is in — it is a sheet of paper
 * held up in front of one — so it takes ESC and the key that brought it, and
 * nothing else. Everything she was already waiting on is still waiting, and
 * still answerable: the most likely moment to want this list is while she is
 * asking to be allowed something.
 */
const holds = (when: When, where: Where) =>
  when === 'always' ||
  (when === 'up' && where.up) ||
  (when === 'reading' && where.reading) ||
  (when === 'picking' && where.picking) ||
  // Not while it is already open: the key that opens it is not worth offering
  // from inside it.
  (when === 'reported' && where.hasReport && !where.reading) ||
  // The line she is spoken to on is behind these keys while they are up, and
  // behind a list or an open report while one of those is; a blurred input does
  // not take Enter — so it is not offered while any of them are.
  (when === 'typing' && !where.up && !where.picking && !where.reading) ||
  (when === 'asked' && where.asked) ||
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
  for (const when of ['up', 'reading', 'picking', 'asked', 'working', 'typing', 'reported', 'always'] as const) {
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
  const press = `${key.ctrl ? 'ctrl+' : ''}${key.name ?? ''}`
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
 * edge.
 *
 * It prints them itself because the overlay never gets the chance to: bringing
 * the overlay up puts the list away, so the two are never on screen together
 * and the list's keys would otherwise be written down nowhere anybody looks.
 */
export function listKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'picking').map(({ when: _, ...key }) => key)
}

/**
 * What an open report answers to, for the same reason a list prints its own:
 * the overlay is one thing over the scene and bringing it up puts the report
 * away, so these would be written down nowhere anybody looks.
 */
export function readingKeys(): Shortcut[] {
  return KEYS.filter((one) => one.when === 'reading').map(({ when: _, ...key }) => key)
}

/** A key as it is worth printing: the terminal's names for them are not the
 * ones on the keyboard. */
export function shownAs(press: string): string {
  const held = press.startsWith('ctrl+')
  const name = held ? press.slice('ctrl+'.length) : press
  const shown =
    name === 'escape' ? 'ESC' : name === 'return' ? 'Enter' : ARROWS[name] ?? name
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
  if (where.up || where.reading) return ''
  const escapes = pressed({ name: 'escape' }, where)
  if (escapes) return `${shownAs('escape')} ${keyFor(escapes).says}`
  // Something she wrote is the one thing worth saying from an idle corner — it
  // is the only sign that there is a page there at all, and it goes on saying
  // so for as long as the page is there to open.
  if (where.hasReport) return `${shownAs('ctrl+r')} ${keyFor('report').says}`
  return HINT
}
