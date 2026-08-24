import { expect, test } from 'bun:test'
import { STUCK } from '../../opencode/stand'
import { windowTestKit } from './windowTestKit'

const { onScreen } = windowTestKit()

/** Her, mid-turn, asking to be allowed something. */
async function asking(detail?: string) {
  const window = await onScreen()
  await window.wakeUp()
  await window.type('tidy up')
  await window.enter()
  await window.raise({
    kind: 'ask-permission',
    askId: 'ask-1',
    toolName: 'bash',
    summary: 'rm -rf node_modules',
    detail,
  })
  return window
}

test('a tool she is waiting to be allowed is let her from the keyboard, and the question goes', async () => {
  const { her, press, frame } = await asking()
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')
  expect(frame()).toContain('y let her')

  await press('y')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(frame()).not.toContain('She wants to use bash')
  // And she is still at it: answering the question is not the end of the turn.
  expect(frame()).toContain('ESC stop her')
})

test('a half-written sentence is still on the line once her question has been answered', async () => {
  const { her, wakeUp, type, enter, raise, press, frame } = await onScreen()
  await wakeUp()
  await type('tidy up')
  await enter()

  // Typed ahead while she works, and then her question takes the line's place
  // in the box. The line comes back with the sentence on it, not empty.
  await type('half written')
  await raise({ kind: 'ask-permission', askId: 'ask-1', toolName: 'bash', summary: 'ls', detail: '' })
  expect(frame()).not.toContain('half written')
  await press('y')

  expect(frame()).toContain('half written')
  await type(' and sent')
  await enter()
  expect(her.asked).toEqual(['tidy up', 'half written and sent'])
})

test('a paste while she is waiting to be allowed something is not hers to take', async () => {
  const { her, paste, drop, press, frame } = await asking()

  // The line is not on screen — her question is drawn in its place — so what
  // is pasted goes nowhere rather than onto a line nobody can see, and the
  // question is still the thing being answered.
  await paste('good morning\nand good evening')
  // The same paste from a terminal that does not wrap one, which arrives as
  // keys: the break in it is not a line to write anywhere either.
  await drop('later\n')
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')

  await press('y')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  // Nothing else was said to her: the sentence she is working on is the one
  // that put her to work.
  expect(her.asked).toEqual(['tidy up'])
  // And the line, back in its place, is empty rather than holding what was
  // pasted at something else.
  expect(frame()).not.toContain('good morning')
  expect(frame()).not.toContain('later')
})

test('a page over the scene is not a way to grant something nobody can see', async () => {
  const { her, hold, press, escape, frame } = await asking()

  // Who she is is a document several screens long, and reading it is leaning on
  // keys that are not about her question — which is behind it, off screen.
  await hold('s')
  expect(frame()).toContain('# Personality')
  // The keys that answer her go with the question being covered: the page is
  // narrower than the box, so a row left saying "y let her" under it would be
  // offering exactly the key this fix took away.
  expect(frame()).not.toContain('y let her')

  await press('y')
  await press('n')
  expect(her.answered).toEqual([])
  // And the letters did nothing to the page either: they were not anybody's.
  expect(frame()).toContain('# Personality')

  // Put the page away and the question is where it was left — it was covered,
  // not lost — and answerable again.
  await escape()
  expect(frame()).toContain('She wants to use bash: rm -rf node_modules')
  expect(frame()).toContain('y let her')
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
})

test('the keys held up in front of her question do not offer to answer it', async () => {
  const { her, hold, press, escape, frame } = await asking()

  // The likeliest moment to want this list is while she is asking to be allowed
  // something — so it is the moment it matters that the list does not say y
  // still works, and that pressing it does nothing.
  await hold('k')
  expect(frame()).toContain('put these away')
  expect(frame()).not.toContain('let her')
  await press('y')
  expect(her.answered).toEqual([])

  await escape()
  expect(frame()).toContain('y let her')
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
})

test('a tool she is waiting to be allowed is refused from the keyboard', async () => {
  const { her, press, frame } = await asking()

  await press('n')

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: false }])
  expect(frame()).not.toContain('She wants to use bash')
})

test('the whole of what she would do opens over the question, and shuts again', async () => {
  const { tab, frame } = await asking('rm -rf node_modules\nrm -rf dist')
  expect(frame()).not.toContain('rm -rf dist')

  await tab()
  expect(frame()).toContain('rm -rf dist')
  // The question is unchanged under it.
  expect(frame()).toContain('y let her')

  await tab()
  expect(frame()).not.toContain('rm -rf dist')
})

/** Her question with the answers written out, as she asks it. */
const WHICH = {
  header: 'Which first',
  question: 'Which of these should I start on?',
  options: [
    { label: 'The tests', description: 'They are what is red.' },
    { label: 'The docs' },
    { label: 'The release' },
  ],
  multiple: false,
}
const WHICH_ONES = { ...WHICH, header: 'Which ones', question: 'Which of these are worth doing at all?', multiple: true }

/** Her, mid-turn, asking for something to be picked. */
async function choosing(...questions: (typeof WHICH)[]) {
  const window = await onScreen()
  await window.wakeUp()
  await window.type('tidy up')
  await window.enter()
  await window.raise({ kind: 'ask-choice', askId: 'ask-2', questions })
  return window
}

