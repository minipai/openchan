import { afterAll, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { asPath, fitted, folderRows, shortened, troubleWith, TYPE_A_PATH } from './folder'

/** A real folder and a real file in it: whether a path is anywhere is the one
 * thing here that cannot be worked out from the string. */
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-folder-')))
const file = path.join(scratch, 'a-file')
fs.writeFileSync(file, 'not a folder')
fs.mkdirSync(path.join(scratch, 'a-folder'))
afterAll(() => {
  // The one folder shut against her has to be opened again before it can go.
  fs.chmodSync(path.join(scratch, 'shut'), 0o700)
  fs.rmSync(scratch, { recursive: true, force: true })
})

const home = os.homedir()

test('a path is read the way it is typed into a terminal', () => {
  // `~` on its own is the home folder, and `~/…` is under it.
  expect(asPath('~', scratch)).toBe(home)
  expect(asPath('~/Dev', scratch)).toBe(path.join(home, 'Dev'))
  // Anything not starting at the root is read from where she is now.
  expect(asPath('under', scratch)).toBe(path.join(scratch, 'under'))
  expect(asPath('..', scratch)).toBe(path.dirname(scratch))
  // A path pasted in comes with whatever was around it.
  expect(asPath(`  ${scratch}  `, home)).toBe(scratch)
})

test('a path that is not a folder is said to be one before a session opens on it', () => {
  expect(troubleWith(scratch)).toBeNull()
  // The two ways of typing a folder that is not there — one that is nothing at
  // all, and one that is something else.
  expect(troubleWith(path.join(scratch, 'nowhere'))).toBe('There is no folder there')
  expect(troubleWith(file)).toBe('That is a file, not a folder')
})

test('a path under a file is answered rather than thrown', () => {
  // Asking about it is what throws, and it is asked from inside a render as
  // well as from the line it was typed on: one bad line of the note would
  // otherwise stop the window opening at all.
  expect(troubleWith(path.join(file, 'under'))).toBe('There is no folder there')
})

test('a folder she cannot get into is turned down before the conversation is closed', () => {
  const shut = path.join(scratch, 'shut')
  fs.mkdirSync(shut, { mode: 0o000 })

  // It is a folder, and it stats perfectly well. She simply cannot read a word
  // in it, which is only found out after the session she was in has been closed
  // to make room for the one over there.
  expect(troubleWith(shut)).toBe('She is not allowed in there')
})

test('two spellings of one folder are one folder', () => {
  const link = path.join(scratch, 'the-long-way-round')
  fs.symlinkSync(path.join(scratch, 'a-folder'), link)

  // Otherwise the folder she is already in reads as somewhere new, and moving
  // there tears down a working session to arrive where it was.
  expect(asPath(link, scratch)).toBe(path.join(scratch, 'a-folder'))
  expect(asPath(path.join(link, '..', 'a-folder'), scratch)).toBe(path.join(scratch, 'a-folder'))
})

test('a folder too long for the strip it is written on keeps the end of itself', () => {
  // The end is the half that says which folder it is; the beginning is the
  // same few folders every time.
  expect(fitted('/one/two', 20)).toBe('/one/two')
  expect(fitted('/one/two/three/four', 10)).toBe('…hree/four')
  expect(fitted('/one/two/three/four', 10)).toHaveLength(10)
})

test('a folder is written the way the master writes it himself', () => {
  expect(shortened(home)).toBe('~')
  expect(shortened(path.join(home, 'Dev', 'openchan'))).toBe(path.join('~', 'Dev', 'openchan'))
  // Not everything under a folder whose name starts the same way.
  expect(shortened(`${home}-elsewhere`)).toBe(`${home}-elsewhere`)
  expect(shortened('/etc')).toBe('/etc')
})

test('the list opens on where she is now, whether or not she has been there before', () => {
  const rows = folderRows('/one', [])

  expect(rows[0]!.id).toBe('/one')
  // …and the row that asks for a path is the last of them, so the list is never
  // empty and never only that row.
  expect(rows.at(-1)!.id).toBe(TYPE_A_PATH)
  expect(rows.at(-1)!.label).toBe('Type a path…')
})

test('where she is now is offered once, not twice', () => {
  const rows = folderRows('/one', ['/two', '/one', '/three'])

  expect(rows.map((row) => row.id)).toEqual(['/one', '/two', '/three', TYPE_A_PATH])
})

test('a list longer than the frame is cut rather than left to scroll', () => {
  const many = Array.from({ length: 20 }, (_, at) => `/been/${at}`)
  const rows = folderRows('/one', many)

  expect(rows).toHaveLength(9)
  expect(rows.slice(0, -1).map((row) => row.id)).toEqual(['/one', ...many.slice(0, 7)])
})
