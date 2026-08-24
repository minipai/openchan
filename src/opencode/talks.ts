import type { Talk } from '../between/protocol'
import { readMood, splitReport } from './reply'

/**
 * How much of the first sentence a conversation is named after: long enough to
 * know it by, short enough to stand in one row of a list. A paste is a whole
 * paragraph and would be neither.
 */
const NAME_AT_MOST = 60

/**
 * What a conversation comes to be called: the first thing said in it, on one
 * line.
 *
 * It has to be named from up here. opencode leaves a session called
 * `New session - <the moment it was opened>` for good — it names nothing
 * itself — and a list of those is one row printed over and over. What was
 * typed is the better name anyway: whoever is looking for a conversation is
 * looking for the one he remembers having, and what he said in it is what he
 * remembers.
 */
export function nameFor(prompt: string): string {
  const first = prompt.split('\n').map((one) => one.trim()).find(Boolean) ?? ''
  const letters = [...first]
  if (letters.length <= NAME_AT_MOST) return first
  return `${letters.slice(0, NAME_AT_MOST - 1).join('').trimEnd()}…`
}

/** As much of a session on disk as the list of conversations needs. */
export type PastSession = {
  id: string
  title: string
  /** Whose subagent this is, for the ones that are one. */
  parentID?: string
  time: { created: number; updated: number }
}

/**
 * The conversations worth going back to, out of every session the server holds
 * for this folder — most recently spoken in first, which is very nearly always
 * the order they are wanted in.
 *
 * Two kinds are left out. A session with a parent is a subagent's scratchpad,
 * opened by a tool she picked up and never spoken to by anyone; a folder worked
 * in for a week has more of those than real conversations. And a session
 * nothing was ever said in is not a conversation either — every window that
 * opened here and was closed again left one behind.
 *
 * The one she is in now is kept whichever of those it looks like: the list
 * marks where it stands, and a mark on a row that is not there is no mark.
 */
export function talksIn(sessions: PastSession[], current: string): Talk[] {
  return sessions
    .filter((one) => one.id === current || (!one.parentID && !unspoken(one)))
    .map((one) => ({
      id: one.id,
      // One nothing has been said in has nothing to be named after, and
      // opencode's own name for it is the moment it was opened written out in
      // full. It is only ever the one she is standing in.
      title: unspoken(one) ? 'Nothing said in it yet' : one.title,
      when: one.time.updated,
    }))
    .sort((one, other) => other.when - one.when)
}

/** Whether nothing was ever said in a session: opencode touches it whenever
 * anything lands in it, so one last touched when it was opened is empty. */
const unspoken = (one: PastSession) => one.time.updated === one.time.created

/** As much of a message as picking a conversation up needs: whose it was, and
 * the text in it. */
export type PastMessage = { info: { role: string }; parts: { type: string; text?: string }[] }

/**
 * How much of a conversation is read back to find where it was left. The server
 * gives the last of them, and one message is a whole turn of hers — tools and
 * all — so this is the last few turns, which is as far back as the last words
 * she said can be.
 *
 * Bounded because a conversation is as long as it is: a week-old one is
 * megabytes of tool output, and all of it would be read on the key press that
 * opens it.
 */
export const READ_BACK = 4

/**
 * Where a conversation was left: the last thing she said in it, read back the
 * same way it was read as she said it — the 【…】 off the end of it, and the
 * page split from the line.
 *
 * The last of her messages that has words in it, rather than simply the last:
 * a turn cut off mid-tool leaves one with nothing said in it, and an empty box
 * is exactly what a resume that did nothing looks like. Its text parts are
 * joined the way they were spoken, a paragraph apart — she says something,
 * picks up a tool, and writes once she knows the answer, and glued end to end
 * those run into one sentence.
 */
export function lastSaid(messages: PastMessage[]) {
  const text = messages
    .filter((one) => one.info.role === 'assistant')
    .map((one) =>
      one.parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text!)
        .join('\n\n')
        .trim(),
    )
    .filter(Boolean)
    .at(-1)
  const { line, expression, marker } = readMood(text ?? '')
  const { line: spoken, report } = splitReport(line)
  return { line: spoken, expression: expression ?? undefined, mood: marker ?? undefined, report }
}
