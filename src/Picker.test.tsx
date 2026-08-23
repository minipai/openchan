import { afterEach, expect, test } from 'bun:test'
import { act, useState } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { Picker, type Choice } from './Picker'
import { paletteOver } from './theme'

const CHOICES: Choice[] = [
  { id: 'a/one', label: 'Alpha One' },
  { id: 'b/two', label: 'Beta Two' },
  { id: 'c/three', label: 'Gamma Three' },
]

/** Every list a test put on screen, taken down again after it. */
const shown: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of shown.splice(0)) setup.renderer.destroy()
})

/** A list on screen, and everything it has handed back so far. */
async function show(items: Choice[], chosen: string | null) {
  const picked: string[] = []
  const setup = await testRender(
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={items}
      chosen={chosen}
      width={40}
      onPick={(id) => picked.push(id)}
    />,
    { width: 44, height: 14 },
  )
  await setup.flush()
  shown.push(setup)
  return { picked, setup }
}

test('the one already in force is marked, and the list opens on it', async () => {
  const { picked, setup } = await show(CHOICES, 'b/two')

  const frame = setup.captureCharFrame()
  expect(frame).toContain('● Beta Two')
  // The other rows keep the column the mark sits in, so nothing shifts under it.
  expect(frame).not.toContain('● Alpha One')

  setup.mockInput.pressEnter()
  await setup.flush()
  expect(picked).toEqual(['b/two'])
})

test('what enter takes is whatever the list has been moved onto', async () => {
  const { picked, setup } = await show(CHOICES, 'b/two')

  setup.mockInput.pressArrow('down')
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()

  expect(picked).toEqual(['c/three'])
})

test('a list moved through and then put away hands nothing back', async () => {
  // Putting it away is the window's — the list is simply not drawn any more —
  // so what matters here is that moving through one changes nothing by itself.
  const { picked, setup } = await show(CHOICES, 'b/two')

  setup.mockInput.pressArrow('down')
  setup.mockInput.pressArrow('up')
  setup.mockInput.pressEscape()
  await setup.flush()

  expect(picked).toEqual([])
})

test('a list with nothing in it says so rather than opening onto nothing', async () => {
  const { setup } = await show([], null)

  expect(setup.captureCharFrame()).toContain('Nothing to pick from yet')
})

/** A list that is put on screen before there is anything to put in it, the way
 * the window opens one while she is still waking up. */
function Waiting({ hold, onPick }: { hold: (fill: (items: Choice[], chosen: string) => void) => void; onPick: (id: string) => void }) {
  const [rows, setRows] = useState<{ items: Choice[]; chosen: string | null }>({ items: [], chosen: null })
  hold((items, chosen) => setRows({ items, chosen }))
  return (
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={rows.items}
      chosen={rows.chosen}
      width={40}
      onPick={onPick}
    />
  )
}

test('a list opened before there is anything in it still opens on the one in force', async () => {
  const picked: string[] = []
  let fill!: (items: Choice[], chosen: string) => void
  const setup = await testRender(
    <Waiting hold={(it) => (fill = it)} onPick={(id) => picked.push(id)} />,
    { width: 44, height: 14 },
  )
  shown.push(setup)
  await setup.flush()
  expect(setup.captureCharFrame()).toContain('Nothing to pick from yet')

  await act(async () => fill(CHOICES, 'b/two'))
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()

  // Where the list opens is worked out when the rows turn up, not when the box
  // did — otherwise it opens on whatever happens to be first.
  expect(picked).toEqual(['b/two'])
})

test('a list says along its own edge what can be done to it', async () => {
  const { setup } = await show(CHOICES, 'b/two')

  const frame = setup.captureCharFrame()
  expect(frame).toContain('↑ the one above')
  expect(frame).toContain('Enter use it')
  expect(frame).toContain('ESC never mind')
})

test('a list with nothing in it offers only the key that puts it away', async () => {
  const { setup } = await show([], null)

  const frame = setup.captureCharFrame()
  expect(frame).toContain('ESC never mind')
  // Nothing to move through and nothing to take: saying so would be a key shown
  // and not answered.
  expect(frame).not.toContain('use it')
  expect(frame).not.toContain('the one above')
})
