import { afterAll, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { howItStands, read, settled } from './repo'

/** Every folder these made, gone again afterwards. */
const made: string[] = []
afterAll(() => {
  for (const one of made) fs.rmSync(one, { recursive: true, force: true })
})

/** A folder of its own, outside anybody's repository: the master's temp folder
 * is not one, which is what makes it somewhere to ask about. */
function folder(): string {
  const where = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-repo-')))
  made.push(where)
  return where
}

/** git, told nothing about whoever is running it: these repositories are made
 * and thrown away inside the test, and nothing written down on the machine —
 * a name, an address, a signing key it would insist on, a hook of the master's
 * own that would be run against a temp folder — may be what decides whether it
 * passes. */
const git = (where: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=noname', '-c', 'user.email=noname@example.com', ...args], {
    cwd: where,
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })

/** A repository with one file in it, committed, on a branch with a name worth
 * checking against. */
function repo(): string {
  const where = folder()
  git(where, 'init', '-b', 'work')
  fs.writeFileSync(path.join(where, 'kept.txt'), 'as it was\n')
  git(where, 'add', 'kept.txt')
  git(where, 'commit', '-m', 'the first of it')
  return where
}

test('a repository with nothing waiting says which branch it is and nothing else', async () => {
  const work = (await howItStands(repo()))!
  expect(work).toEqual({ branch: 'work', staged: 0, changed: 0, untracked: 0 })
  expect(settled(work)).toBe(true)
})

test('a repository with work in it counts it in the three piles it is in', async () => {
  const where = repo()
  // One of each: a tracked file changed since the last commit, a new one
  // written down for the next, and one git has never been told about.
  fs.writeFileSync(path.join(where, 'kept.txt'), 'not as it was\n')
  fs.writeFileSync(path.join(where, 'added.txt'), 'new\n')
  git(where, 'add', 'added.txt')
  fs.writeFileSync(path.join(where, 'nobody-mentioned.txt'), 'new\n')

  const work = (await howItStands(where))!
  expect(work).toEqual({ branch: 'work', staged: 1, changed: 1, untracked: 1 })
  expect(settled(work)).toBe(false)
})

test('a folder no repository was ever made in is nothing rather than trouble', async () => {
  // Neither thrown nor reported as a failure: most folders are not
  // repositories, and the panel opened over one has simply nothing to count.
  expect(await howItStands(folder())).toBeNull()
})

test('a file staged and changed again since is in both piles at once', async () => {
  const where = repo()
  fs.writeFileSync(path.join(where, 'kept.txt'), 'written down\n')
  git(where, 'add', 'kept.txt')
  fs.writeFileSync(path.join(where, 'kept.txt'), 'and changed again\n')

  expect(await howItStands(where)).toEqual({ branch: 'work', staged: 1, changed: 1, untracked: 0 })
})

test('a HEAD that is not on a branch has no name to give', async () => {
  const where = repo()
  git(where, 'checkout', '--detach')

  const work = (await howItStands(where))!
  expect(work.branch).toBeNull()
  expect(settled(work)).toBe(true)
})

test('what the master told git to leave out of his own status is counted anyway', async () => {
  const where = repo()
  // His `git status` is his; the panel's numbers are the panel's, and a folder
  // with nothing in it but new files must not read as having nothing waiting.
  git(where, 'config', 'status.showUntrackedFiles', 'no')
  fs.writeFileSync(path.join(where, 'nobody-mentioned.txt'), 'new\n')

  expect(await howItStands(where)).toEqual({ branch: 'work', staged: 0, changed: 0, untracked: 1 })
})

test('a file renamed is one file, written down once', async () => {
  const where = repo()
  git(where, 'mv', 'kept.txt', 'called-something-else.txt')

  // The row git writes for it is the one with a score and two paths on it, and
  // the two letters that say which pile it is in are where they are on any
  // other row.
  expect(await howItStands(where)).toEqual({ branch: 'work', staged: 1, changed: 0, untracked: 0 })
})

test('a file git cannot merge on its own counts as work rather than as nothing', () => {
  // Read rather than made: a conflict takes two branches and a merge to arrive
  // at, and what is being checked is the one line that reads the row.
  expect(read('# branch.head work\nu UU N... 100644 100644 100644 100644 aaa bbb ccc both.txt\n')).toEqual({
    branch: 'work',
    staged: 0,
    changed: 1,
    untracked: 0,
  })
})
