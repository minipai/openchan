import { useEffect, useState, type ReactNode } from 'react'
import type { Palette } from '../theme'

/** How far the strip above the frame holds its writing off the frame's edges. */
const OFF_THE_EDGE = 2

/** How far the two standing facts are held off what she is doing, and off each
 * other. Further from it than from each other, so that they read as a pair at
 * the end of the line rather than as the tail of a sentence about what she is
 * doing. */
const OFF_WHAT_SHE_IS_DOING = 3
const BETWEEN_THE_TWO = 2

/**
 * What the strip spends before a word is written on it, once what she is
 * thinking with is on the line: the padding either side, the air that holds
 * the pair off what she is doing, and the gap between the two of them.
 *
 * Whoever shares the line out needs it, and it is true of the strip rather
 * than of them: these are the same numbers the box is drawn with a few lines
 * below, so the two cannot drift apart.
 */
export const STRIP_SPENDS = OFF_THE_EDGE * 2 + OFF_WHAT_SHE_IS_DOING + BETWEEN_THE_TWO

/** What the screen says as her while a model is writing. Several, because one
 * line repeated on every turn stops reading as her — and the first of them is
 * whoever is standing there, not whoever was written into this file. */
const waiting = (her: string) => [`${her} is thinking…`, 'One moment~', 'Having a look…']

/**
 * The galgame dialogue panel — one frame holding the spoken line on top and
 * the input footer below a divider, laid out the way the window lays it out:
 * her name hanging off the top-left edge, what she is doing written above the
 * frame, the mood she signed off with in one bottom corner.
 */
export function DialogueBox({
  theme,
  name,
  line,
  folder,
  model,
  narration,
  mood,
  isWorking,
  corner,
  footer,
  width,
}: {
  /** Whoever is on shift, for the plate on the frame's edge. */
  name: string
  line: string
  /** The folder she is working in, short enough to read. It is on screen at all
   * times rather than behind the list that changes it: everything she picks up
   * happens in there, and a girl quietly working in the wrong folder is the one
   * mistake this window could make that nobody would notice. */
  folder: string
  /** What she is thinking with, short enough to read, and nothing at all until
   * she has said which model that is. It stands beside the folder for the same
   * reason the folder stands there: the two of them are what is true of this
   * session all the way through it, and which one is answering is the
   * difference between her thinking for free and on the master's money. */
  model: string
  /** 地の文 — what she is doing, while she is doing it. */
  narration: string | null
  mood: string | null
  isWorking: boolean
  /** The key worth knowing about from here, in the corner the window keeps for
   * them. Which one that is belongs to the keys, not to the box. */
  corner: string
  footer: ReactNode
  width: number
  theme: Palette
}) {
  const said = useCycled(isWorking, name)

  return (
    <box width={width} flexDirection="column">
      {/* Above the frame, where the window floats them: what she is doing right
          now on the left, gone the moment she starts speaking again, and on the
          right what does not go anywhere — what she is thinking with, and the
          folder she is thinking in. Those two sit together, and the folder sits
          outermost: it is the one of the three that never gives. */}
      <box height={1} paddingX={OFF_THE_EDGE} flexDirection="row" justifyContent="space-between">
        <text fg={theme.faint} flexShrink={1}>{narration ?? ''}</text>
        {/* One weight for the two of them: they are the same kind of fact, and
            the one that changes every few seconds is the one written faintly.

            The air in front is what holds the pair off what she is doing, so
            it is only there while there is a pair. On a terminal too narrow for
            a model's name at all, three columns is the difference between what
            she is doing having a word and having none, and the folder standing
            where it always stood is what that terminal had before. */}
        <box
          flexDirection="row"
          gap={BETWEEN_THE_TWO}
          marginLeft={model ? OFF_WHAT_SHE_IS_DOING : 0}
          flexShrink={0}
        >
          {model ? <text fg={theme.muted}>{model}</text> : null}
          <text fg={theme.muted}>{folder}</text>
        </box>
      </box>

      <box
        borderStyle="rounded"
        borderColor={theme.border}
        backgroundColor={theme.card}
        // Her name plate hangs off the top-left edge of the frame; the border's
        // own title is what a terminal has in place of a pill sitting on it.
        title={` ${name} `}
        titleColor={theme.foreground}
        titleAlignment="left"
        flexDirection="column"
      >
        <box paddingX={2} paddingTop={1} flexDirection="column">
          {/* Two lines' worth even when she has only said one: an emptied box
              reads as her having left the room. */}
          <box minHeight={2}>
            <text fg={theme.foreground} wrapMode="word">{line}</text>
          </box>

          {/* The corner belongs to the line rather than sitting over it: while
              she works, that she is still at it; when she stops, the mood she
              signed off with, as she wrote it. */}
          <box flexDirection="row" justifyContent="space-between" marginTop={1}>
            <text fg={theme.muted}>
              {isWorking ? said : (mood ?? '')}
            </text>
            <text fg={theme.faint}>{corner}</text>
          </box>
        </box>

        {/* The divider the input sits under. */}
        <box border={['top']} borderColor={theme.border} paddingX={2} flexDirection="column">
          {footer}
        </box>
      </box>
    </box>
  )
}

/** One of her waiting lines at a time, changed while she is still at it. */
function useCycled(running: boolean, her: string) {
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setAt((was) => was + 1), 2500)
    return () => clearInterval(tick)
  }, [running])
  const lines = waiting(her)
  return lines[at % lines.length]
}
