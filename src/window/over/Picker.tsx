import { useMemo, useRef, useState } from 'react'
import { useKeyboard } from '@opentui/react'
import { cut } from '../box/Asking'
import { listKeys, shownAs } from '../keys'
import type { Palette } from '../theme'

/** One row of a list: what picking it hands back, what it reads as, and — when
 * whoever wrote the row had more to say about it — a line under it. */
export type Choice = { id: string; label: string; description?: string }

/** How many rows a list shows before it starts scrolling instead of growing —
 * where the terminal has the room for that many. */
const AT_MOST = 10

/** Whether a row reads as what was typed at the list: every word of it
 * somewhere in the label, in any order, case ignored — so "opus anthropic"
 * finds "Anthropic · Claude Opus" as well as "anthropic opus" does. */
function readsAs(label: string, typed: string): boolean {
  const read = label.toLowerCase()
  return typed
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => read.includes(word))
}

/**
 * A list laid over the scene, to pick one thing off — or several.
 *
 * The same list every time something has to be chosen — a model, whichever of
 * her the master wants, which folder, which of the conversations already had
 * there, and the answers she has written out to a question of her own — so it
 * knows nothing about what is in it beyond what a row says and which one is
 * already in force.
 *
 * Told it takes several, it takes them the way a form does: Space ticks the
 * row it is on, Enter hands back whatever is ticked — none of them, if that is
 * the answer. Ticks are the list's own and nobody else's business until Enter.
 * The rows know nothing of Space, so it reaches the list, which ticks the row
 * the highlight was last reported on.
 *
 * As tall as it has rows for, and never taller than the terminal it stands in:
 * the frame grows out of the middle in both directions, so a list too tall for
 * the screen loses its own bottom edge and the keys written along it.
 *
 * Told it can be narrowed by typing, it takes the letters too: every word typed
 * has to be somewhere in a row for the row to stay. What was typed is shown
 * above the rows, so it is clear why the rest went away. Two of the lists are
 * told so — what she thinks with runs to hundreds of rows, and what has been
 * talked about here is rows of sentences, which is what typing is for. Who is
 * on shift is a handful of names, and what she has on is fewer — a search box
 * over either of those is noise.
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
  narrowing,
  focused = true,
  width,
  room,
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
  /** What the list has been narrowed to by typing, and where the next letter
   * goes. Only a list handed this can be typed at; the text is held by whoever
   * opened the list, because the window has to know whether there is anything
   * typed before it can say what ESC does. */
  narrowing?: { typed: string; onType: (typed: string) => void }
  /** Whether the list has the keyboard. It does unless something has been
   * opened over it — then it is kept, ticks and highlight and all, but takes
   * nothing until that is put away. */
  focused?: boolean
  width: number
  /** How tall the list may stand: the terminal, which is what it is centred
   * in. It shows fewer rows rather than more than it has room for — grown past
   * the screen it loses whichever end is off it, and what goes first is the
   * keys that say how to get out of it. */
  room: number
  /** What was taken: one row, or for a list that takes several, every row
   * ticked, in the order the list had them. */
  onPick: (ids: string[]) => void
}) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const typed = narrowing?.typed ?? ''
  // The rows that read as what was typed — all of them, until something is.
  const shown = useMemo(() => (typed ? items.filter((one) => readsAs(one.label, typed)) : items), [items, typed])
  // Whoever wrote the rows said something under at least one of them, so every
  // row gets the line for it — drawn under the one that has it and left empty
  // under the rest, which is the only way the rows stay a fixed height apart.
  const described = shown.some((one) => one.description)
  // What is left across a row once the frame, its padding, the highlight's own
  // pointer and the mark are off it. The line under it starts where the mark
  // does and is indented to the label by hand, so it has the mark's two back.
  const across = width - 9
  const options = useMemo(
    () =>
      shown.map((one) => ({
        // The mark keeps a column to itself, so the rows stay lined up under it
        // rather than shifting by a mark: the one in force on a list that takes
        // one row, the ticks on a list that takes several.
        name: `${multiple ? (ticked.has(one.id) ? '☑' : '☐') : one.id === chosen ? '●' : ' '} ${cut(one.label, across)}`,
        // Under the label rather than under the mark: the rows draw it where
        // the name starts, and the name starts with the mark.
        description: one.description ? `  ${cut(one.description, across)}` : '',
        value: one.id,
      })),
    [shown, chosen, multiple, ticked, across],
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
  // Where the rows start once they have been narrowed: on the one in force if
  // it is still among them, and on the first of them otherwise. Worked out
  // again at every letter, because the rows under the highlight are different
  // ones each time — and the rows are a fresh list each time for the same
  // reason, so that they do start there rather than wherever the last lot was
  // left.
  const startsOn = typed ? Math.max(0, shown.findIndex((one) => one.id === chosen)) : (opensOn.current ?? 0)
  const lastTyped = useRef(typed)
  if (lastTyped.current !== typed) {
    lastTyped.current = typed
    highlighted.current = startsOn
  }
  // What has been typed as of the last key, not the last render: letters can
  // arrive faster than the rows are redrawn, and each one has to go on the end
  // of what the one before it left rather than on the end of what is on screen.
  const typing = useRef(typed)
  typing.current = typed

  useKeyboard((key) => {
    if (!focused) return
    if (key.name === 'space' && multiple) {
      const under = shown[highlighted.current]
      if (!under) return
      return setTicked((was) => {
        const now = new Set(was)
        if (!now.delete(under.id)) now.add(under.id)
        return now
      })
    }
    // No rows yet is nothing to narrow: the edge does not offer typing then,
    // and a key offered nowhere must do nothing.
    if (!narrowing || !items.length) return
    // The letters are the list's rather than the rows': left to the rows, j
    // and k would move the highlight as they were typed.
    if (key.name === 'backspace') {
      key.preventDefault()
      typing.current = typing.current.slice(0, -1)
      return narrowing.onType(typing.current)
    }
    if (key.ctrl || key.meta || key.super || key.hyper) return
    const letter = key.name === 'space' ? ' ' : key.sequence
    if (!letter || letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127) return
    // A space is for between words, so there is no taking one before the
    // first: it would narrow nothing and leave ESC with it to clear.
    if (letter === ' ' && !typing.current) return
    key.preventDefault()
    typing.current += letter
    narrowing.onType(typing.current)
  })

  // Only what works from here: a list with nothing in it has nothing to move
  // through or take, and saying otherwise along its own bottom edge would be
  // the one thing the keys table exists to stop. Typing still works on a list
  // narrowed down to nothing — that is how it gets rows back — but not on one
  // that has none to narrow.
  const keys = listKeys({ ticking: multiple, narrows: narrowing !== undefined, narrowed: typed !== '' }).filter(
    (key) => shown.length > 0 || key.press === 'escape' || (key.does === 'narrow' && items.length > 0),
  )
  // Two columns, side by side, however many rows that takes: all of them in
  // one row is wider than the list they belong to, and a third column is too
  // once there are five.
  const rows = Math.ceil(keys.length / 2)
  const columns = [keys.slice(0, rows), keys.slice(rows)].filter((column) => column.length)

  // Everything the frame is besides the rows themselves: its border top and
  // bottom, the padding above them, the line typed at with the gap under it,
  // and the keys along the bottom with the gap above them. A list told it can
  // be typed at is three rows taller than the same list without, which is the
  // difference between standing in a short terminal and running off it.
  const besides = 2 + 1 + (narrowing && items.length ? 2 : 0) + 1 + rows
  const fits = Math.max(1, Math.min(AT_MOST, room - besides))

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

      {/* Only where there is something to narrow: a list with nothing in it
          refuses letters, and offering a box to type them into would be the
          same key shown and not answered that the edge below is careful not
          to print. */}
      {narrowing && items.length > 0 && (
        <box flexDirection="row" gap={1} marginBottom={1}>
          <text fg={theme.primary}>›</text>
          <text fg={typed ? theme.foreground : theme.faint}>{typed ? cut(typed, width - 6) : 'type to narrow it'}</text>
        </box>
      )}

      {shown.length ? (
        <select
          key={typed}
          options={options}
          selectedIndex={startsOn}
          focused={focused}
          showDescription={described}
          showScrollIndicator
          wrapSelection
          // Rows with a line under them are two rows each, and it is the rows
          // on screen that are capped rather than the items: a list twice as
          // tall as it was meant to be runs off a short terminal, and what it
          // loses off the bottom is the key that puts it away.
          height={Math.max(1, Math.min(shown.length, Math.floor(fits / (described ? 2 : 1)))) * (described ? 2 : 1)}
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
        // Two different nothings: rows that have not turned up yet, and rows
        // that were there and have all been typed away.
        <text fg={theme.faint}>{items.length ? 'Nothing is called that.' : 'Nothing to pick from yet…'}</text>
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
