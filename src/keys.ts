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
 * input's own, and `leave` belongs to the renderer, which is the one that knows
 * how to put the terminal back. They are here to be listed. */
export type Does = 'send' | 'stop' | 'allow' | 'refuse' | 'blocks' | 'keys' | 'close' | 'leave'

/** When a key is worth anything: whenever, while she is working, while she is
 * waiting to be allowed, or while these keys are on screen. */
type When = 'always' | 'working' | 'asked' | 'up'

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

  { when: 'asked', press: 'y', does: 'allow', says: 'let her' },
  { when: 'asked', press: 'n', does: 'refuse', says: "don't" },
  { when: 'asked', press: 'escape', does: 'refuse', says: "don't" },

  { when: 'working', press: 'escape', does: 'stop', says: 'stop her' },

  { when: 'always', press: 'return', does: 'send', says: 'say it' },
  { when: 'always', press: 'ctrl+k', does: 'keys', says: 'these keys' },
  { when: 'always', press: 'ctrl+b', does: 'blocks', says: 'draw her rougher' },
  { when: 'always', press: 'ctrl+c', does: 'leave', says: 'leave' },
]

/** What the shortcuts are grouped under, in the order they are shown. */
const HEADINGS: Record<When, string> = {
  up: 'While these are up',
  asked: 'While she is waiting to be allowed',
  working: 'While she is working',
  always: 'Whenever',
}

export type Group = { heading: string; keys: Shortcut[] }

/** Whether a group of keys is worth anything from where the window is. */
const holds = (when: When, where: Where) =>
  when === 'always' ||
  (when === 'up' && where.up) ||
  (when === 'asked' && where.asked && !where.up) ||
  (when === 'working' && where.isWorking && !where.asked && !where.up)

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
  for (const when of ['up', 'asked', 'working', 'always'] as const) {
    if (!holds(when, where)) continue
    const keys = KEYS.filter((key) => key.when === when && !taken.has(key.press)).map(
      ({ when: _, ...key }) => key,
    )
    for (const key of keys) taken.add(key.press)
    if (keys.length) groups.push({ heading: HEADINGS[when], keys })
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

/** A key as it is worth printing: the terminal's names for them are not the
 * ones on the keyboard. */
export function shownAs(press: string): string {
  const held = press.startsWith('ctrl+')
  const name = held ? press.slice('ctrl+'.length) : press
  const shown = name === 'escape' ? 'ESC' : name === 'return' ? 'Enter' : name
  return held ? `Ctrl-${shown.toUpperCase()}` : shown
}
