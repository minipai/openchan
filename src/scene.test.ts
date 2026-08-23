import { expect, test } from 'bun:test'
import { handedOver, hold, next, OPENING, type Scene } from './scene'

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
  const scene = next(working, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  expect(scene.permission).toEqual({ askId: 'ask-1', toolName: 'bash' })
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
