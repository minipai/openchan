import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { App } from './App'
import type { Character } from './cast'
import type { BridgeEvent, Conversation } from './protocol'

/** Her, with nobody behind her: it wakes up at once and lets the test say
 * things on her behalf. */
class Stand implements Conversation {
  constructor(
    private say: (event: BridgeEvent) => void,
    readonly who: Character,
  ) {}
  async start() {
    this.say({ kind: 'ready' })
  }
  raise(event: BridgeEvent) {
    this.say(event)
  }
  ask() {}
  use() {}
  answer() {}
  interrupt() {}
  retry() {}
  close() {}
}

/** What a terminal is unless someone has resized it. */
const TERMINAL = { width: 80, height: 24 }

/** What she could think with, and what she wrote this turn: one of each, worded
 * so that finding it on screen means that one thing and nothing else. */
const MODEL = { id: 'zen/ox', label: 'Ox Alpha' }
const REPORT = { title: 'Colours', body: 'The needle was in the second haystack.' }

/** Every window a test opened, so the next test starts on an empty terminal
 * rather than on top of the last one's. */
const opened: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of opened.splice(0)) setup.renderer.destroy()
})

/** The whole window over a stand-in, awake, with nothing over the scene yet and
 * something for each of the things that can stand there. */
async function onScreen() {
  let her!: Stand
  const setup = await testRender(
    <App behind={undefined} open={(say, who) => (her = new Stand(say, who))} />,
    TERMINAL,
  )
  opened.push(setup)
  const settle = async (work: () => void | Promise<void>) => {
    await act(async () => void (await work()))
    await setup.flush()
  }
  await act(async () => void (await setup.flush()))
  const stand = her!
  const raise = (event: BridgeEvent) => settle(() => stand.raise(event))
  await raise({ kind: 'thinks-with', models: [MODEL], using: MODEL.id })
  return {
    frame: () => setup.captureCharFrame(),
    raise,
    /** Held with Ctrl, which is how every key that opens one of these is
     * pressed. */
    hold: (key: string) => settle(() => setup.mockInput.pressKey(key, { ctrl: true })),
    /** Enter, which is how a list is taken off rather than put away: ESC never
     * reaches the window through a mock terminal. */
    choose: () => settle(() => setup.mockInput.pressEnter()),
    type: (text: string) => settle(() => setup.mockInput.typeText(text)),
  }
}

test('the list opened last is the only one standing', async () => {
  const { hold, frame } = await onScreen()

  await hold('p')
  expect(frame()).toContain(MODEL.label)

  await hold('g')
  expect(frame()).toContain('Who is on shift')
  expect(frame()).not.toContain(MODEL.label)
})

test('the keys put away what was over the scene, and go away again', async () => {
  const { hold, frame } = await onScreen()

  await hold('p')
  await hold('k')
  expect(frame()).toContain('put these away')
  expect(frame()).not.toContain(MODEL.label)

  await hold('k')
  expect(frame()).not.toContain('put these away')
})

test('what she wrote and a list do not stand on each other', async () => {
  const { hold, raise, frame } = await onScreen()
  await raise({ kind: 'reports', report: REPORT })

  await hold('r')
  expect(frame()).toContain('needle')

  await hold('p')
  expect(frame()).toContain(MODEL.label)
  expect(frame()).not.toContain('needle')
})

test('nothing said reaches her line while something is over it', async () => {
  const { hold, choose, type, frame } = await onScreen()

  await hold('p')
  await type('hello')
  expect(frame()).not.toContain('hello')

  // And the line has it back the moment the list is off the screen.
  await choose()
  await type('hello')
  expect(frame()).toContain('hello')
})
