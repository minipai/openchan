import { expect, test } from 'bun:test'
import { branchLine } from './RepoBox'

test('a branch name that fits the room it is given is written whole', () => {
  expect(branchLine('main', 20)).toBe('on main')
})

test('a branch name too long for the room keeps the end of itself, cut to width', () => {
  const cut = branchLine('dev/sta-69-a-branch-name-nobody-would-fit-on-one-line', 20)
  expect(cut).toBe('on …-fit-on-one-line')
  expect(cut).toHaveLength(20)
})

test('no branch at all is said as such', () => {
  expect(branchLine(null, 20)).toBe('not on a branch')
})
