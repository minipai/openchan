import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { note } from '../notes'

/**
 * The folder she works in.
 *
 * opencode settles a session's folder when the session is opened and never
 * after — the same way it settles whose words she is wearing — so moving her is
 * closing one conversation and opening another somewhere else. None of that is
 * here. What is here is only the part that can be worked out without a terminal
 * or a server: what a typed path comes to, whether there is anything there, and
 * which folders are worth offering.
 */

/** Where she starts: the folder the window was started in, which is the one
 * opencode would have taken by itself. */
export const OPENED_IN = process.cwd()

/**
 * The row that is not a folder: taking it asks for a path instead of picking
 * one, because the folder wanted is very often one she has never been in. Every
 * other row's id is an absolute path, so nothing can be mistaken for it.
 */
export const TYPE_A_PATH = 'type a path'

/** How many folders are worth remembering. The list is this and one more row —
 * a list longer than the frame scrolls, and scrolling to reach the folder used
 * once in March is worse than having forgotten it. */
const AT_MOST = 8

/**
 * What was typed, as a folder.
 *
 * `~` is the master's home and anything not starting at the root is read from
 * where she is now — the two things anyone typing a path into a terminal
 * expects, and the two that make the difference between a shortcut and a
 * folder that is not there.
 */
export function asPath(typed: string, from: string): string {
  const said = typed.trim()
  const spelt =
    said === '~' ? os.homedir() : said.startsWith('~/') ? path.join(os.homedir(), said.slice(2)) : said
  const full = path.resolve(from, spelt)
  // Two spellings of one folder are one folder. `/tmp` is `/private/tmp` here
  // and plenty of projects are reached through a symlinked parent — spelt the
  // other way round, a folder she is already in reads as somewhere new, and
  // moving there would tear down a working session to arrive where it was.
  try {
    return fs.realpathSync(full)
  } catch {
    return full
  }
}

/**
 * Why she cannot be moved there, in the words the box says it in. Nothing, if
 * she can.
 *
 * A path is the one thing on this screen that is typed rather than picked, so
 * it is also the one thing that can be wrong — and a session opened onto
 * nothing comes back as the server failing to start, several seconds later,
 * with no way of telling that a mistyped path is what did it.
 */
export function troubleWith(where: string): string | null {
  // Being nowhere is the quiet answer; the rest of the ways a path can fail —
  // one under a file, one behind a folder nobody may open, one symlinked in a
  // circle — are thrown rather than returned, and a window that will not open
  // because one line of the note went bad is worse than any of them.
  let found
  try {
    found = fs.statSync(where, { throwIfNoEntry: false })
  } catch (trouble) {
    return (trouble as NodeJS.ErrnoException).code === 'EACCES'
      ? 'She is not allowed in there'
      : 'There is no folder there'
  }
  if (!found) return 'There is no folder there'
  if (!found.isDirectory()) return 'That is a file, not a folder'
  // Being a folder is not the same as being one she can get into. One somebody
  // else owns stats perfectly well and then has nothing in it she is allowed to
  // read — and by the time that is found out the conversation she was having
  // has been closed to make room for it.
  try {
    fs.accessSync(where, fs.constants.R_OK | fs.constants.X_OK)
  } catch {
    return 'She is not allowed in there'
  }
  return null
}

/** A folder as it is worth reading: the master's home written the way he writes
 * it himself, because the full path of everything under it is mostly his own
 * name repeated. */
export function shortened(where: string): string {
  const home = os.homedir()
  if (where === home) return '~'
  return where.startsWith(`${home}${path.sep}`) ? `~${where.slice(home.length)}` : where
}

/**
 * A folder cut down to what fits the strip it is written on: the tail of it,
 * which is the half that says which folder it is. What she is doing is written
 * on the same line, and a path long enough to want the whole of it is exactly
 * the one that would have been printed over the top of it.
 */
export function fitted(where: string, within: number): string {
  const letters = [...where]
  if (letters.length <= within) return where
  return `…${letters.slice(letters.length - within + 1).join('')}`
}

/**
 * The rows the list offers: where she is now, then wherever else she has been,
 * then the one that asks for a path.
 *
 * Where she is now is always the first of them, whether or not it has been
 * written down yet — the list marks the folder in force, and a mark on a row
 * that is not there is no mark at all.
 */
export function folderRows(current: string, been: string[]) {
  const folders = [current, ...been.filter((one) => one !== current)].slice(0, AT_MOST)
  return [
    ...folders.map((one) => ({ id: one, label: shortened(one) })),
    { id: TYPE_A_PATH, label: 'Type a path…' },
  ]
}

/**
 * Every folder she has been in, most recent first — minus the ones that are not
 * there any more. A folder that has been moved or deleted since is a row that
 * could only fail, and it fails several seconds after it is picked.
 */
export function folders(): string[] {
  const NOTE = note('folders')
  const written = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : ''
  return written
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one && troubleWith(one) === null)
    .slice(0, AT_MOST)
}

/** One more folder written down where the next window will find it, in front of
 * the rest — the list is in the order she was last in them. */
export function rememberFolder(where: string) {
  const NOTE = note('folders')
  const kept = [where, ...folders().filter((one) => one !== where)].slice(0, AT_MOST)
  fs.mkdirSync(path.dirname(NOTE), { recursive: true })
  fs.writeFileSync(NOTE, kept.join('\n'))
}
