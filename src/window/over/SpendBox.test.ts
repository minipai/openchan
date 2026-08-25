import { expect, test } from 'bun:test'
import { spentSoFar } from './SpendBox'

/** Everything an agent could count, all of it counted. */
const everything = {
  turns: 3,
  cost: 0.0412,
  input: 12_438,
  output: 1_204,
  reasoning: 34,
  cacheRead: 9_000,
  cacheWrite: 1_024,
}

test('everything counted is written out in the piles it was counted in', () => {
  expect(spentSoFar(everything)).toEqual([
    '3 turns · $0.04',
    '12,438 in · 1,204 out · 34 thinking',
    'cache 9,000 read · 1,024 written',
  ])
})

test('nothing counted at all says so rather than drawing an empty gauge', () => {
  expect(spentSoFar(null)).toEqual(['nothing counted yet'])
})

test('turns counted and nothing else says which of the two it is', () => {
  // An agent that keeps no counts is a perfectly ordinary agent. What it comes
  // to is a panel that says there is nothing to say — not a row of dashes, and
  // not a line that reads as a panel still loading.
  expect(spentSoFar({ turns: 2 })).toEqual(['2 turns', 'nothing about them is counted'])
})

test('a pile nobody counted is left out rather than printed as a nought', () => {
  // The whole of what "handled without placeholder errors" comes to: a count
  // that is missing is missing, and a nought would be a number somebody took.
  expect(spentSoFar({ turns: 1, input: 400, output: 12 })).toEqual(['1 turn', '400 in · 12 out'])
  // Half a cache is half a line, not a line with a hole in it.
  expect(spentSoFar({ turns: 1, cacheRead: 900 })).toEqual(['1 turn', 'cache 900 read'])
  // And money on its own is money on its own.
  expect(spentSoFar({ turns: 1, cost: 2 })).toEqual(['1 turn · $2.00'])
})

test('a nought that was counted is not the same as one that was not', () => {
  // A subscription counts money and the answer is nought. It is said, because
  // it was counted — this is the one nought on the panel that is a number.
  expect(spentSoFar({ turns: 1, cost: 0, input: 5 })).toEqual(['1 turn · $0.00', '5 in'])
})

test('money too small for two places is written in as many as it takes', () => {
  // A turn that cost four thousandths of a dollar cost something, and "$0.00"
  // would be the panel saying it did not. The same argument holds all the way
  // down: a free model's turn costs millionths, and it still cost them.
  expect(spentSoFar({ turns: 1, cost: 0.004 })).toEqual(['1 turn · $0.0040'])
  expect(spentSoFar({ turns: 1, cost: 0.00003 })).toEqual(['1 turn · $0.000030'])
  expect(spentSoFar({ turns: 1, cost: 1.239 })).toEqual(['1 turn · $1.24'])
  // And no further than it takes: a total that rounds to two places is written
  // in two, however many places the sum of it happened to land on.
  expect(spentSoFar({ turns: 1, cost: 0.009999999999999998 })).toEqual(['1 turn · $0.01'])
})

test('money too small to write out at all is said in words rather than in noughts', () => {
  // Past a millionth the places stop being money and start being a way of
  // printing nought that takes six characters to do it — and a row of noughts
  // over something that was paid for is the one thing this must not print.
  expect(spentSoFar({ turns: 1, cost: 0.0000004 })).toEqual(['1 turn · under $0.000001'])
})

test('one turn is a turn', () => {
  expect(spentSoFar({ turns: 1, input: 1 })[0]).toBe('1 turn')
  expect(spentSoFar({ turns: 2, input: 1 })[0]).toBe('2 turns')
})

test('a count nobody could read at a glance is marked off in thousands', () => {
  expect(spentSoFar({ turns: 1, input: 1_234_567 })).toEqual(['1 turn', '1,234,567 in'])
})

test('an agent that counts no turns still gets its numbers written out', () => {
  // One meter for the session and no way to say which turn any of it belongs
  // to. The turn count is the panel's only mandatory-looking number, and an
  // agent without one must not be the reason it says nothing.
  expect(spentSoFar({ cost: 1.5, input: 900, output: 40 })).toEqual(['$1.50', '900 in · 40 out'])
  expect(spentSoFar({ input: 900 })).toEqual(['900 in'])
})

test('an agent that counts neither turns nor anything else says nothing counted', () => {
  expect(spentSoFar({})).toEqual(['nothing counted yet'])
})

test('no turn of hers finished yet is nothing counted rather than no turns', () => {
  // She is mid-way through the first one. "0 turns" would be a number about a
  // turn that is happening.
  expect(spentSoFar({ turns: 0 })).toEqual(['nothing counted yet'])
})
