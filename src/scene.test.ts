import { expect, test } from 'bun:test'
import { next, OPENING, type Scene } from './scene'

/** Mid-turn: she has been asked something and has not finished answering. */
const working: Scene = { ...OPENING, isWorking: true }

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
  const asked = next(working, { kind: 'ask-permission', askId: 'ask-1', toolName: 'bash' })

  const scene = next(asked, { kind: 'done' })

  expect(scene.isWorking).toBe(false)
  expect(scene.permission).toBeNull()
})

test('a turn that ended badly is hers to say out loud', () => {
  const spoken = next(working, { kind: 'says', line: 'Working on it' })

  const scene = next(spoken, { kind: 'done', error: 'the server went away' })

  expect(scene.line).toBe('the server went away')
  expect(scene.isWorking).toBe(false)
})
