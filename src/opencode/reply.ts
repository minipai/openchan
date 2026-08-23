import { faceFor, type Expression } from '../her/expressions'

/**
 * What she wrote, read back: the 【…】 she signs a line with, and the line she
 * speaks split from the page she wrote under it.
 *
 * Text in, text out. Nothing here knows which agent is standing behind her —
 * she talks and writes the same way whoever it is, so this half travels
 * whole to the next one.
 */

/**
 * Her line, split from the 【…】 she signs it with.
 *
 * The marker is not part of what she says — it is how she names her face — so
 * it comes off the line and is handed over separately, or the box shows it
 * twice. A marker still being written comes off too: it arrives a character at
 * a time and a half-typed one on screen reads as her stammering.
 */
export function readMood(raw: string) {
  const marker = raw.match(/【[^【】]*】\s*$/)
  const line = raw.replace(/【[^【】]*】?\s*$/, '').trimEnd()
  if (!marker) return { line, expression: null as Expression | null, marker: null }
  return { line, expression: faceFor(marker[0]), marker: marker[0] }
}

/**
 * A line that is written rather than spoken: a heading, a fenced block, a list
 * item, a table row, a quotation, a rule.
 *
 * Nothing underneath her has a notion of a report — an answer arrives as text
 * growing a delta at a time, and that is all there is to go on. So what
 * counts as one is read off the writing itself, and these are the marks that do
 * not fit in a line of dialogue. A heading counts before its words arrive — the
 * hashes land a character at a time, and a line already known to be a heading
 * must not sit in the box waiting for them.
 */
const WRITTEN = /^ {0,3}(?:#{1,6}(?: |$)|```|~~~|[-*+] |\d+[.)] |\||> |(?:-{3,}|\*{3,})\s*$)/

/** How long a title is allowed to be before the frame it is written on runs
 * out of edge. Counted in characters rather than in what a terminal draws them
 * in — a Japanese heading is twice as wide as it is long, which is why this is
 * well under the width of the page. */
const AT_MOST = 40

/** The line that introduces it, as a title: the last thing she said before she
 * started writing, without the colon it was leading into. */
function shorten(text: string): string {
  const one = text.replace(/[:：]\s*$/, '').trim()
  const letters = [...one]
  if (letters.length <= AT_MOST) return one
  return `${letters.slice(0, AT_MOST - 1).join('').trimEnd()}…`
}

/**
 * Her answer, split into what she says and what she wrote.
 *
 * Everything from the first written line down is the report; what came before
 * it is what she says while handing it over. The split point only ever moves
 * forward as more of the answer arrives, so her line is fixed the moment there
 * is a report at all and is never taken back mid-sentence.
 *
 * An answer with no writing in it is left whole, which is most of them — a
 * couple of sentences must not go behind a key press.
 *
 * She often opens straight into a heading with nothing said in front of it.
 * Then the heading is what she says: the box has to hold something, an emptied
 * one reads as her having left the room, and what she titled it is her own
 * words for it. With neither a sentence nor a heading there is nothing she
 * could be saying, so that one is left whole too.
 */
export function splitReport(said: string): {
  line: string
  report: { title: string; body: string } | null
} {
  // She quotes files, and some of them come from Windows. The carriage returns
  // would go straight to the terminal.
  const text = said.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const at = lines.findIndex((one) => WRITTEN.test(one))
  if (at < 0) return { line: text, report: null }

  const body = lines.slice(at).join('\n').trim()
  // What she headed it with, if she headed it — and only on the first line of
  // it, so that a heading further down cannot rewrite the title on a page the
  // master already has open.
  const headed = body.split('\n')[0]!.match(/^ {0,3}#{1,6} +(.+)$/)?.[1]

  const lead = lines.slice(0, at).join('\n').trim()
  // The line that introduces it is the last thing she said before it, not the
  // first — a paragraph of preamble and then "here is what I found:" names the
  // page better than the preamble does.
  const introduces = lead.split('\n').filter((one) => one.trim()).at(-1)
  const names = headed ?? introduces
  if (!names) return { line: text, report: null }

  return { line: lead || names, report: { title: shorten(names), body } }
}
