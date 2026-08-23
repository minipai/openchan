import { useMemo, useRef } from 'react'
import { listKeys, shownAs } from './keys'
import type { Palette } from './theme'

/** One row of a list: what picking it hands back, and what it reads as. */
export type Choice = { id: string; label: string }

/** How many rows a list shows before it starts scrolling instead of growing. */
const AT_MOST = 10

/**
 * A list laid over the scene, to pick one thing off.
 *
 * The same list every time something has to be chosen — a model, and after it
 * whichever of her the master wants and which of her conversations — so it
 * knows nothing about what is in it beyond what a row says and which one is
 * already in force.
 *
 * Moving through it and taking what it is on are the list's own keys, the way
 * Enter is the input's; putting it away is the window's, because the window is
 * the one that knows the list is there. Both come off the keys table, and the
 * list prints them along its bottom edge — the help overlay never shows them,
 * because bringing it up is what puts the list away.
 */
export function Picker({
  theme,
  title,
  items,
  chosen,
  width,
  onPick,
}: {
  theme: Palette
  /** What is being picked, on the frame's top edge. */
  title: string
  items: Choice[]
  /** The one already in force, marked so the list opens saying where it stands.
   * Nothing, before whatever holds it has said. */
  chosen: string | null
  width: number
  onPick: (id: string) => void
}) {
  const options = useMemo(
    () =>
      items.map((one) => ({
        // The one in force keeps a column to itself, so the rows stay lined up
        // under it rather than shifting by a mark.
        name: `${one.id === chosen ? '●' : ' '} ${one.label}`,
        description: '',
        value: one.id,
      })),
    [items, chosen],
  )

  // Where the list opens: on what is already in force, which is the row anyone
  // opening it is asking about. Worked out the first time there are rows to
  // work it out from — a list opened while she is still waking up has none yet
  // — and then left alone, because after that the highlight is the list's own
  // and handing it this again would drag it back here every time she spoke.
  const opensOn = useRef<number | null>(null)
  if (opensOn.current === null && items.length) {
    opensOn.current = Math.max(0, items.findIndex((one) => one.id === chosen))
  }

  // Only what works from here: a list with nothing in it has nothing to move
  // through or take, and saying otherwise along its own bottom edge would be
  // the one thing the keys table exists to stop.
  const keys = items.length ? listKeys() : listKeys().filter((key) => key.does === 'cancel')

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title={` ${title} `}
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
    >
      {items.length ? (
        <select
          options={options}
          selectedIndex={opensOn.current ?? 0}
          focused
          showDescription={false}
          showScrollIndicator
          wrapSelection
          height={Math.min(items.length, AT_MOST)}
          backgroundColor={theme.card}
          textColor={theme.muted}
          focusedTextColor={theme.foreground}
          selectedBackgroundColor={theme.primary}
          selectedTextColor={theme.foreground}
          onSelect={(_, option) => option && onPick(option.value as string)}
        />
      ) : (
        <text fg={theme.faint}>Nothing to pick from yet…</text>
      )}

      {/* Two at a time, side by side: four of them in a row is wider than the
          list they belong to. */}
      <box marginTop={1} flexDirection="row" gap={3}>
        {[keys.slice(0, 2), keys.slice(2)].map((column, at) =>
          column.length ? (
            <box key={at} flexDirection="column">
              {column.map((key) => (
                <box key={key.press} flexDirection="row" gap={1}>
                  <text fg={theme.primary}>{shownAs(key.press)}</text>
                  <text fg={theme.faint}>{key.says}</text>
                </box>
              ))}
            </box>
          ) : null,
        )}
      </box>
    </box>
  )
}
