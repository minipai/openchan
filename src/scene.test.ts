import { expect, test } from 'bun:test'
import { handedOver, hold, next, OPENING, unspoken, type Scene } from './scene'
import type { Trouble } from './protocol'

/** Her server never came up. There is nobody to speak to until she is opened
 * again, which is the one thing left to try. */
const LOST: Trouble = {
  title: 'She could not be woken up',
  body: 'The opencode server behind her did not start.',
  detail: 'spawn opencode ENOENT',
  gone: true,
}

/** Something in the way of the model she is on, with her still standing there:
 * the session is fine, and nothing said on that model will get through. */
const STUCK: Trouble = {
  title: 'She is not signed in to anthropic',
  body: 'opencode has no credentials for anthropic.',
  gone: false,
}

/** Mid-turn: she has been asked something and has not finished answering. */
const working: Scene = { ...OPENING, isWorking: true, isReady: true }

/** Her session is open: she can be spoken to. */
const up: Scene = next(OPENING, { kind: 'ready' })

test('she says a line, and wears the face she signed it with', () => {
  const scene = next(working, {
    kind: 'says',
    line: 'Right away, goshujin-sama',
    expression: 'happy',
    mood: '【 happy ＼(ˆ ᗜ ˆ)／ 】',
  })

  expect(scene.line).toBe('Right away, goshujin-sama')
  expect(scene.expression).toBe('happy')
  expect(scene.mood).toBe('【 happy ＼(ˆ ᗜ ˆ)／ 】')
})

test('a line with no marker yet leaves the face she was already wearing', () => {
  const worn: Scene = { ...working, expression: 'focused', mood: '【 focused 】' }

  const scene = next(worn, { kind: 'says', line: 'One moment' })

  expect(scene.expression).toBe('focused')
  expect(scene.mood).toBe('【 focused 】')
})

test('picking something up is narrated', () => {
  const scene = next(working, { kind: 'doing', label: 'reading brain.ts' })

  expect(scene.narration).toBe('reading brain.ts')
})

test('speaking again puts the narration down', () => {
  const busy = next(working, { kind: 'doing', label: 'reading brain.ts' })

  expect(next(busy, { kind: 'says', line: 'Found it' }).narration).toBeNull()
})

test('a tool she may not use yet becomes a question on screen', () => {
  const scene = next(working, {
    kind: 'ask-permission',
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf dist',
    detail: 'set -e\nrm -rf dist',
  })

  expect(scene.permission).toEqual({
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf dist',
    detail: 'set -e\nrm -rf dist',
  })
})

