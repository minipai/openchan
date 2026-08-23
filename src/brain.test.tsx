import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { useMaid } from './brain'
import type { BridgeEvent, Conversation, Model, OpenConversation } from './protocol'

/** What the stand-in says she could think with. */
const MODELS: Model[] = [
  { id: 'opencode/free', label: 'opencode · Free' },
  { id: 'anthropic/opus', label: 'Anthropic · Opus' },
]

/**
 * Her, with nobody behind her: it records what it was asked and wakes up when
 * the test says so, which is the whole of what a slow opencode server does
 * differently from a fast one.
 */
class Stand implements Conversation {
  readonly asked: string[] = []
  /** Every model she has been handed, in order. */
  readonly handed: string[] = []
  private model = MODELS[0]!.id
  constructor(private say: (event: BridgeEvent) => void) {}
  async start() {}
  wakeUp() {
    this.say({ kind: 'ready' })
    this.say({ kind: 'thinks-with', models: MODELS, using: this.model })
  }
  giveUp() {
    this.say({ kind: 'lost', why: 'She could not be woken up — no server' })
  }
  ask(prompt: string) {
    this.asked.push(prompt)
  }
  use(model: string) {
    this.handed.push(model)
    this.model = model
    this.say({ kind: 'thinks-with', models: MODELS, using: model })
  }
  answer() {}
  interrupt() {}
  close() {}
}

/** The window, reduced to the two things this cares about. */
function Window({ open, hold }: { open: OpenConversation; hold: (maid: Maid) => void }) {
  const maid = useMaid(open)
  hold(maid)
  return <text>{maid.scene.isWorking ? 'working' : 'idle'}</text>
}

type Maid = ReturnType<typeof useMaid>

/** Every window a test opened, so the next test starts on an empty terminal
 * rather than on top of the last one's. */
const opened: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of opened.splice(0)) setup.renderer.destroy()
})

/**
 * One window over one stand-in, held open for the test to speak into.
 *
 * Everything said to it is settled before it is looked at — what is being
 * checked is what the window does *after* a state change, and that is an effect
 * rather than a render.
 */
async function open() {
  let her!: Stand
  let maid!: Maid
  const setup = await testRender(
    <Window open={(say) => (her = new Stand(say))} hold={(it) => (maid = it)} />,
    { width: 30, height: 3 },
  )
  const settle = async (work: () => void) => {
    await act(async () => work())
    await setup.flush()
  }
  await setup.flush()
  opened.push(setup)
  return {
    her: her!,
    // The latest render's, not the first: what is being checked is where the
    // window ended up.
    scene: () => maid.scene,
    pick: (model: string) => settle(() => maid.use(model)),
    say: (prompt: string) => settle(() => maid.ask(prompt)),
    wakeUp: () => settle(() => her.wakeUp()),
    giveUp: () => settle(() => her.giveUp()),
    setup,
  }
}

test('nothing typed before she wakes up is sent, and she is not put to work', async () => {
  const { her, say, setup } = await open()

  await say('are you there?')

  expect(her.asked).toEqual([])
  expect(setup.captureCharFrame()).toContain('idle')
})

test('what was held goes the moment she wakes up', async () => {
  const { her, say, wakeUp, setup } = await open()

  await say('are you there?')
  await wakeUp()

  expect(her.asked).toEqual(['are you there?'])
  expect(setup.captureCharFrame()).toContain('working')
})

test('waking up twice does not say it twice', async () => {
  const { her, say, wakeUp } = await open()

  await say('are you there?')
  await wakeUp()
  await wakeUp()

  expect(her.asked).toEqual(['are you there?'])
})

test('something said once she is up goes straight to her', async () => {
  const { her, say, wakeUp, setup } = await open()

  await wakeUp()
  await say('good morning')

  expect(her.asked).toEqual(['good morning'])
  expect(setup.captureCharFrame()).toContain('working')
})

test('an empty line is not held and not sent', async () => {
  const { her, say, wakeUp, setup } = await open()

  await wakeUp()
  await say('   ')

  expect(her.asked).toEqual([])
  expect(setup.captureCharFrame()).toContain('idle')
})

test('a session that never opens does not leave a sentence waiting for it', async () => {
  const { her, say, giveUp, setup } = await open()

  await say('are you there?')
  await giveUp()
  await say('are you there?')

  expect(her.asked).toEqual([])
  // She is not coming, and the window says so rather than holding sentences
  // for a session that will never open.
  expect(setup.captureCharFrame()).toContain('idle')
})

test('what she can think with turns up with her, and the one she is', async () => {
  const { scene, wakeUp } = await open()

  expect(scene().models).toEqual([])
  await wakeUp()

  expect(scene().models).toEqual(MODELS)
  expect(scene().model).toBe('opencode/free')
})

test('picking a model hands it over, and she is the one who says it took', async () => {
  const { her, scene, wakeUp, pick } = await open()

  await wakeUp()
  await pick('anthropic/opus')

  expect(her.handed).toEqual(['anthropic/opus'])
  expect(scene().model).toBe('anthropic/opus')
})

test('nothing but picking one changes what she thinks with', async () => {
  // Everything else the window does to her leaves the model alone — putting a
  // list away without taking a row off it goes through none of this.
  const { her, scene, wakeUp, say } = await open()

  await wakeUp()
  await say('good morning')

  expect(her.handed).toEqual([])
  expect(scene().model).toBe('opencode/free')
})
