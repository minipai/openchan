import { afterEach, expect, test } from 'bun:test'
import { act, useState } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { Picker, type Choice } from './Picker'
import { paletteOver } from '../theme'

const CHOICES: Choice[] = [
  { id: 'a/one', label: 'Alpha One' },
  { id: 'b/two', label: 'Beta Two' },
  { id: 'c/three', label: 'Gamma Three' },
]

/** Rows the way the list of models has them: the provider and the model both,
 * and more of them than fit. */
const MODELS: Choice[] = [
  { id: 'anthropic/opus', label: 'Anthropic · Claude Opus' },
  { id: 'anthropic/sonnet', label: 'Anthropic · Claude Sonnet' },
  { id: 'google/gemini', label: 'Google · Gemini' },
  { id: 'opencode/free', label: 'opencode · Free' },
  { id: 'openrouter/opus', label: 'OpenRouter · Claude Opus' },
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
      room={20}
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
      room={14}
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

/** A list that can be typed at, holding what was typed the way the window
 * does — it is the window's, because ESC is. */
function Narrowing({ chosen, onPick }: { chosen: string | null; onPick: (ids: string[]) => void }) {
  const [typed, setTyped] = useState('')
  return (
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={MODELS}
      chosen={chosen}
      narrowing={{ typed, onType: setTyped }}
      width={40}
      room={20}
      onPick={onPick}
    />
  )
}

/** The list of models on screen, with a keyboard to type at it. Every key is
 * settled before the screen is looked at: what is typed is held above the
 * list, and it is a state change there that redraws the rows. */
async function narrowing(chosen: string | null) {
  const picked: string[][] = []
  const setup = await testRender(<Narrowing chosen={chosen} onPick={(ids) => picked.push(ids)} />, {
    width: 44,
    height: 20,
    kittyKeyboard: true,
  })
  shown.push(setup)
  await setup.flush()
  const settle = async (work: () => void | Promise<void>) => {
    await act(async () => void (await work()))
    await setup.flush()
  }
  return {
    picked,
    frame: () => setup.captureCharFrame(),
    type: (text: string) => settle(() => setup.mockInput.typeText(text)),
    backspace: () => settle(() => setup.mockInput.pressBackspace()),
    enter: () => settle(() => setup.mockInput.pressEnter()),
    arrow: (way: 'up' | 'down') => settle(() => setup.mockInput.pressArrow(way)),
  }
}

test('a list told it can be typed at narrows as it is typed, and shows what was typed', async () => {
  const { frame, type } = await narrowing('opencode/free')

  expect(frame()).toContain('● opencode · Free')
  expect(frame()).toContain('type to narrow it')

  await type('opus')
  expect(frame()).toContain('› opus')
  expect(frame()).toContain('Anthropic · Claude Opus')
  expect(frame()).toContain('OpenRouter · Claude Opus')
  expect(frame()).not.toContain('Sonnet')
  expect(frame()).not.toContain('Gemini')
  expect(frame()).not.toContain('opencode · Free')
})

test('a row matches on the provider and the model both, in any order, case ignored', async () => {
  const { frame, type, backspace } = await narrowing(null)

  await type('OPUS anth')
  expect(frame()).toContain('Anthropic · Claude Opus')
  expect(frame()).not.toContain('OpenRouter')
  expect(frame()).not.toContain('Sonnet')

  // Backspace widens it again, a letter at a time.
  for (const _ of 'anth') await backspace()
  expect(frame()).toContain('› OPUS ')
  expect(frame()).toContain('OpenRouter · Claude Opus')
})

test('narrowed, the highlight sits on the one in force if it is still there, and on the first row otherwise', async () => {
  const { picked, frame, type, enter } = await narrowing('openrouter/opus')

  await type('opus')
  // Still among the rows, so still the one the list stands on.
  expect(frame()).toContain('▶ ● OpenRouter · Claude Opus')
  await type(' anthropic')
  // Typed away, so the first of what is left.
  expect(frame()).toContain('▶   Anthropic · Claude Opus')

  await enter()
  expect(picked).toEqual([['anthropic/opus']])
})

test('moving through narrowed rows moves through those rows and no others', async () => {
  const { picked, frame, type, arrow, enter } = await narrowing(null)

  await type('claude')
  await arrow('down')
  await arrow('down')
  expect(frame()).toContain('▶   OpenRouter · Claude Opus')
  await enter()
  expect(picked).toEqual([['openrouter/opus']])
})

test('nothing matching says so, in different words from a list with nothing in it yet', async () => {
  const { frame, type } = await narrowing(null)

  await type('llama')
  expect(frame()).toContain('Nothing is called that')
  expect(frame()).not.toContain('Nothing to pick from yet')
  // Nothing to move through or take — but typing is still how rows come back,
  // and ESC is what takes the typing back.
  expect(frame()).toContain('Type to narrow it')
  expect(frame()).toContain('ESC start over')
  expect(frame()).not.toContain('use it')
  expect(frame()).not.toContain('the one above')
})

test('a list that can be typed at says so along its own edge, and what ESC does right now', async () => {
  const { frame, type } = await narrowing(null)

  expect(frame()).toContain('Type to narrow it')
  expect(frame()).toContain('ESC never mind')

  await type('o')
  expect(frame()).toContain('Type to narrow it')
  expect(frame()).toContain('ESC start over')
  expect(frame()).not.toContain('never mind')
})

test('a space before the first letter is not taken', async () => {
  const { frame, type } = await narrowing(null)

  await type(' ')
  expect(frame()).toContain('type to narrow it')
  expect(frame()).toContain('ESC never mind')
  // Between words it is what tells them apart.
  await type('claude opus')
  expect(frame()).toContain('› claude opus')
  expect(frame()).not.toContain('Sonnet')
})

/** The list of models put on screen before she has said what they are, the
 * way the window opens it while she is waking up. */
function NarrowingLater({ hold }: { hold: (fill: (items: Choice[]) => void) => void }) {
  const [items, setItems] = useState<Choice[]>([])
  const [typed, setTyped] = useState('')
  hold(setItems)
  return (
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={items}
      chosen={null}
      narrowing={{ typed, onType: setTyped }}
      width={40}
      room={20}
      onPick={() => {}}
    />
  )
}

test('a list with no rows yet takes no letters: there is nothing to narrow', async () => {
  let fill!: (items: Choice[]) => void
  const setup = await testRender(<NarrowingLater hold={(it) => (fill = it)} />, { width: 44, height: 20, kittyKeyboard: true })
  shown.push(setup)
  await setup.flush()
  expect(setup.captureCharFrame()).toContain('Nothing to pick from yet')
  // Neither the key along the edge nor the line to type on: there is nothing
  // to narrow, and both would be an offer the list does not keep.
  expect(setup.captureCharFrame()).not.toContain('Type to narrow it')
  expect(setup.captureCharFrame()).not.toContain('type to narrow it')

  await act(async () => void (await setup.mockInput.typeText('opus')))
  await setup.flush()
  expect(setup.captureCharFrame()).not.toContain('› opus')
  expect(setup.captureCharFrame()).toContain('ESC never mind')

  // Once the rows turn up, so does the typing.
  await act(async () => fill(MODELS))
  await setup.flush()
  expect(setup.captureCharFrame()).toContain('Type to narrow it')
  await act(async () => void (await setup.mockInput.typeText('gemini')))
  await setup.flush()
  expect(setup.captureCharFrame()).toContain('› gemini')
  expect(setup.captureCharFrame()).toContain('Google · Gemini')
  expect(setup.captureCharFrame()).not.toContain('Opus')
})

test('a list not told it can be typed at takes no letters, and prints no key for them', async () => {
  const { picked, setup } = await show(CHOICES, 'b/two')

  await act(async () => void (await setup.mockInput.typeText('gamma')))
  await setup.flush()

  const frame = setup.captureCharFrame()
  expect(frame).not.toContain('gamma')
  expect(frame).not.toContain('narrow')
  expect(frame).toContain('Alpha One')
  expect(frame).toContain('Beta Two')
  expect(picked).toEqual([])
})

test('a list stands in a short terminal rather than running off it', async () => {
  // Eighteen rows: the same list without a line to type on fits ten rows in
  // one, and this one is three rows taller. Grown past the screen what it
  // loses is its own bottom edge and the keys written along it — which is the
  // way out of it.
  const many: Choice[] = Array.from({ length: 40 }, (_, at) => ({ id: `m-${at}`, label: `Provider · Model ${at}` }))
  const setup = await testRender(
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={many}
      chosen="m-0"
      narrowing={{ typed: '', onType: () => {} }}
      width={54}
      room={18}
      onPick={() => {}}
    />,
    { width: 80, height: 18 },
  )
  shown.push(setup)
  await setup.flush()

  const frame = setup.captureCharFrame()
  expect(frame).toContain('› type to narrow it')
  expect(frame).toContain('ESC never mind')
  // The frame is shut: the bottom edge is on screen under the keys.
  expect(frame).toContain('╰')
  // Fewer rows, rather than the same ten off the bottom of the screen.
  expect(frame).toContain('Provider · Model 8')
  expect(frame).not.toContain('Provider · Model 9')
})

test('a taller terminal is still ten rows, not as many as it would hold', async () => {
  const many: Choice[] = Array.from({ length: 40 }, (_, at) => ({ id: `m-${at}`, label: `Provider · Model ${at}` }))
  const setup = await testRender(
    <Picker
      theme={paletteOver(undefined)}
      title="What she thinks with"
      items={many}
      chosen="m-0"
      narrowing={{ typed: '', onType: () => {} }}
      width={54}
      room={40}
      onPick={() => {}}
    />,
    { width: 80, height: 40 },
  )
  shown.push(setup)
  await setup.flush()

  const frame = setup.captureCharFrame()
  expect(frame).toContain('Provider · Model 9')
  expect(frame).not.toContain('Provider · Model 10')
})

test('a label too long for the row is cut where the row ends, and marked', async () => {
  const { setup } = await show([{ id: 'long', label: `${'a'.repeat(40)}TAIL` }], null)

  const frame = setup.captureCharFrame()
  expect(frame).not.toContain('TAIL')
  expect(frame).toContain('…')
})
