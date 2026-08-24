import { expect, test } from 'bun:test'
import type { BridgeEvent } from '../../between/protocol'
import { WHISPERED_FOR } from '../box/Whispers'
import { REPORT, windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

test('her line, and the face and mood she signed it with, land in the box', async () => {
  const { wakeUp, type, enter, raise, frame } = await onScreen()
  await wakeUp()
  expect(frame()).toContain('her face is neutral')
  await type('good morning')
  await enter()

  await raise({ kind: 'says', line: 'Good morning, master.' })
  expect(frame()).toContain('Good morning, master.')

  await raise({
    kind: 'says',
    line: 'Good morning, master.',
    expression: 'happy',
    mood: '【 開心 ＼(ˆ ᗜ ˆ)／ 】',
  })
  await raise({ kind: 'done' })

  // The mood takes the corner her waiting line had, once she has stopped, and
  // the face goes to the sprite — the stand-in one, which writes it down.
  expect(frame()).toContain('【 開心 ＼(ˆ ᗜ ˆ)／ 】')
  expect(frame()).toContain('her face is happy')
  expect(frame()).not.toContain('her face is neutral')
  expect(frame()).not.toContain('is thinking…')
})

test('a selection made with the mouse reaches the clipboard when it is let go of', async () => {
  const { wakeUp, raise, dragOver, clipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'The needle was in the second haystack.' })
  await raise({ kind: 'done' })

  await dragOver('needle was in the second')
  // The words dragged over and nothing else — not the rest of her line, and
  // not the cell the drag was let go of on.
  expect(clipboard).toEqual(['needle was in the second'])
  expect(frame()).toContain('copied the selection')
})

test('her whole line is copied from the keyboard, as she said it', async () => {
  const { wakeUp, raise, hold, clipboard, frame } = await onScreen()
  await wakeUp()
  // Nothing to copy yet, so nothing is copied and nothing is said about it.
  await hold('y')
  expect(clipboard).toEqual([])
  expect(frame()).not.toContain('copied')

  await raise({ kind: 'says', line: 'Good morning, master.\nThe needle was in the second haystack.' })
  await raise({ kind: 'done' })
  await hold('y')
  // As she said it, with the break between her two lines — not as the box
  // wrapped it.
  expect(clipboard).toEqual(['Good morning, master.\nThe needle was in the second haystack.'])
  expect(frame()).toContain('copied her line')
})

test('while what she wrote is open, the same key copies the page', async () => {
  const { wakeUp, raise, hold, clipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'reports', report: REPORT })
  await raise({ kind: 'done' })

  await hold('r')
  await hold('y')
  expect(clipboard).toEqual([REPORT.body])
  // Said under the page rather than behind it.
  expect(frame()).toContain('copied the page')
  expect(frame()).toContain('ESC put it away')
})

test('a terminal that will not take a clipboard write is said to have refused', async () => {
  const { wakeUp, raise, hold, refuseClipboard, frame } = await onScreen()
  await wakeUp()
  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'done' })

  refuseClipboard()
  await hold('y')
  expect(frame()).not.toContain('copied')
  expect(frame()).toContain('this terminal will not take a clipboard write')
})

test('the key that copies her line is listed, and takes nothing from the line she is spoken to on', async () => {
  const { wakeUp, raise, hold, type, escape, frame } = await onScreen()
  await wakeUp()
  await hold('k')
  expect(frame()).not.toContain('copy her line')
  await escape()

  await raise({ kind: 'says', line: 'I found it.' })
  await raise({ kind: 'done' })
  await hold('k')
  expect(frame()).toContain('Ctrl-Y')
  expect(frame()).toContain('copy her line')
  // Pressed from there, with the keys still up: what it says is in the strip
  // under the box, whole, rather than half behind the keys.
  await hold('y')
  expect(frame()).toContain('copied her line')
  expect(frame()).toContain('Ctrl-Y')
  await escape()

  // Half a sentence, the key, and the rest of it: nothing typed is lost to it.
  await type('where was')
  await hold('y')
  await type(' it?')
  expect(frame()).toContain('where was it?')
})

/**
 * The clock, for the one thing on this screen that counts out a moment of its
 * own.
 *
 * A whisper takes itself off after a couple of seconds, and a test that waited
 * for that would be a test that sat still for them. Everybody else's clock is
 * left alone: the renderer underneath is hanging moments of its own the whole
 * time it is up, and stopping those stops the terminal rather than the whisper.
 * So only the ones hung for exactly as long as a whisper lasts are caught here,
 * and they come due when the test says the time has passed.
 */
