import { AsyncLocalStorage } from 'node:async_hooks'
import os from 'node:os'
import path from 'node:path'

/**
 * Where the little notes that outlive a window are kept.
 *
 * The master's are under their home. A caller may point its own asynchronous
 * work somewhere else, which is how tests get a private notebook without ever
 * opening the real one. The filename is joined here rather than where each
 * note is read so a new note automatically follows the same rule.
 */
const pointed = new AsyncLocalStorage<string>()

export const note = (name: string) =>
  path.join(pointed.getStore() ?? path.join(os.homedir(), '.openchan'), name)

/** Point this asynchronous work, and everything it starts, at another set of notes. */
export const withNotesAt = <T>(folder: string, work: () => T): T => pointed.run(folder, work)
