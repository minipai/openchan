import { expect, test } from 'bun:test'
import { lastSaid, nameFor, talksIn, type PastSession } from './talks'

/** Everything a folder worked in for a while has in it: the conversation open
 * now, two that were had and left, a subagent's scratchpad under one of them,
 * and a window that was opened and closed again without a word said. */
const SESSIONS: PastSession[] = [
  { id: 'ses_now', title: 'New session', time: { created: 90, updated: 90 } },
  { id: 'ses_old', title: 'Where the needle was', time: { created: 10, updated: 20 } },
  { id: 'ses_recent', title: 'The colours of the sky', time: { created: 30, updated: 60 } },
  { id: 'ses_sub', title: 'grep for it', parentID: 'ses_recent', time: { created: 40, updated: 50 } },
  { id: 'ses_unspoken', title: 'New session', time: { created: 70, updated: 70 } },
]

test('the one she is in before anything is said in it is offered as that', () => {
  expect(talksIn(SESSIONS, 'ses_now')[0]).toEqual({
    id: 'ses_now',
    title: 'Nothing said in it yet',
    when: 90,
  })
})

test('the conversations offered are the ones somebody had, most recently spoken in first', () => {
  // The one she is in is there whether or not anything has been said in it —
  // the list marks where it stands. A subagent's scratchpad and a window opened
  // and closed again are not conversations anybody had.
  expect(talksIn(SESSIONS, 'ses_now').map((one) => one.id)).toEqual(['ses_now', 'ses_recent', 'ses_old'])
})

test('a conversation is offered under the name it was given, and when it was last spoken in', () => {
  expect(talksIn(SESSIONS, 'ses_now')[1]).toEqual({
    id: 'ses_recent',
    title: 'The colours of the sky',
    when: 60,
  })
})

test('where a conversation was left is the last thing she said in it', () => {
  const left = lastSaid([
    { info: { role: 'user' }, parts: [{ type: 'text', text: 'good morning' }] },
    { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Good morning, goshujin-sama.' }] },
    { info: { role: 'user' }, parts: [{ type: 'text', text: 'where was the needle?' }] },
    {
      info: { role: 'assistant' },
      // What she thought and what she picked up are not what she said.
      parts: [
        { type: 'reasoning', text: 'haystacks, haystacks' },
        { type: 'tool' },
        { type: 'text', text: 'In the second haystack.【 proud ᕙ( •̀ ᗜ •́)ᕗ 】' },
      ],
    },
  ])

  expect(left.line).toBe('In the second haystack.')
  expect(left.expression).toBe('proud')
  expect(left.mood).toBe('【 proud ᕙ( •̀ ᗜ •́)ᕗ 】')
  expect(left.report).toBeNull()
})

test('a page she wrote in it comes back split from the line, the same as it was said', () => {
  const left = lastSaid([
    {
      info: { role: 'assistant' },
      parts: [{ type: 'text', text: 'Here is what I found:\n\n# Colours\n\nThe sky was grey.' }],
    },
  ])

  expect(left.line).toBe('Here is what I found:')
  expect(left.report).toEqual({ title: 'Colours', body: '# Colours\n\nThe sky was grey.' })
})

test('a conversation nobody has answered in yet is picked up with nothing to say', () => {
  const left = lastSaid([{ info: { role: 'user' }, parts: [{ type: 'text', text: 'are you there?' }] }])

  expect(left.line).toBe('')
  expect(left.report).toBeNull()
})

test('a conversation is named after the first line of what was said in it', () => {
  expect(nameFor('where was the needle?')).toBe('where was the needle?')
  // A paste is a paragraph, and a row of a list is a row.
  expect(nameFor('  \n\nwhere was the needle?\nand the second one?')).toBe('where was the needle?')
  expect(nameFor('a'.repeat(80))).toBe(`${'a'.repeat(59)}…`)
})

test('a turn cut off before she said anything is picked up on the last words there were', () => {
  const left = lastSaid([
    { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Looking now.' }] },
    { info: { role: 'user' }, parts: [{ type: 'text', text: 'and the other one?' }] },
    // Stopped mid-tool: a turn of hers with nothing said in it. An empty box is
    // what a resume that did nothing looks like.
    { info: { role: 'assistant' }, parts: [{ type: 'step-start' }, { type: 'tool' }] },
  ])

  expect(left.line).toBe('Looking now.')
})
