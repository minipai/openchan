import { useEffect } from 'react'
import { cut } from './Asking'
import type { Whispered } from './scene'
import type { Palette } from './theme'

/**
 * How long one of them stays up.
 *
 * Long enough to be caught out of the corner of an eye, short enough that the
 * next one is not standing in a queue behind it — she picks tools up faster
 * than anyone reads, and none of this is worth reading twice.
 */
export const WHISPERED_FOR = 2500

/** What each is marked with: a dot for a thing done, a cross for one that came
 * back wrong. Which it is, is in the words as well — the one that went through
 * is said in the past and the one that did not never gets to be — but the mark
 * is what carries it at a glance, which is all any of these get. */
const MARKED = { did: '·', failed: '×' } as const

/**
 * As much of it as the row has room for, on one row.
 *
 * The front is the part worth keeping: a command is named at its start. What
 * she was handed comes back as one line as well — a pattern with a break in it
 * would be two rows of something that is meant to be a glance — and it is cut
 * by the cells it is drawn in rather than by its length, or a Japanese filename
 * takes the row with it.
 */
const asMuchAs = (text: string, room: number) => cut(text.replace(/\s+/g, ' '), room)

/**
 * The words standing beside her: what she has just picked up and put down, one
 * to a row, newest at the bottom.
 *
 * They are the one thing on this screen nobody has to read. So they stand above
 * the box rather than over it — her line and the 地の文 are read, and the two of
 * them keep every row they are on. Where there is no room left for a whisper it
 * is simply off the top: a moment of nothing is what it was going to be anyway.
 * Each takes itself away after its own, and none of them is ever dismissed.
 */
export function Whispers({
  theme,
  whispers,
  width,
  onGone,
}: {
  whispers: Whispered[]
  /** The box's own width, which is as wide as one of these gets. */
  width: number
  /** One of them, once its moment is up. */
  onGone: (id: number) => void
  theme: Palette
}) {
  return (
    <box flexDirection="column" alignItems="flex-end" width={width} paddingX={2}>
      {whispers.map((one) => (
        <Whisper key={one.id} theme={theme} whisper={one} room={width - 6} onGone={onGone} />
      ))}
    </box>
  )
}

/** One of them, for as long as it is up. */
function Whisper({
  theme,
  whisper,
  room,
  onGone,
}: {
  whisper: Whispered
  /** How much of a row it has, the mark and the margins taken off. */
  room: number
  onGone: (id: number) => void
  theme: Palette
}) {
  // Its moment is its own: it starts when the row goes up and is over when the
  // row comes down. Kept by the row rather than by whatever put it there so
  // that one arriving while others are still up gets a whole moment rather
  // than what is left of the oldest one's — a busy turn would otherwise leave
  // the first word of it standing for as long as the turn lasted.
  useEffect(() => {
    const over = setTimeout(() => onGone(whisper.id), WHISPERED_FOR)
    return () => clearTimeout(over)
  }, [whisper.id])

  // One that came back wrong is written the way the box writes what she said,
  // rather than in her own colour: that one is hers and it is what her prompt
  // is drawn in. This is only a shade louder than the rest of them.
  return (
    <text fg={whisper.kind === 'failed' ? theme.foreground : theme.muted}>
      {`${MARKED[whisper.kind]} ${asMuchAs(whisper.text, room)}`}
    </text>
  )
}
