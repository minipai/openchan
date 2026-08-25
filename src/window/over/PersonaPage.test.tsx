import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { meetingKeys, shownAs } from '../keys'
import { PersonaPage } from './PersonaPage'
import { paletteOver } from '../theme'

const HER = { id: 'momo', name: 'もも', outfits: ['uniform'] }

/** Longer than the page it is drawn on, which is what a persona always is —
 * every one of them runs to several screens of writing. */
const PERSONA = ['# Personality', '', ...Array.from({ length: 30 }, (_, at) => `written-${at}`)].join('\n')

/** Every page a test put on screen, taken down again after it. */
const shown: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of shown.splice(0)) setup.renderer.destroy()
})

async function show(persona: string, width = 60) {
  const setup = await testRender(
    <PersonaPage theme={paletteOver(undefined)} who={HER} persona={persona} width={width} height={16} />,
    { width: width + 4, height: 18 },
  )
  await setup.flush()
  shown.push(setup)
  return setup
}

test('who she is is on the page, under the name she is called by', async () => {
  const frame = (await show(PERSONA)).captureCharFrame()

  expect(frame).toContain('もも')
  expect(frame).toContain('# Personality')
  expect(frame).toContain('written-0')
})

test('a persona longer than the page says so rather than ending where the box does', async () => {
  const setup = await show(PERSONA)

  // The end of it is not on screen — which is the whole reason the arrows are
  // written along the edge underneath it.
  expect(setup.captureCharFrame()).not.toContain('written-29')
  expect(setup.captureCharFrame()).toContain('↓ on down a bit')
})

test('the arrows move down her and back up again', async () => {
  const setup = await show(PERSONA)
  const opened = setup.captureCharFrame()

  for (let at = 0; at < 6; at++) setup.mockInput.pressArrow('down')
  await setup.flush()
  const down = setup.captureCharFrame()

  expect(down).not.toBe(opened)
  expect(down).not.toContain('written-0')

  for (let at = 0; at < 6; at++) setup.mockInput.pressArrow('up')
  await setup.flush()

  // Back where it opened: a page that only went one way would strand the top of
  // her, which is the half that says who she is.
  expect(setup.captureCharFrame()).toBe(opened)
})

test('every key the page answers to is on it, however narrow it is', async () => {
  // The same trap the report falls into: a row of keys too wide for the page
  // runs off the edge and takes the border with it, and the last key written
  // down is the one nobody ever sees.
  for (const width of [46, 60, 74]) {
    const frame = (await show(PERSONA, width)).captureCharFrame()
    for (const key of meetingKeys()) {
      expect([width, frame.includes(`${shownAs(key.press)} ${key.says}`)]).toEqual([width, true])
    }
    // The frame is still a frame: every row of it ends where it started.
    for (const row of frame.split('\n').filter((one) => one.trimEnd().startsWith('│'))) {
      expect([width, row.trimEnd().endsWith('│')]).toEqual([width, true])
    }
  }
})
