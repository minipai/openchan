import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { PathBox } from './PathBox'
import { paletteOver } from '../theme'

/** Every box a test put on screen, taken down again after it. */
const shown: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of shown.splice(0)) setup.renderer.destroy()
})

/** A line to type a path on, and everything it has handed back so far. */
async function show(trouble: string | null = null) {
  const gone: string[] = []
  const setup = await testRender(
    <PathBox
      theme={paletteOver(undefined)}
      from="~/Dev/openchan"
      trouble={trouble}
      width={40}
      onGo={(typed) => gone.push(typed)}
    />,
    { width: 44, height: 10 },
  )
  await setup.flush()
  shown.push(setup)
  return { gone, setup }
}

test('a path typed out and taken is handed over as it was typed', async () => {
  const { gone, setup } = await show()

  await setup.mockInput.typeText('~/Dev/claudecafe')
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()

  // What it comes to is not this box's to work out — it hands over the words.
  expect(gone).toEqual(['~/Dev/claudecafe'])
})

test('a path dropped in with its newline, by a terminal that does not wrap pastes, is handed over', async () => {
  const { gone, setup } = await show()

  // The path and its Enter in one chunk, every byte of it taken in before the
  // box has rendered once.
  setup.mockInput.pressKeys(['~/Dev/claudecafe\n'])
  await setup.flush()

  expect(gone).toEqual(['~/Dev/claudecafe'])
})

test('a path written out and then thought better of hands nothing back', async () => {
  // Putting it away is the window's — the box is simply not drawn any more — so
  // what matters here is that escape is not a way of taking what is in it.
  const { gone, setup } = await show()

  await setup.mockInput.typeText('/etc')
  await setup.flush()
  setup.mockInput.pressEscape()
  await setup.flush()

  expect(gone).toEqual([])
})

test('the box says where she is now, so an empty line is not an empty question', async () => {
  const { setup } = await show()

  expect(setup.captureCharFrame()).toContain('~/Dev/openchan')
})

test('what was wrong with the last path is named under the line it was typed on', async () => {
  const { setup } = await show('There is no folder there')

  const frame = setup.captureCharFrame()
  expect(frame).toContain('There is no folder there')
  // And it is still a line to type on: the mistake is answered by fixing it.
  expect(frame).toContain('Enter work there')
  expect(frame).toContain('ESC never mind')
})
