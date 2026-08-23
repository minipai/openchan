import { readingKeys, shownAs } from './keys'
import type { Report } from './scene'
import type { Palette } from './theme'

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
  // What is left for the writing once the frame, the padding and the line of
  // keys along the bottom have taken theirs.
  const page = Math.max(1, height - 6)

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

      <box marginTop={1} flexDirection="row" gap={3}>
        {readingKeys().map((key) => (
          <box key={key.press} flexDirection="row" gap={1} flexShrink={0}>
            <text fg={theme.primary}>{shownAs(key.press)}</text>
            <text fg={theme.faint}>{key.says}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