test('a tool that came with nothing but its name is still a question', () => {
  // Everything opencode asks about says what it would be used for, but the
  // question is the tool's name and the y/n — the rest is what the box would
  // show if it had it.
  const scene = next(working, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  expect(scene.permission).toEqual({ askId: 'ask-1', toolName: 'bash', summary: null, detail: null })
})

test('the turn closing puts her down and takes any question with it', () => {
  const spoken = next(working, { kind: 'says', line: 'There you go' })
  const asked = next(spoken, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  const scene = next(asked, { kind: 'done' })

  expect(scene.isWorking).toBe(false)
  expect(scene.permission).toBeNull()
  // A turn that ended on its own leaves the last thing she said on screen —
  // clearing it would blank the box the instant she stops talking.
  expect(scene.line).toBe('There you go')
})

test('nothing but the turn closing decides whether she is working', () => {
  const idle = next(OPENING, { kind: 'doing', label: 'reading brain.ts' })

  expect(idle.isWorking).toBe(false)
})

test('a turn that ended badly is hers to say out loud', () => {
  const spoken = next(working, { kind: 'says', line: 'Working on it' })

  const scene = next(spoken, { kind: 'done', error: 'the server went away' })

  expect(scene.line).toBe('the server went away')
  expect(scene.isWorking).toBe(false)
})

test('she cannot be spoken to until her session says so', () => {
  expect(OPENING.isReady).toBe(false)
  expect(up.isReady).toBe(true)
})

test('something said before she is up waits instead of going nowhere', () => {
  const scene = hold(OPENING, 'are you there?')

  expect(scene.held).toBe('are you there?')
  // The whole of the bug: she used to be put to work over a prompt that was
  // never sent, and sat at "thinking…" until ESC.
  expect(scene.isWorking).toBe(false)
})

test('what was held is still there when she wakes up', () => {
  const waited = next(hold(OPENING, 'are you there?'), { kind: 'ready' })

  expect(waited.isReady).toBe(true)
  expect(waited.held).toBe('are you there?')
})

test('saying something else before she is up corrects what she gets', () => {
  const waited = hold(hold(OPENING, 'are you ther'), 'are you there?')

  expect(waited.held).toBe('are you there?')
})

test('handing it over is what puts her to work', () => {
  const waited = next(hold(OPENING, 'are you there?'), { kind: 'ready' })

  const scene = handedOver(waited, 'are you there?')

  expect(scene.held).toBeNull()
  expect(scene.isWorking).toBe(true)
  expect(scene.line).toBe('')
})

test('something said once she is up is held for no time at all', () => {
  const scene = handedOver(hold(up, 'good morning'), 'good morning')

  expect(scene.isWorking).toBe(true)
  expect(scene.held).toBeNull()
})

test('an empty line is not something to hold', () => {
  expect(hold(up, '   ').held).toBeNull()
  expect(hold(up, '   ').isWorking).toBe(false)
})

test('what was typed while the last one was on its way is not lost with it', () => {
  const second = hold(hold(up, 'are you there?'), 'never mind — what time is it?')

  const scene = handedOver(second, 'are you there?')

  expect(scene.isWorking).toBe(true)
  expect(scene.held).toBe('never mind — what time is it?')
})

test('a session that never opens is said in words, and stops her being waited on', () => {
  const waiting = hold(OPENING, 'are you there?')

  const scene = next(waiting, { kind: 'trouble', trouble: LOST })

  expect(scene.trouble).toEqual(LOST)
  expect(scene.isWorking).toBe(false)
  // Nobody to speak to: what is typed from here waits rather than being posted
  // into a session that is not there.
  expect(scene.isReady).toBe(false)
})

test('what was said to her outlives the session it was said to', () => {
  const waiting = hold(OPENING, 'are you there?')

  const scene = next(waiting, { kind: 'trouble', trouble: LOST })

  // It used to be let go of here, because nothing could ever open. Opening her
  // again is a key press away now, and a sentence that survives it is the whole
  // point of having held it.
  expect(scene.held).toBe('are you there?')
})

test('trouble she is still standing behind leaves her there to be spoken to', () => {
  const scene = next(up, { kind: 'trouble', trouble: STUCK })

  expect(scene.trouble).toEqual(STUCK)
  expect(scene.isReady).toBe(true)
})

test('a question raised before it has nobody left to answer it', () => {
  const asked = next(working, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  const scene = next(asked, { kind: 'trouble', trouble: LOST })

  expect(scene.permission).toBeNull()
  expect(scene.isWorking).toBe(false)
})

test('a question on a session that is still standing waits behind the note', () => {
  const asked = next(working, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  const scene = next(asked, { kind: 'trouble', trouble: STUCK })

  // The server is still holding this one open. Letting go of it here would take
  // the only thing that can answer it off the screen and leave the tool call
  // waiting for good.
  expect(scene.permission).toEqual({ askId: 'ask-1', toolName: 'bash', summary: null, detail: null })
})

test('clearing it gives the scene back without anything being reopened', () => {
  const stuck = next(up, { kind: 'trouble', trouble: STUCK })

  const scene = next(stuck, { kind: 'trouble', trouble: null })

  expect(scene.trouble).toBeNull()
  expect(scene.isReady).toBe(true)
})

test('she can be opened again, and what was held goes to whoever opens', () => {
  const lost = next(hold(OPENING, 'are you there?'), { kind: 'trouble', trouble: LOST })

  // What a retry says, in order: the trouble is over, and there is a session.
  const cleared = next(lost, { kind: 'trouble', trouble: null })
  const scene = next(cleared, { kind: 'ready' })

  expect(scene.trouble).toBeNull()
  expect(scene.isReady).toBe(true)
  expect(scene.held).toBe('are you there?')
})

test('a session that has gone can be given to somebody else mid-sentence', () => {
  const said = next(working, { kind: 'says', line: 'Right away' })

  // Nothing left to interrupt: there is no session under the conversation any
  // more, and a different girl is a different server.
  expect(unspoken(next(said, { kind: 'trouble', trouble: LOST }))).toBe(true)
  // One she is still standing behind is a conversation like any other.
  expect(unspoken(next(said, { kind: 'trouble', trouble: STUCK }))).toBe(false)
})

test('what she wrote arrives beside her line rather than instead of it', () => {
  const spoken = next(working, { kind: 'says', line: 'Found it~' })

  const scene = next(spoken, { kind: 'reports', report: { title: 'What was wrong', body: '## What was wrong\n\nthe parser' } })

  expect(scene.line).toBe('Found it~')
  expect(scene.report).toEqual({ title: 'What was wrong', body: '## What was wrong\n\nthe parser' })
})

test('the turn closing leaves what she wrote where it is', () => {
  // Putting the reader away is the window simply not drawing it — so the report
  // has to still be on the scene afterwards, and nothing between receiving it
  // and the next prompt may take it.
  const wrote = next(working, { kind: 'reports', report: { title: 'What was wrong', body: 'the parser' } })

  const scene = next(next(wrote, { kind: 'says', line: 'Anything else?' }), { kind: 'done' })

  expect(scene.report).toEqual({ title: 'What was wrong', body: 'the parser' })
})

test('the next thing she is asked takes last turn’s report with it', () => {
  const wrote = next(up, { kind: 'reports', report: { title: 'What was wrong', body: 'the parser' } })

  const scene = handedOver(hold(wrote, 'and the other one?'), 'and the other one?')

  expect(scene.report).toBeNull()
})

test('a page she turned out not to be writing is taken off the scene again', () => {
  // Where the writing starts is read off half-finished text: a `#` on its own
  // is a heading until the next character makes it a hashtag. A page offered
  // over that and never withdrawn would still be offered at the end of the
  // turn with nothing in it.
  const guessed = next(working, { kind: 'reports', report: { title: 'Here is the tag', body: '#' } })

  expect(next(guessed, { kind: 'reports', report: null }).report).toBeNull()
})
