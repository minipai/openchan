import { useRef } from 'react'
import type { InputRenderable } from '@opentui/core'
import { pathKeys, shownAs } from '../keys'
import type { Palette } from '../theme'

/**
 * A folder written out rather than picked off the list.
 *
 * The list can only offer folders she has already been in, and the first time
 * she is sent anywhere it has none of them — so one row of it asks for a path
 * instead, and taking that row puts the rows away and leaves this in their
 * place. One thing over the scene either way: the frame is in the same spot,
 * with a line to type into where the rows were.
 *
 * What the typed path comes to and whether there is anything there is not this
 * box's to say — it hands over what was typed and is told what was wrong with
 * it, so a mistyped path stays on screen with the mistake named under it rather
 * than closing and quietly doing nothing.
 */
export function PathBox({
  theme,
  from,
  trouble,
  width,
  onGo,
}: {
  theme: Palette
  /** Where she is now, written the way the list writes it, as the empty line's
   * standing offer. It is read rather than used: what a path is read from is
   * the window's to say. */
  from: string
  /** What was wrong with the last path typed, if one was. */
  trouble: string | null
  width: number
  onGo: (typed: string) => void
}) {
  // Read off the line when Enter hands it over rather than mirrored into
  // state: a paste a terminal did not wrap is the path and its Enter in one
  // chunk, every byte taken in before a render, and state would still be empty
  // at the Enter.
  const line = useRef<InputRenderable>(null)

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title=" Where she works "
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
    >
      <box flexDirection="row" gap={1}>
        <text fg={theme.primary}>›</text>
        <input
          ref={line}
          focused
          placeholder={from}
          flexGrow={1}
          backgroundColor={theme.card}
          onSubmit={() => onGo(line.current!.value)}
        />
      </box>

      {/* Kept to a line whether or not there is anything wrong, so naming the
          mistake does not move the keys under it out from under the eye that
          is already there. */}
      <box height={1}>
        <text fg={theme.primary}>{trouble ?? ''}</text>
      </box>

      <box flexDirection="row" gap={3}>
        {pathKeys().map((key) => (
          <box key={key.press} flexDirection="row" gap={1} flexShrink={0}>
            <text fg={theme.primary}>{shownAs(key.press)}</text>
            <text fg={theme.faint}>{key.says}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
