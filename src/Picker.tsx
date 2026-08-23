import { useMemo, useRef, useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { cut } from './Asking'
import { listKeys, shownAs } from './keys'
import type { Palette } from './theme'

/** One row of a list: what picking it hands back, what it reads as, and — when
 * whoever wrote the row had more to say about it — a line under it. */
export type Choice = { id: string; label: string; description?: string }

/** How many rows a list shows before it starts scrolling instead of growing. */
const AT_MOST = 10

/**
 * A list laid over the scene, to pick one thing off — or several.
 *
 * The same list every time something has to be chosen — a model, whichever of
 * her the master wants, which folder, and the answers she has written out to a
 * question of her own — so it knows nothing about what is in it beyond what a
 * row says and which one is already in force.
 *
 * Told it takes several, it takes them the way a form does: Space ticks the
 * row it is on, Enter hands back whatever is ticked — none of them, if that is
 * the answer. Ticks are the list's own and nobody else's business until Enter.
 * The rows know nothing of Space, so it reaches the list, which ticks the row
 * the highlight was last reported on.
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
  asks,
  items,
  chosen,
  multiple = false,
  focused = true,
  width,
  onPick,
}: {
  theme: Palette
  /** What is being picked, on the frame's top edge. */
  title: string
  /** The question the rows answer, written out above them — when there is one.
   * A list of models is its own question. */
  asks?: string
  items: Choice[]
  /** The one already in force, marked so the list opens saying where it stands.
   * Nothing, before whatever holds it has said. */
  chosen: string | null
  /** Whether more than one row can be taken. */
  multiple?: boolean
  /** Whether the list has the keyboard. It does unless something has been
   * opened over it — then it is kept, ticks and highlight and all, but takes
   * nothing until that is put away. */
  focused?: boolean
  width: number
  /** What was taken: one row, or for a list that takes several, every row
   * ticked, in the order the list had them. */
  onPick: (ids: string[]) => void
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  // Whoever wrote the rows said something under at least one of them, so every
  // row gets the line for it — drawn under the one that has it and left empty
  // under the rest, which is the only way the rows stay a fixed height apart.
  const described = items.some((one) => one.description)
  // What is left of a row once the frame, its padding, the highlight's own
  // pointer and the mark are off it. The line under it starts where the mark
  // does and is indented to the label by hand, so it has the mark's two back.
  const room = width - 9
  const options = useMemo(
    () =>
      items.map((one) => ({
        // The mark keeps a column to itself, so the rows stay lined up under it
        // rather than shifting by a mark: the one in force on a list that takes
        // one row, the ticks on a list that takes several.
        name: `${multiple ? (ticked.has(one.id) ? '☑' : '☐') : one.id === chosen ? '●' : ' '} ${cut(one.label, room)}`,
        // Under the label rather than under the mark: the rows draw it where
        // the name starts, and the name starts with the mark.
        description: one.description ? `  ${cut(one.description, room)}` : '',
        value: one.id,
      })),
    [items, chosen, multiple, ticked, room],
  )

  // Where the list opens: on what is already in force, which is the row anyone
  // opening it is asking about. Worked out the first time there are rows to
  // work it out from — a list opened while she is still waking up has none yet
  // — and then left alone, because after that the highlight is the list's own
  // and handing it this again would drag it back here every time she spoke.
  const opensOn = useRef<number | null>(null)
  // Where the highlight is now, as the rows last said. The rows own it — this
  // is only so that Space, which the rows do not answer, knows which one to
  // tick.
  const highlighted = useRef(0)
  if (opensOn.current === null && items.length) {
    opensOn.current = Math.max(0, items.findIndex((one) => one.id === chosen))
    highlighted.current = opensOn.current
  }

  useKeyboard((key) => {
    if (!focused || !multiple || key.name !== 'space') return
    const under = items[highlighted.current]
    if (!under) return
    setTicked((was) => {
      const now = new Set(was)
      if (!now.delete(under.id)) now.add(under.id)
      return now
    })
  })

  // Only what works from here: a list with nothing in it has nothing to move
  // through or take, and saying otherwise along its own bottom edge would be
  // the one thing the keys table exists to stop.
  const keys = items.length ? listKeys(multiple) : listKeys().filter((key) => key.does === 'cancel')
  // Two columns, side by side, however many rows that takes: all of them in
  // one row is wider than the list they belong to, and a third column is too
  // once there are five.
  const rows = Math.ceil(keys.length / 2)
  const columns = [keys.slice(0, rows), keys.slice(rows)].filter((column) => column.length)

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
      {asks && (
        <box paddingX={1} marginBottom={1}>
          <text fg={theme.foreground} wrapMode="word">{asks}</text>
        </box>
      )}

      {items.length ? (
        <select
          options={options}
          selectedIndex={opensOn.current ?? 0}
          focused={focused}
          showDescription={described}
          showScrollIndicator
          wrapSelection
          // Rows with a line under them are two rows each, and it is the rows
          // on screen that are capped rather than the items: a list twice as
          // tall as it was meant to be runs off a short terminal, and what it
          // loses off the bottom is the key that puts it away.
          height={Math.min(items.length, Math.floor(AT_MOST / (described ? 2 : 1))) * (described ? 2 : 1)}
          backgroundColor={theme.card}
          textColor={theme.muted}
          focusedTextColor={theme.foreground}
          selectedBackgroundColor={theme.primary}
          selectedTextColor={theme.foreground}
          selectedDescriptionColor={theme.foreground}
          descriptionColor={theme.faint}
          onChange={(at) => void (highlighted.current = at)}
          // Enter: the row it is on, or — for a list that takes several —
          // whatever is ticked, in the order the rows had rather than the
          // order they were ticked in.
          onSelect={(_, option) =>
            option &&
            onPick(
              multiple
                ? items.filter((one) => ticked.has(one.id)).map((one) => one.id)
                : [option.value as string],
            )
          }
        />
      ) : (
        <text fg={theme.faint}>Nothing to pick from yet…</text>
      )}

      <box marginTop={1} flexDirection="row" gap={3}>
        {columns.map((column, at) => (
          <box key={at} flexDirection="column">
            {column.map((key) => (
              <box key={key.press} flexDirection="row" gap={1}>
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
