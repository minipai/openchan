import { columns } from '../box/Asking'
import { shownAs, type Shortcut } from '../keys'
import type { Palette } from '../theme'

/**
 * A line cut to the room there is for it, from the end.
 *
 * The other way round is a folder's: a path is worth its tail and is cut at the
 * front. A sentence is worth its front, and the counts on these panels are read
 * left to right — what a narrow terminal has to lose is the last pile, said so
 * with the mark rather than by the line simply stopping.
 *
 * Here with the keys because the panels that share those share this: it is the
 * one thing every glance over the scene has to do to every line it draws.
 */
export const cut = (text: string, within: number) => {
  const letters = [...text]
  if (letters.length <= within) return text
  return `${letters.slice(0, Math.max(0, within - 1)).join('')}…`
}

/** What is left between one key along the bottom edge and the next. */
const APART = 3

/**
 * The keys along the bottom edge, in as many rows as they need.
 *
 * Four of them do not fit a narrow page on one line, and a row that does not
 * fit is not cut short — it runs off the edge, taking the border with it and
 * leaving the last key written down nowhere anybody looks. Which key that is
 * is whichever was written down last, so the page would be the one thing on
 * screen that never says it can be scrolled.
 *
 * Packing is the caller's to do rather than this frame's, because how many
 * rows come out of it is how many rows the writing above does not get.
 */
export function packed(keys: Shortcut[], room: number): Shortcut[][] {
  const rows: Shortcut[][] = [[]]
  let used = 0
  for (const key of keys) {
    const wide = columns(`${shownAs(key.press)} ${key.says}`)
    const row = rows[rows.length - 1]!
    if (row.length > 0 && used + APART + wide > room) {
      rows.push([key])
      used = wide
      continue
    }
    row.push(key)
    used += row.length > 1 ? APART + wide : wide
  }
  return rows
}

/** Those rows, drawn along the bottom of whatever they belong to. */
export function EdgeKeys({ theme, rows }: { theme: Palette; rows: Shortcut[][] }) {
  return (
    <box marginTop={1} flexDirection="column">
      {rows.map((row) => (
        <box key={row[0]!.press} flexDirection="row" gap={APART}>
          {row.map((key) => (
            <box key={key.press} flexDirection="row" gap={1} flexShrink={0}>
              <text fg={theme.primary}>{shownAs(key.press)}</text>
              <text fg={theme.faint}>{key.says}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  )
}
