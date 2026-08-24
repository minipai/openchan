import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { readingKeys, shownAs } from '../keys'
import { ReportReader } from './ReportReader'
import type { Report } from '../../between/scene'
import { paletteOver } from '../theme'

/** Long enough not to fit the page it is drawn on, which is the whole reason
 * this frame exists. */
const REPORT: Report = {
  title: 'What was wrong',
  body: ['## What was wrong', '', ...Array.from({ length: 30 }, (_, at) => `finding-${at}`)].join('\n'),
}

/** Every page a test put on screen, taken down again after it. */
const shown: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of shown.splice(0)) setup.renderer.destroy()
})

async function show(report: Report, width = 60) {
  const setup = await testRender(
    <ReportReader theme={paletteOver(undefined)} report={report} width={width} height={16} />,
    { width: width + 4, height: 18 },
  )
  await setup.flush()
  shown.push(setup)
  return setup
}

test('what she wrote is on the page, under the title she gave it', async () => {
  const setup = await show(REPORT)

  const frame = setup.captureCharFrame()
  expect(frame).toContain('What was wrong')
  expect(frame).toContain('finding-0')
})

test('a report longer than the page is cut off rather than running off it', async () => {
  const setup = await show(REPORT)

  // The end of it is not on screen — which is what there is to scroll to.
  expect(setup.captureCharFrame()).not.toContain('finding-29')
})

test('every key the page answers to is on it, however narrow it is', async () => {
  // A row of keys too wide for the page is not cut short — it runs off the
  // edge and takes the border with it, and whichever key was written down last
  // is the one nobody ever sees. So they are put on as many rows as they need.
  for (const width of [46, 60, 74]) {
    const frame = (await show(REPORT, width)).captureCharFrame()
    for (const key of readingKeys()) {
      expect([width, frame.includes(`${shownAs(key.press)} ${key.says}`)]).toEqual([width, true])
    }
    // The frame is still a frame: every row of it ends where it started.
    for (const row of frame.split('\n').filter((one) => one.trimEnd().startsWith('│'))) {
      expect([width, row.trimEnd().endsWith('│')]).toEqual([width, true])
    }
  }
})

test('the arrows move down the page and back up it', async () => {
  const setup = await show(REPORT)
  const opened = setup.captureCharFrame()

  for (let at = 0; at < 6; at++) setup.mockInput.pressArrow('down')
  await setup.flush()
  const down = setup.captureCharFrame()

  expect(down).not.toBe(opened)
  expect(down).not.toContain('finding-0')

  for (let at = 0; at < 6; at++) setup.mockInput.pressArrow('up')
  await setup.flush()

  // Back where it opened: a page that only went one way would strand the top of
  // what she wrote.
  expect(setup.captureCharFrame()).toBe(opened)
})

test('a report that fits has nothing to scroll and stays where it is', async () => {
  const setup = await show({ title: 'Two things', body: '- the port\n- the model\n- the persona' })
  const opened = setup.captureCharFrame()

  setup.mockInput.pressArrow('down')
  await setup.flush()

  expect(setup.captureCharFrame()).toBe(opened)
})

test('the page says along its own edge what can be done to it', async () => {
  // The keys overlay never gets to show these: bringing it up is what puts the
  // page away, so they would be written down nowhere anybody looks.
  const frame = (await show(REPORT)).captureCharFrame()

  expect(frame).toContain('ESC put it away')
  expect(frame).toContain('↑ back up a bit')
  expect(frame).toContain('↓ on down a bit')
})
