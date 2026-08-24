import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * How the work stands in the folder she is in.
 *
 * Nothing here goes anywhere near her. The folder is the master's, and what git
 * says about it is a question the window can ask on its own — asking her would
 * mean spending a turn, waiting on a tool call, and getting the answer as a
 * sentence rather than a number. So the window reads it itself, and a session
 * that is busy, waiting, or not there at all makes no difference to it.
 */

/** What is in the tree, in the three piles git keeps them in. */
export type Work = {
  /** The branch she is on, and nothing at all when HEAD is not on one —
   * mid-rebase, or sitting on a commit. What that is worth printing as is the
   * panel's to say, not this. */
  branch: string | null
  /** Written down for the next commit. */
  staged: number
  /** Changed since, and not written down yet. Anything git is in the middle of
   * a conflict over is counted here: a tree with a conflict in it is the last
   * one that should read as having nothing in it. */
  changed: number
  /** What git has never been told about, counted as git lists it: a whole new
   * folder is one row and so one of these, not the thirty files in it. The
   * number under the panel is the number `git status` would show. */
  untracked: number
}

/** Whether nothing is waiting in any of the three piles. */
export const settled = (work: Work) => work.staged === 0 && work.changed === 0 && work.untracked === 0

/**
 * What git says about a folder, or nothing at all where it will not say.
 *
 * Nothing covers every way there is no answer — a folder no repository was ever
 * made in, which is the ordinary one, and the rarer ones where git is not there
 * to run or will not speak about a folder it does not trust. They come to the
 * same thing on screen, and none of them is raised as a failure: most folders
 * are not repositories, and a panel that threw over one would be worse than one
 * that says there is nothing here to count.
 */
export async function howItStands(folder: string): Promise<Work | null> {
  let said
  try {
    // v2 because it is the format with the branch in it: the one command
    // answers both halves of the panel, and its paths are quoted rather than
    // printed raw, so a filename with a line break in it stays one line.
    said = (
      await run(
        'git',
        // Not the index: a plain `git status` rewrites it as it goes, and she
        // is working in this same folder — a glance taken while she is in the
        // middle of `git add` would take the lock out from under her and fail
        // her command rather than this one.
        // How much to say about what git has never been told about is
        // something the master can have set for his own `git status`, either
        // way: told to leave them out, a folder with nothing in it but new
        // files would read as having nothing waiting. What this counts is not
        // his to configure, so it is asked for outright.
        ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--untracked-files=normal'],
        // As much as git cares to say. A megabyte is the default and it is a
        // real amount of work in a real folder — a wide refactor reaches it —
        // and what happens past it is that the command is killed, which reads
        // from here as a folder with nothing kept in git. Being wrong about
        // that is the one thing this must not be.
        { cwd: folder, maxBuffer: Infinity },
      )
    ).stdout
  } catch {
    return null
  }
  return read(said)
}

/**
 * What git wrote, as the three piles and a branch.
 *
 * Apart from the running of it so that it can be read against output nobody
 * had to make a repository to get.
 */
export function read(said: string): Work {
  const work: Work = { branch: null, staged: 0, changed: 0, untracked: 0 }
  for (const line of said.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      // What git writes where a branch name would go when HEAD is not on one.
      work.branch = head === '(detached)' ? null : head
      continue
    }
    // A changed file, or one renamed or copied: the two letters after it are
    // what is written down for the commit and what has changed since, a dot in
    // either place meaning nothing on that side.
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const [staged, changed] = [line[2], line[3]]
      if (staged !== '.') work.staged++
      if (changed !== '.') work.changed++
      continue
    }
    // One git cannot merge on its own. It is neither written down nor simply
    // changed — but it is certainly not nothing, so it goes in with the rest of
    // what the tree is holding.
    if (line.startsWith('u ')) work.changed++
    else if (line.startsWith('? ')) work.untracked++
  }
  return work
}
