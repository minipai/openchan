import { expect, test } from 'bun:test'
import { OPENED_IN, shortened } from '../../between/folder'
import { MODELS } from '../../opencode/stand'
import { HERE, strip, windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

test('a list is opened, moved through, and the row taken has taken', async () => {
  const { her, wakeUp, hold, arrow, enter, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  expect(frame()).toContain('What she thinks with')
  expect(frame()).toContain(`● ${MODELS[0]!.label}`)

  await arrow('down')
  await enter()

  expect(her.handed).toEqual([MODELS[1]!.id])
  expect(frame()).not.toContain('What she thinks with')

  // Marked the next time the list is opened — by what she reported back, not
  // by what was pressed — and the list opens on it.
  await hold('p')
  expect(frame()).toContain(`▶ ● ${MODELS[1]!.label}`)
})

test('the strip says what she is thinking with, and keeps saying it as she is handed another', async () => {
  const { wakeUp, hold, arrow, enter, raise, frame } = await onScreen()

  // Before she has said which model is hers there is nothing where it will be,
  // and the folder beside it is where it always was.
  expect(strip(frame())).not.toContain(MODELS[0]!.label)
  expect(strip(frame())).toContain(HERE)

  await wakeUp()
  expect(strip(frame())).toContain(MODELS[0]!.label)

  // Handed another off the list: the strip says so with nothing reopened, and
  // it says the one she reported back rather than the row that was pressed.
  await hold('p')
  await arrow('down')
  await enter()
  expect(strip(frame())).toContain(MODELS[1]!.label)
  expect(strip(frame())).not.toContain(MODELS[0]!.label)

  // And it is hers to say rather than the list's: a model she reports without
  // anybody having asked for it is the one the strip goes back to.
  await raise({ kind: 'thinks-with', models: MODELS, using: MODELS[0]!.id })
  expect(strip(frame())).toContain(MODELS[0]!.label)
})

test('a model she is on that was never on the list is said as best it can be', async () => {
  const { wakeUp, raise, frame } = await onScreen()
  await wakeUp()

  // The list is the agent's to write and it can come back short. She is
  // thinking with something either way, and a blank strip would say she was
  // not.
  await raise({ kind: 'thinks-with', models: [], using: 'openrouter/qwen3-coder' })
  expect(strip(frame())).toContain('openrouter/qwen3-coder')
})

test('a narrow terminal keeps all three on the strip, and the folder whole', async () => {
  const { wakeUp, raise, frame } = await onScreen({ width: 60, height: 24 })
  await wakeUp()
  await raise({ kind: 'doing', label: 'reading the notes' })
  await raise({
    kind: 'thinks-with',
    models: [{ id: 'anthropic/opus-4-5', label: 'Anthropic · Claude Opus 4.5' }],
    using: 'anthropic/opus-4-5',
  })

  // Whoever serves the model is what gives. All three are still on the line,
  // in their places and with clear air between them: what she is doing is cut
  // to a word rather than run into the model, and the folder is not cut at all.
  const [doing, thinking, where, ...rest] = strip(frame()).trim().split(/ {2,}/)
  expect(rest).toEqual([])
  expect(doing).toMatch(/^reading/)
  expect(thinking).not.toContain('Anthropic')
  expect(thinking).toMatch(/^Claude Op/)
  expect(where).toContain(HERE)
})

test('a forty-column terminal keeps all three on the strip', async () => {
  const { wakeUp, raise, frame } = await onScreen({ width: 40, height: 24 })
  await wakeUp()
  await raise({ kind: 'doing', label: 'reading the notes' })
  await raise({
    kind: 'thinks-with',
    models: [{ id: 'anthropic/opus-4-5', label: 'Anthropic · Claude Opus 4.5' }],
    using: 'anthropic/opus-4-5',
  })

  // The narrowest terminal anybody actually works in. All three are still
  // there, in their places, with clear air between them: what she is thinking
  // with is cut to the front of the model's own name, and the folder keeps the
  // folder it names.
  const [doing, thinking, where, ...rest] = strip(frame()).trim().split(/ {2,}/)
  expect(rest).toEqual([])
  expect(doing).toMatch(/^rea/)
  expect(thinking).toMatch(/^Claud/)
  expect(where!.endsWith(shortened(OPENED_IN).slice(-3))).toBe(true)
})

test('a terminal too narrow for a model still leaves what she is doing a word', async () => {
  const { wakeUp, raise, frame } = await onScreen({ width: 20, height: 24 })
  await wakeUp()
  await raise({ kind: 'doing', label: 'reading the notes' })

  // There is no honest way to name a model in what is left of this line, so
  // nothing is written where it would go — and nothing is held back for it
  // either. The folder stands where it stood before there was a model to say.
  const line = strip(frame())
  expect(line).not.toContain('·')
  expect(line.trim()).toMatch(/^rea/)
  expect(line.trimEnd().endsWith(shortened(OPENED_IN).slice(-3))).toBe(true)
})

test('the list of models is narrowed by typing, and ESC takes the typing back before the list', async () => {
  const { her, wakeUp, hold, escape, type, enter, frame } = await onScreen()
  await wakeUp()

  await hold('p')
  await type('opus')
  expect(frame()).toContain('› opus')
  expect(frame()).toContain(MODELS[1]!.label)
  expect(frame()).not.toContain(`● ${MODELS[0]!.label}`)

  // The first ESC clears what was typed: the rows are back, the list is still
  // up, open on the one in force.
  await escape()
  expect(frame()).toContain('What she thinks with')
  expect(frame()).toContain(`▶ ● ${MODELS[0]!.label}`)
  expect(frame()).not.toContain('› opus')

  // The second puts it away, as it always did.
  await escape()
  expect(frame()).not.toContain('What she thinks with')

  // Narrowed down to the one row, Enter takes it.
  await hold('p')
  await type('opus')
  await enter()
  expect(her.handed).toEqual([MODELS[1]!.id])
  // Opened again, the list is the whole list: the last search is not a
  // question anyone is still asking.
  await hold('p')
  expect(frame()).toContain(MODELS[0]!.label)
  expect(frame()).not.toContain('› opus')
})
