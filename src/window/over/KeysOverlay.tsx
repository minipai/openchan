import { keysNow, shownAs, type Where } from '../keys'
import type { Palette } from '../theme'

/**
 * What the keys do, laid over the scene.
 *
 * Nothing underneath is taken down to show this — she keeps standing there and
 * her box keeps whatever she last said in it, so putting the keys away is
 * simply not drawing them any more.
 */
export function KeysOverlay({
  theme,
  where,
  width,
}: {
  theme: Palette
  where: Where
  width: number
}) {
  const groups = keysNow(where)
  // Every key printed the same width, so what they do lines up down the page.
  const column = Math.max(0, ...groups.flatMap((group) => group.keys.map((key) => shownAs(key.press).length)))

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title=" Keys "
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      {groups.map((group, at) => (
        <box key={group.heading} flexDirection="column" marginTop={at === 0 ? 0 : 1}>
          <text fg={theme.faint}>{group.heading}</text>
          {group.keys.map((key) => (
            <box key={`${key.press} ${key.does}`} flexDirection="row" gap={2}>
              <text fg={theme.primary}>{shownAs(key.press).padEnd(column)}</text>
              <text fg={theme.foreground}>{key.says}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  )
}
