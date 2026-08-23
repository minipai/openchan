import { expect, test } from 'bun:test'
import { modelsIn, splitReport, type ProviderModels } from './opencode'

/** Two providers as the server answers with them, one of them offering the same
 * model under its own name. */
const PROVIDERS: ProviderModels[] = [
  {
    id: 'opencode',
    name: 'opencode',
    models: {
      'nemotron-3.5-lightning-free': { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning' },
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
]

test('every model every provider has is on the list, named the way opencode names it', () => {
  expect(modelsIn(PROVIDERS)).toEqual([
    { id: 'anthropic/claude-sonnet-4-5', label: 'Anthropic · Claude Sonnet 4.5' },
    { id: 'opencode/claude-sonnet-4-5', label: 'opencode · Claude Sonnet 4.5' },
    { id: 'opencode/nemotron-3.5-lightning-free', label: 'opencode · Nemotron 3.5 Lightning' },
  ])
})

test('the same model from two providers is two rows that can be told apart', () => {
  const listed = modelsIn(PROVIDERS).filter((model) => model.label.includes('Claude Sonnet 4.5'))

  expect(listed).toHaveLength(2)
  expect(new Set(listed.map((model) => model.label)).size).toBe(2)
})

test('a provider with nothing configured adds nothing to the list', () => {
  expect(modelsIn([{ id: 'lonely', name: 'Lonely', models: {} }])).toEqual([])
})

/** A long answer as she actually writes one: a sentence out loud, then the
 * writing, then the marker she signs off with — which is off the line by the
 * time the split sees it. */
const ANSWER = [
  'Found it, ご主人様~ the parser was the one being difficult.',
  '',
  '## What was wrong',
  '',
  'The delta arrives before the part is announced, so it was being held forever.',
  '',
  '```ts',
  'if (!part) return',
  '```',
].join('\n')

test('what she wrote comes off her line and keeps the heading she gave it', () => {
  const { line, report } = splitReport(ANSWER)

  expect(line).toBe('Found it, ご主人様~ the parser was the one being difficult.')
  expect(report?.title).toBe('What was wrong')
  expect(report?.body.startsWith('## What was wrong')).toBe(true)
  expect(report?.body).toContain('```ts')
  // The whole point: none of the writing is left on the one line she talks in.
  expect(line).not.toContain('##')
})

test('a couple of sentences is still her talking', () => {
  const said = 'It is done~\n\nHave a look whenever you like, ご主人様.'

  expect(splitReport(said)).toEqual({ line: said, report: null })
})

test('a list under a sentence is a page, and the sentence is what she says', () => {
  const said = 'Two things went wrong:\n- the port\n- the model'

  const { line, report } = splitReport(said)

  expect(line).toBe('Two things went wrong:')
  // Nothing headed it, so the line that introduced it is what names it — minus
  // the colon it was leading into.
  expect(report?.title).toBe('Two things went wrong')
  expect(report?.body).toBe('- the port\n- the model')
})

test('an answer that opens on a heading says the heading and files the rest', () => {
  // What she actually does when asked for a report: no sentence in front of it
  // at all. The box has to hold something, and what she titled it is her own
  // words for it.
  const { line, report } = splitReport('# openchan\n\nA maid who lives in your terminal.')

  expect(line).toBe('openchan')
  expect(report?.title).toBe('openchan')
  expect(report?.body.startsWith('# openchan')).toBe(true)
})

test('writing with neither a sentence nor a heading is left where it is', () => {
  // Nothing she could be saying while handing it over, and an empty box reads
  // as her having left the room.
  const table = '| a | b |\n|---|---|\n| 1 | 2 |'

  expect(splitReport(table)).toEqual({ line: table, report: null })
  expect(splitReport('```ts\nfoo()\n```').report).toBeNull()
})

test('her line is fixed the moment there is a page, and never moves again', () => {
  // Her line is re-read from the whole of what she has said every time a few
  // more characters land. If it drifted, words would be taken back out of the
  // box in front of the master.
  const spoken = new Set<string>()
  for (let at = 1; at <= ANSWER.length; at++) {
    const { line, report } = splitReport(ANSWER.slice(0, at))
    if (report) spoken.add(line)
  }

  expect([...spoken]).toEqual(['Found it, ご主人様~ the parser was the one being difficult.'])
})

test('nothing of the writing reaches her line, at any point in the stream', () => {
  // The bug this exists to fix, checked delta by delta rather than only at the
  // end: a threshold that waited for the page to be worth opening used to leave
  // the first heading sitting in the box until it was, and a heading only
  // recognised once its words arrived left the hashes there.
  for (let at = 1; at <= ANSWER.length; at++) {
    expect(splitReport(ANSWER.slice(0, at)).line).not.toContain('#')
  }
})

test('what names the page is the line that introduced it', () => {
  const said = 'Had a look at all three.\n\nHere is what I found:\n\n- one\n- two'

  const { line, report } = splitReport(said)

  expect(line).toBe('Had a look at all three.\n\nHere is what I found:')
  expect(report?.title).toBe('Here is what I found')
})

test('a title longer than the edge it is written on is cut without splitting a letter', () => {
  const said = `## ${'あ'.repeat(60)}\n\nfindings`

  const title = splitReport(`Have a look:\n\n${said}`).report!.title

  expect([...title]).toHaveLength(40)
  expect(title.endsWith('…')).toBe(true)
  // Cut by letters, not by the two halves a surrogate pair is stored in.
  expect(title).not.toMatch(/[\uD800-\uDFFF]/)
})

test('carriage returns from a file she quoted do not reach the terminal', () => {
  const { line, report } = splitReport('Found it.\r\n\r\n## What was wrong\r\n\r\nthe parser\r\n')

  expect(line).toBe('Found it.')
  expect(report?.body).toBe('## What was wrong\n\nthe parser')
})

test('a line that stops looking like writing stops being a page', () => {
  // The prefix `Here is the tag:\n#` reads as a heading; the moment the `h`
  // lands it is a hashtag and there is no page at all.
  expect(splitReport('Here is the tag:\n#').report).not.toBeNull()
  expect(splitReport('Here is the tag:\n#hashtag').report).toBeNull()
})
