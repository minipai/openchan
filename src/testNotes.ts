import { afterAll, test as bunTest } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { withNotesAt } from './notes'

/**
 * A test file's own empty set of notes.
 *
 * Called once by each file that reads or writes them. Every test starts with
 * the directory empty, and AsyncLocalStorage keeps simultaneously running
 * files pointed at their own one. Nothing here names an individual note, so a
 * fifth one is isolated without another fixture to remember.
 */
export function testNotes() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-notes-'))

  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }))

  return {
    file: (name: string) => path.join(folder, name),
    test: (name: string, work: () => void | Promise<unknown>) =>
      bunTest(name, () =>
        withNotesAt(folder, () => {
          fs.rmSync(folder, { recursive: true, force: true })
          fs.mkdirSync(folder)
          return work()
        }),
      ),
  }
}
