import { expect } from 'bun:test'
import { windowTestKit } from './windowTestKit'

const { onScreen, test } = windowTestKit()

/** Everything an agent could count, counted — said the only way the window can
 * hear it, which is the one thing this panel is being checked for: nothing
 * about it knows what is underneath. */
const EVERYTHING = {
  turns: 3,
  cost: 0.42,
  input: 12_438,
  output: 1_204,
  reasoning: 34,
  cacheRead: 9_000,
  cacheWrite: 1_024,
}

test('what she has spent is opened over the scene, and put away again', async () => {
  const { wakeUp, raise, hold, escape, type, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: EVERYTHING })

  await hold('u')
  expect(frame()).toContain('What she has spent')
  // What is being answered about, said on the panel: what she has spent while
  // standing here, rather than anybody's allowance.
  expect(frame()).toContain('her turns, since she started here')
  expect(frame()).toContain('3 turns · $0.42')
  expect(frame()).toContain('12,438 in · 1,204 out · 34 thinking')
  expect(frame()).toContain('cache 9,000 read · 1,024 written')
  expect(frame()).toContain('ESC put it away')

  await escape()
  expect(frame()).not.toContain('What she has spent')
  // And the line she is spoken to on is hers to type on again.
  await type('hello')
  expect(frame()).toContain('hello')
})

test('the key that opened it closes it', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: EVERYTHING })

  await hold('u')
  expect(frame()).toContain('What she has spent')
  await hold('u')
  expect(frame()).not.toContain('What she has spent')
})

test('an agent that counts nothing gets a panel that says so', async () => {
  // Nothing has been counted at all — which is where the window starts, and
  // where it stays behind an agent that keeps no counts. Not an error, and not
  // an empty gauge.
  const { wakeUp, hold, escape, frame } = await onScreen()
  await wakeUp()

  await hold('u')
  expect(frame()).toContain('What she has spent')
  expect(frame()).toContain('nothing counted yet')
  await escape()
  expect(frame()).not.toContain('nothing counted yet')
})

test('a count the agent did not keep is left out rather than drawn as an error', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  // Words in and out, and nothing else: no money, no thinking counted apart,
  // no cache. Every one of those is a field an agent may simply not keep.
  await raise({ kind: 'spends', spend: { turns: 2, input: 900, output: 40 } })

  await hold('u')
  expect(frame()).toContain('2 turns')
  expect(frame()).toContain('900 in · 40 out')
  // Nothing stands in for what was not counted — no nought, no dash, no word
  // about a field being missing.
  expect(frame()).not.toContain('cache')
  expect(frame()).not.toContain('$')
  expect(frame()).not.toContain('thinking')
  expect(frame()).not.toContain('undefined')
})

test('turns counted with nothing else about them says which of the two it is', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: { turns: 2 } })

  await hold('u')
  expect(frame()).toContain('2 turns')
  expect(frame()).toContain('nothing about them is counted')
})

test('the panel says nothing to her, and can be opened before there is a session', async () => {
  // Nothing has woken up: no models, no conversation, nobody to ask. The counts
  // came off turns she has already had, so there is nothing here to ask her —
  // which is why the panel opens over no session at all.
  const { her, hold, frame } = await onScreen()

  await hold('u')
  expect(frame()).toContain('What she has spent')
  expect(frame()).toContain('nothing counted yet')
  expect(her.asked).toEqual([])
  expect(her.interrupted).toBe(0)
})

test('a key pressed at the panel does not answer a question drawn behind it', async () => {
  const { her, wakeUp, raise, hold, press, escape, frame } = await onScreen()
  await wakeUp()
  await raise({
    kind: 'ask-permission',
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf /',
    standing: { scope: 'bash rm', covers: 'anything rm does' },
  })
  expect(frame()).toContain('y let her')

  await hold('u')
  // Her question is drawn in the box and the panel goes over the box, so the
  // row offering the keys for it is off screen with it — and the letters are
  // not hers while it is up. A y pressed here would be granting a tool call the
  // one pressing it cannot see.
  expect(frame()).not.toContain('y let her')
  await press('y')
  await press('a')
  expect(her.answered).toEqual([])

  // And it was never lost: put the panel away and she is waiting for it still.
  await escape()
  expect(frame()).toContain('y let her')
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
})

test('the key is written down where all the keys are written down', async () => {
  // The overlay reads the same table the window presses off, so a key that
  // works and is not listed — or listed and does not work — cannot happen. What
  // this checks is that it is worth listing whenever, like the rest of them.
  const { wakeUp, hold, frame } = await onScreen()
  await wakeUp()

  await hold('k')
  expect(frame()).toContain('what she has spent')
})

test('what she has spent moves as she spends it, without the panel being reopened', async () => {
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: { turns: 1, input: 100 } })

  await hold('u')
  expect(frame()).toContain('1 turn')
  expect(frame()).toContain('100 in')
  // The agent counts, and the panel is holding what it counted rather than a
  // reading it took on the way in.
  await raise({ kind: 'spends', spend: { turns: 2, input: 350 } })
  expect(frame()).toContain('2 turns')
  expect(frame()).toContain('350 in')
})

test('the next girl starts from nothing, and the panel says which it means', async () => {
  // "Since she started here" is the whole claim on the panel, so it has to be
  // true at the one edge where it could stop being: sending for one of the
  // others closes her session and opens another, and nothing the girl who was
  // standing there spent is the next girl's to be shown as hers.
  const { sessions, wakeUp, raise, hold, arrow, enter, escape, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: { turns: 3, cost: 2.4, input: 900 } })
  await hold('u')
  expect(frame()).toContain('3 turns · $2.40')
  await escape()

  // Nothing has been said, so the other girl comes out now.
  await hold('g')
  await arrow('down')
  await enter()
  expect(sessions).toHaveLength(2)

  await hold('u')
  expect(frame()).toContain('nothing counted yet')
  expect(frame()).not.toContain('$2.40')
})

test('an agent with one meter and no turn count still fills the panel', async () => {
  // Nothing about the panel may rest on the turn count: the next agent behind
  // her can have one meter for the session and no way to say which turn any of
  // it belongs to, and the numbers it does have are still worth showing.
  const { wakeUp, raise, hold, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'spends', spend: { cost: 1.5, input: 900, output: 40 } })

  await hold('u')
  expect(frame()).toContain('$1.50')
  expect(frame()).toContain('900 in · 40 out')
  // No count of turns anywhere — the panel says what it was told and no more.
  // The words "her turns" are still up top: that line says whose spending this
  // is, not how many of them there were.
  expect(frame()).not.toMatch(/\d+ turns?/)
  expect(frame()).not.toContain('undefined')
})