test('a question with choices is on screen as a list, and the row taken is her answer', async () => {
  const { her, frame, arrow, enter } = await choosing(WHICH)

  // The question, under the few words it goes by, with what she had to say
  // about a row under the row.
  expect(frame()).toContain('Which first')
  expect(frame()).toContain('Which of these should I start on?')
  expect(frame()).toContain('The tests')
  expect(frame()).toContain('They are what is red.')
  // She is still at it underneath — the corner says what ESC does from here.
  expect(frame()).toContain('ESC never mind')

  await arrow('down')
  await enter()

  // One question, one row: the answer is the label, as she wrote it.
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The docs']] }])
  expect(frame()).not.toContain('Which of these should I start on?')
  // And she is still at it: answering is not the end of the turn.
  expect(frame()).toContain('ESC stop her')
})

test('a question that takes several is ticked, and Enter hands back whatever is ticked', async () => {
  const { her, frame, press, arrow, enter } = await choosing(WHICH_ONES)

  expect(frame()).toContain('☐ The tests')
  expect(frame()).toContain('Space tick it')

  await press(' ')
  await arrow('down')
  await arrow('down')
  await press(' ')
  expect(frame()).toContain('☑ The tests')
  expect(frame()).toContain('☐ The docs')
  expect(frame()).toContain('☑ The release')
  // Ticking is not answering.
  expect(her.chosen).toEqual([])

  await enter()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests', 'The release']] }])
  expect(frame()).not.toContain('Which of these are worth doing')
})

test('a question put away with ESC is declined, not answered', async () => {
  const { her, frame, arrow, escape } = await choosing(WHICH)

  // Moved onto a row first: the one thing a cancel must not do is hand back
  // whatever the list happened to be on.
  await arrow('down')
  await escape()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: 'declined' }])
  expect(frame()).not.toContain('Which of these should I start on?')
  // ESC went to the question, not past it to her: she is still working.
  expect(her.interrupted).toBe(0)
  expect(frame()).toContain('ESC stop her')
})

test('ticks made and then put away with ESC are not an answer either', async () => {
  const { her, press, escape } = await choosing(WHICH_ONES)

  await press(' ')
  await escape()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: 'declined' }])
})

test('several questions asked at once are taken one at a time and handed back together', async () => {
  const { her, frame, arrow, press, enter, escape } = await choosing(WHICH, WHICH_ONES)

  expect(frame()).toContain('Which of these should I start on?')
  await arrow('down')
  await enter()

  // The first is answered and kept; the second is up, starting from nothing.
  expect(her.chosen).toEqual([])
  expect(frame()).toContain('Which of these are worth doing at all?')
  expect(frame()).not.toContain('☑')

  await press(' ')
  await enter()

  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The docs'], ['The tests']] }])

  // And declining halfway through declines the whole of it: she asked them
  // together, and half an answer is not what she asked for.
  await her.raise({ kind: 'ask-choice', askId: 'ask-3', questions: [WHICH, WHICH_ONES] })
  await enter()
  await escape()
  expect(her.chosen[1]).toEqual({ askId: 'ask-3', answers: 'declined' })
})

test('what the window opens goes over her question, and it is back as it was left', async () => {
  const { her, frame, hold, escape, arrow, press, enter } = await choosing(WHICH_ONES)

  // A tick made, and the highlight moved off it, before the list is covered.
  await press(' ')
  await arrow('down')
  expect(frame()).toContain('☑ The tests')

  await hold('p')
  expect(frame()).toContain('What she thinks with')
  expect(frame()).not.toContain('Which of these are worth doing')
  // The keys the covered list answers to are not answered while it is covered:
  // Space here would otherwise tick a row nobody can see.
  await press(' ')

  // ESC puts the model list away, and only that: the question is still hers
  // to answer, not declined by a key aimed at something else.
  await escape()
  expect(frame()).toContain('Which of these are worth doing')
  expect(her.chosen).toEqual([])
  // The tick is still there, and the highlight is where it was — so Enter
  // hands back what was ticked rather than an answer of nothing.
  expect(frame()).toContain('☑ The tests')
  expect(frame()).toContain('☐ The docs')

  await press(' ')
  await enter()
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests', 'The docs']] }])
})

test('something in the way goes over her question, and ESC is the note’s rather than a decline', async () => {
  const { her, frame, getStuck, escape, enter } = await choosing(WHICH)

  await getStuck()
  expect(frame()).toContain(STUCK.title)
  expect(frame()).not.toContain('Which of these should I start on?')

  // Putting the note away declines nothing; the question is back to be
  // answered, as it still is on the server.
  await escape()
  expect(her.chosen).toEqual([])
  expect(frame()).not.toContain(STUCK.title)
  expect(frame()).toContain('Which of these should I start on?')

  await enter()
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests']] }])
})

test('the line she is spoken to on does not take Enter while her question is up', async () => {
  const { her, type, enter } = await choosing(WHICH)

  await type('never mind that')
  await enter()

  // Enter took the row, not the sentence.
  expect(her.asked).toEqual(['tidy up'])
  expect(her.chosen).toEqual([{ askId: 'ask-2', answers: [['The tests']] }])
})

test('a letter typed at the list of models is not an answer to what she is waiting to be allowed', async () => {
  const { her, hold, type, escape, press, frame } = await asking()

  await hold('p')
  await type('any')
  expect(her.answered).toEqual([])
  expect(frame()).toContain('› any')

  // Her question is still there to be answered once the list is away.
  await escape()
  await escape()
  await press('y')
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
})
