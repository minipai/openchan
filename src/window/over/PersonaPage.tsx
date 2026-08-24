import { meetingKeys } from '../keys'
import { EdgeKeys, packed } from './edge'
import type { Character } from '../../her/cast'
import type { Palette } from '../theme'

/**
 * Who she is: the words the girl standing there is being played from, on a page
 * of her own.
 *
 * Read-only on purpose, and nothing to do with her turn. Her persona is settled
 * before her session starts — it is what the agent was opened with — so there
 * is nothing here to change and nobody to tell. Opening it says nothing to her,
 * the same way asking after the folder does, and closing it leaves the scene
 * exactly as it was: she is still standing there, her box still has her line in
 * it, and this was only ever drawn over the top.
 *
 * It scrolls, because a persona is a document. The panel of how the work stands
 * is three lines and can be taken in at a glance; this is several screens of
 * writing however wide the terminal is, and a box that showed the first
 * screenful of her with nothing saying there was more would be read as the whole
 * of her. So the arrows move it, and the page says so along its own edge.
 */
export function PersonaPage({
  theme,
  who,
  persona,
  width,
  height,
}: {
  theme: Palette
  who: Character
  /** Her file, as it is written, minus the filing at the top of it. */
  persona: string
  width: number
  height: number
}) {
  // A row of the page each, the same as the report: the frame is as tall as it
  // was asked to be, so a row the keys grow into is a row the writing loses.
  const keys = packed(meetingKeys(), width - 6)
  const page = Math.max(1, height - 5 - keys.length)

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      // Her name is the title because the page is her: which of them this is
      // is the first thing worth knowing about it, and the one thing the
      // writing underneath does not reliably say in its first line.
      title={` How ${who.name} is written `}
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
          {persona}
        </text>
      </scrollbox>

      <EdgeKeys theme={theme} rows={keys} />
    </box>
  )
}