function heldMoments() {
  const real = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  const held = new Map<object, { due: number; run: () => void }>()
  let now = 0
  globalThis.setTimeout = ((run: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms !== WHISPERED_FOR) return real(run, ms, ...rest)
    const token = {}
    held.set(token, { due: now + ms, run })
    return token
  }) as unknown as typeof setTimeout
  globalThis.clearTimeout = ((token: object) => {
    if (!held.delete(token)) realClear(token as Parameters<typeof clearTimeout>[0])
  }) as typeof clearTimeout
  return {
    /** That much of it, passed. Whatever was due by then has happened. */
    passes: (ms: number) => {
      now += ms
      for (const [token, moment] of [...held]) {
        if (moment.due > now) continue
        held.delete(token)
        moment.run()
      }
    },
    /** The real one back, however the test went. */
    give: () => {
      globalThis.setTimeout = real
      globalThis.clearTimeout = realClear
    },
  }
}

/** What she has just put down, as the session says it. */
const whispered = (text: string, kind: 'did' | 'failed' = 'did'): BridgeEvent =>
  ({ kind: 'whispers', whisper: { text, kind } })

test('a word about what she just did goes up beside her, and takes itself away again', async () => {
  const clock = heldMoments()
  try {
    const { wakeUp, raise, settle, frame } = await onScreen()
    await wakeUp()
    await raise({ kind: 'says', line: 'It was in the second haystack' })
    await raise({ kind: 'doing', label: 'reading brain.ts' })

    await raise(whispered('read brain.ts'))

    expect(frame()).toContain('· read brain.ts')
    // Neither of the two lines anybody actually reads has been touched.
    expect(frame()).toContain('It was in the second haystack')
    expect(frame()).toContain('reading brain.ts')

    await settle(() => clock.passes(WHISPERED_FOR))

    // Gone on its own, with nobody pressing anything and nothing else moving.
    expect(frame()).not.toContain('· read brain.ts')
    expect(frame()).toContain('It was in the second haystack')
    expect(frame()).toContain('reading brain.ts')
  } finally {
    clock.give()
  }
})

test('several of them stand together, each with its own moment', async () => {
  const clock = heldMoments()
  try {
    const { wakeUp, raise, settle, frame } = await onScreen()
    await wakeUp()
    await raise({ kind: 'says', line: 'It was in the second haystack' })

    await raise(whispered('read brain.ts'))
    await raise(whispered('wrote scene.ts'))

    // Both of them, rather than the second over the first — and her line under
    // neither.
    expect(frame()).toContain('· read brain.ts')
    expect(frame()).toContain('· wrote scene.ts')
    expect(frame()).toContain('It was in the second haystack')

    // One raised halfway through theirs keeps a whole moment of its own.
    await settle(() => clock.passes(WHISPERED_FOR / 2))
    await raise(whispered('looked for the needle'))
    await settle(() => clock.passes(WHISPERED_FOR / 2))

    expect(frame()).not.toContain('· read brain.ts')
    expect(frame()).not.toContain('· wrote scene.ts')
    expect(frame()).toContain('· looked for the needle')

    await settle(() => clock.passes(WHISPERED_FOR / 2))

    expect(frame()).not.toContain('· looked for the needle')
  } finally {
    clock.give()
  }
})

test('a burst of them gives way at the top rather than running down the screen', async () => {
  const clock = heldMoments()
  try {
    const { wakeUp, raise, frame } = await onScreen()
    await wakeUp()
    await raise({ kind: 'says', line: 'It was in the second haystack' })

    // One more than there is room for, all inside one of their moments: the
    // oldest goes as the fourth arrives rather than waiting its moment out.
    await raise(whispered('read brain.ts'))
    await raise(whispered('wrote scene.ts'))
    await raise(whispered('ran bun test', 'failed'))
    await raise(whispered('looked for the needle'))

    expect(frame()).not.toContain('· read brain.ts')
    expect(frame()).toContain('· wrote scene.ts')
    expect(frame()).toContain('× ran bun test')
    expect(frame()).toContain('· looked for the needle')
    expect(frame()).toContain('It was in the second haystack')
  } finally {
    clock.give()
  }
})

test('a word too long for the row is cut rather than laid across the window', async () => {
  const clock = heldMoments()
  try {
    const { wakeUp, raise, frame } = await onScreen()
    await wakeUp()

    await raise(whispered(`ran bun test --filter ${'the whole of it '.repeat(20)}`))

    // One row, ending inside the box it is drawn over rather than running on
    // across the window or wrapping onto a second row.
    const rows = frame().split('\n').filter((row) => row.includes('ran bun test'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.trimEnd().length).toBeLessThanOrEqual(77)
    expect(rows[0]).toContain('…')

    // Cut by the cells it is drawn in rather than by its length: a Japanese
    // filename is two of them a letter, and counted the other way it takes the
    // row with it.
    await raise(whispered(`read ${'これは長いファイル名です'.repeat(6)}.ts`))
    expect(frame().split('\n').filter((row) => row.includes('read これ'))).toHaveLength(1)
  } finally {
    clock.give()
  }
})
