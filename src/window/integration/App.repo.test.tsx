import { expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { elsewhereFolder, windowTestKit } from './windowTestKit'
import { OPENED_IN } from '../../between/folder'
import { howItStands } from '../../between/repo'

const { onScreen } = windowTestKit()
/** Somewhere real that nobody keeps in git: the master's temp folder is not
 * anybody's repository, which is the state being checked. */
const elsewhere = elsewhereFolder()
/** And somewhere else again, made into a repository with work waiting in it:
 * kept apart from the folder above so that neither test can be the reason the
 * other one passes. */
const aRepo = elsewhereFolder()

/** The line the panel writes about the window's own folder — the tests are run
 * in this repository, so opening the panel over it is opening it over a real
 * one. Taken from git rather than written down: what the branch is called
 * changes with the work, and the tests are run from a HEAD that is not on one
 * often enough — mid-rebase, or on a checkout somebody else made — that
 * writing the branch into the test would be writing down the wrong thing. */
const branchHere = async () => {
  const work = (await howItStands(OPENED_IN))!
  return work.branch === null ? 'not on a branch' : `on ${work.branch}`
}

/**
 * Waiting for git rather than for a render: the panel asks when it is opened
 * and draws "looking…" until the answer is back, which is a command away
 * rather than a frame away.
 */
const until = async (
  screen: { frame: () => string; settle: (work: () => Promise<void>) => Promise<void> },
  words: string,
) => {
  for (let tries = 0; tries < 200 && !screen.frame().includes(words); tries++) {
    await screen.settle(() => Bun.sleep(5))
  }
  expect(screen.frame()).toContain(words)
}

test('how the work stands is opened over the folder she is in, and put away again', async () => {
  const screen = await onScreen()
  const { wakeUp, hold, escape, type, frame } = screen
  await wakeUp()

  await hold('t')
  expect(frame()).toContain('How the work stands')
  await until(screen, await branchHere())
  expect(frame()).toContain('ESC put it away')

  await escape()
  expect(frame()).not.toContain('How the work stands')
  // And the line she is spoken to on is hers to type on again.
  await type('hello')
  expect(frame()).toContain('hello')
})

test('asking how the work stands says nothing to her', async () => {
  const screen = await onScreen()
  const { her, wakeUp, hold, escape, frame } = screen
  await wakeUp()

  await hold('t')
  await until(screen, await branchHere())
  await escape()

  // The folder was read where it lies. Nothing was sent, nothing was asked of
  // her, and the turn she was not having was not interrupted.
  expect(her.asked).toEqual([])
  expect(her.interrupted).toBe(0)
  expect(frame()).toContain('Say something to her…')
})

test('the folder can be asked about before there is a session at all', async () => {
  // Nothing has woken up: no models, no conversation, nobody to ask. The
  // panel is not hers to answer, so it opens anyway — which is the whole point
  // of reading the folder rather than asking her about it.
  const screen = await onScreen()
  const { her, hold, frame } = screen

  await hold('t')
  await until(screen, await branchHere())
  expect(frame()).toContain('How the work stands')
  expect(her.asked).toEqual([])
})

test('a folder nobody keeps in git says so instead of failing', async () => {
  const screen = await onScreen()
  const { hold, escape, frame } = screen
  // Moved somewhere that is not a repository, and nobody's fault.
  await movedTo(screen, elsewhere)

  await hold('t')
  await until(screen, 'nothing kept in git here')
  // Named as a state rather than as something that went wrong: it is in the
  // panel like any other answer, and the panel is put away the same way.
  expect(frame()).toContain('How the work stands')
  expect(frame()).toContain('ESC put it away')
  await escape()
  expect(frame()).not.toContain('nothing kept in git here')
})

/** git, run over a folder of the test's own making, with nothing of the
 * master's own config allowed to decide what it does. */
const git = (where: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=noname', '-c', 'user.email=noname@example.com', ...args], {
    cwd: where,
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })

/** Her, moved to a folder of the test's own: off the row of the list that asks
 * for a path rather than offering one. */
async function movedTo(screen: Awaited<ReturnType<typeof onScreen>>, where: string) {
  await screen.wakeUp()
  await screen.hold('f')
  await screen.arrow('up')
  await screen.enter()
  await screen.type(where)
  await screen.enter()
  expect(screen.frame()).not.toContain('Enter work there')
}

test('what is waiting is counted on screen, and counted again when it is opened again', async () => {
  git(aRepo, 'init', '-b', 'work')
  fs.writeFileSync(path.join(aRepo, 'written-down.txt'), 'for the next commit\n')
  git(aRepo, 'add', 'written-down.txt')
  fs.writeFileSync(path.join(aRepo, 'nobody-mentioned.txt'), 'new\n')

  const screen = await onScreen()
  const { hold, escape, frame } = screen
  await movedTo(screen, aRepo)

  await hold('t')
  await until(screen, '1 staged · 1 untracked')
  expect(frame()).toContain('on work')

  // Something else written while the panel was away. The whole reason the
  // folder is read on opening rather than kept anywhere is that it can have
  // moved on since the last look — so the second look must say so.
  await escape()
  fs.writeFileSync(path.join(aRepo, 'and-another.txt'), 'new\n')
  await hold('t')
  await until(screen, '1 staged · 2 untracked')
})
