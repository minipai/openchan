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

/** A list on screen, and everything it has handed back so far — one row at a
 * time, or for a list that takes several, a set of rows at a time. */
async function show(items: Choice[], chosen: string | null, multiple = false) {
  const picked: string[][] = []
  const setup = await testRender(
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      asks={multiple ? 'Which of them?' : undefined}
      items={items}
      chosen={chosen}
      multiple={multiple}
      width={40}
      onPick={(ids) => picked.push(ids)}
    />,
    { width: 44, height: 20 },
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
  expect(picked).toEqual([['b/two']])
})

test('what enter takes is whatever the list has been moved onto', async () => {
  const { picked, setup } = await show(CHOICES, 'b/two')

  setup.mockInput.pressArrow('down')
  await setup.flush()
  setup.mockInput.pressEnter()
  await setup.flush()

  expect(picked).toEqual([['c/three']])
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
function Waiting({ hold, onPick }: { hold: (fill: (items: Choice[], chosen: string) => void) => void; onPick: (ids: string[]) => void }) {
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
  const picked: string[][] = []
  let fill!: (items: Choice[], chosen: string) => void
  const setup = await testRender(
    <Waiting hold={(it) => (fill = it)} onPick={(ids) => picked.push(ids)} />,
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
  expect(picked).toEqual([['b/two']])
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

test('a list that takes several ticks rows with space and hands them all back on enter', async () => {
  const { picked, setup } = await show(CHOICES, null, true)

  // The question is written above the rows, and every row starts unticked.
  let frame = setup.captureCharFrame()
  expect(frame).toContain('Which of them?')
  expect(frame).toContain('☐ Alpha One')
  expect(frame).not.toContain('☑')

  setup.mockInput.pressKey(' ')
  setup.mockInput.pressArrow('down')
  setup.mockInput.pressArrow('down')
  setup.mockInput.pressKey(' ')
  await setup.flush()

  frame = setup.captureCharFrame()
  expect(frame).toContain('☑ Alpha One')
  expect(frame).toContain('☐ Beta Two')
  expect(frame).toContain('☑ Gamma Three')
  // Ticking hands nothing back by itself.
  expect(picked).toEqual([])

  setup.mockInput.pressEnter()
  await setup.flush()
  // In the order the rows had, whichever was ticked first.
  expect(picked).toEqual([['a/one', 'c/three']])
})

test('a tick is taken off again by the same key', async () => {
  const { picked, setup } = await show(CHOICES, null, true)

  setup.mockInput.pressKey(' ')
  setup.mockInput.pressKey(' ')
  await setup.flush()
  expect(setup.captureCharFrame()).not.toContain('☑')

  setup.mockInput.pressEnter()
  await setup.flush()
  // None of them is an answer too — the list was told that is all.
  expect(picked).toEqual([[]])
})

test('a list that takes several says so along its own edge', async () => {
  const { setup } = await show(CHOICES, null, true)

  const frame = setup.captureCharFrame()
  expect(frame).toContain('Space tick it')
  expect(frame).toContain("Enter that's all")
  expect(frame).toContain('ESC never mind')
  expect(frame).not.toContain('use it')
})

test('space is nothing to a list that takes one row', async () => {
  const { picked, setup } = await show(CHOICES, 'b/two')

  setup.mockInput.pressKey(' ')
  await setup.flush()

  expect(setup.captureCharFrame()).not.toContain('☑')
  expect(setup.captureCharFrame()).not.toContain('Space')
  expect(picked).toEqual([])
})

test('what a row says under itself is drawn under it', async () => {
  const { setup } = await show(
    [
      { id: 'now', label: 'Now', description: 'Before anything else.' },
      { id: 'later', label: 'Later', description: 'Once the rest is done.' },
    ],
    null,
  )

  const frame = setup.captureCharFrame()
  expect(frame).toContain('Now')
  expect(frame).toContain('Before anything else.')
  expect(frame).toContain('Once the rest is done.')
})

test('rows with a line under them are capped by what is on screen, not by how many there are', async () => {
  const many = Array.from({ length: 12 }, (_, at) => ({
    id: `row-${at}`,
    label: `Row ${at}`,
    description: `What row ${at} is for.`,
  }))
  const { setup } = await show(many, null, true)

  // The list is as tall as ten rows of one line would be, and the keys that
  // say how to get out of it are still on screen under it.
  const frame = setup.captureCharFrame()
  expect(frame).toContain('Row 0')
  expect(frame).toContain('Row 4')
  expect(frame).not.toContain('Row 5')
  expect(frame).toContain('ESC never mind')
  expect(frame).toContain("Enter that's all")
})

test('a label too long for the row is cut where the row ends, and marked', async () => {
  const { setup } = await show([{ id: 'long', label: `${'a'.repeat(40)}TAIL` }], null)

  const frame = setup.captureCharFrame()
  expect(frame).not.toContain('TAIL')
  expect(frame).toContain('…')
})
