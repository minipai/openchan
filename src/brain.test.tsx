import { expect, test } from 'bun:test'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { useMaid } from './brain'
import type { BridgeEvent, Conversation, OpenConversation } from './protocol'

/**
 * Her, with nobody behind her: it records what it was asked and wakes up when
 * the test says so, which is the whole of what a slow opencode server does
 * differently from a fast one.
 */
class Stand implements Conversation {
  readonly asked: string[] = []
  constructor(private say: (event: BridgeEvent) => void) {}
  async start() {}
  wakeUp() {
    this.say({ kind: 'ready' })
  }
  ask(prompt: string) {
    this.asked.push(prompt)
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
  return {
    her: her!,
    say: (prompt: string) => settle(() => maid.ask(prompt)),
    wakeUp: () => settle(() => her.wakeUp()),
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
