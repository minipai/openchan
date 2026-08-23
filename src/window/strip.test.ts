import { expect, test } from 'bun:test'
import os from 'node:os'
import path from 'node:path'
import { columns } from './Asking'
import { STRIP_SPENDS } from './DialogueBox'
import { shareOut } from './strip'
import type { Model } from '../protocol'

/** Somewhere with a name long enough to have to be cut: twenty-one columns of
 * it, written the way the strip writes it. */
const WHERE = path.join(os.homedir(), 'Dev', 'openchan-sta-26')

const MODELS: Model[] = [{ id: 'anthropic/opus', label: 'Anthropic · Claude Opus 4.5' }]
const USING = 'anthropic/opus'

/** What is left of the line for what she is doing, once the two of them have
 * been written on it. */
const forDoing = (boxWidth: number, model: string, folder: string) =>
  boxWidth - STRIP_SPENDS - columns(model) - columns(folder)

test('a wide line is not shared out at all: both of them whole', () => {
  expect(shareOut(74, WHERE, MODELS, USING)).toEqual({
    model: 'Anthropic · Claude Opus 4.5',
    folder: '~/Dev/openchan-sta-26',
  })
  expect(forDoing(74, 'Anthropic · Claude Opus 4.5', '~/Dev/openchan-sta-26')).toBeGreaterThan(16)
})

test('a forty-column terminal still has all three of them on the line', () => {
  // Where a forty-column terminal leaves her box: the width the model used to
  // vanish at, because the folder's half of the whole line was the whole of
  // the room going spare.
  const { model, folder } = shareOut(34, WHERE, MODELS, USING)
  expect(model).toBe('Claude…')
  expect(folder).toBe('…chan-sta-26')
  expect(forDoing(34, model, folder)).toBeGreaterThanOrEqual(4)
})

test('the folder keeps the folder it names, whatever the line is shared out to', () => {
  for (let boxWidth = 14; boxWidth <= 84; boxWidth++) {
    const { model, folder } = shareOut(boxWidth, WHERE, MODELS, USING)
    expect(folder.endsWith('-26')).toBe(true)
    // And where the model is written at all, what is written fits with a word
    // of the line left over.
    if (model) expect(forDoing(boxWidth, model, folder)).toBeGreaterThanOrEqual(3)
  }
})

test('a line too narrow to name a model at all is the line there was before', () => {
  // Nothing where the model would go and nothing held back for it: the folder
  // at half the box, as it was written before there was a model to say.
  expect(shareOut(14, WHERE, MODELS, USING)).toEqual({ model: '', folder: '…sta-26' })
})

test('nothing to say yet leaves the folder its old half of the line', () => {
  expect(shareOut(34, WHERE, [], null)).toEqual({ model: '', folder: '…/openchan-sta-26' })
})
