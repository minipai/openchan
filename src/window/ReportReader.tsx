import { columns } from './Asking'
import { readingKeys, shownAs, type Shortcut } from './keys'
import type { Report } from '../scene'
import type { Palette } from './theme'

/** What is left between one key along the bottom edge and the next. */
const APART = 3

/**
 * The keys along the bottom edge, in as many rows as they need.
 *
 * Four of them do not fit a narrow page on one line, and a row that does not
 * fit is not cut short — it runs off the edge, taking the border with it and
 * leaving the last key written down nowhere anybody looks. Which key that is
 * is whichever was written down last, so the page would be the one thing on
 * screen that never says it can be copied.
 */
function packed(keys: Shortcut[], room: number): Shortcut[][] {
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

/**
 * What she wrote, given a page of its own.
 *
 * She has one line to talk in, and everything longer than that used to be
 * crammed into it — so the writing lives here instead and the line stays a line.
 * Laid over the scene the same way the keys and the list are: she keeps standing
 * there, her box keeps what she said, and putting this away is simply not
 * drawing it any more. Nothing is lost by closing it; the report is the scene's
 * and stays there until she is asked something else.
 *
 * Unlike the keys overlay, this one scrolls — a report is as long as it is. The
 * arrows that scroll it are the frame's own, the way an open list moves under
 * them, so they are handed on rather than taken by the window.
 */
export function ReportReader({
  theme,
  report,
  width,
  height,
}: {
  theme: Palette
  report: Report
  width: number
  height: number
}) {
  // What the keys along the bottom edge take, which is a row of the page each:
  // the frame is as tall as it was asked to be, and a row grown into rather
  // than out of is a row the writing does not get.
  const keys = packed(readingKeys(), width - 6)
  // What is left for the writing once the frame, the padding and those have
  // taken theirs.
  const page = Math.max(1, height - 5 - keys.length)

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title={` ${report.title} `}
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      height={height}
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <scrollbox
        focused
        height={page}
        backgroundColor={theme.card}
        contentOptions={{ backgroundColor: theme.card }}
        viewportOptions={{ backgroundColor: theme.card }}
      >
        <text fg={theme.foreground} wrapMode="word">
          {report.body}
        </text>
      </scrollbox>

      <box marginTop={1} flexDirection="column">
        {keys.map((row) => (
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
    </box>
  )
}
