import { useEffect, useState, type ReactNode } from 'react'
import type { Palette } from './theme'
import { HER } from './cast'

/** What the screen says as her while a model is writing. Several, because one
 * line repeated on every turn stops reading as her. */
const WAITING = ['Kotone is thinking…', 'One moment~', 'Having a look…']

/**
 * The galgame dialogue panel — one frame holding the spoken line on top and
 * the input footer below a divider, laid out the way the window lays it out:
 * her name hanging off the top-left edge, what she is doing written above the
 * frame, the mood she signed off with in one bottom corner.
 */
export function DialogueBox({
  theme,
  line,
  narration,
  mood,
  isWorking,
  footer,
  width,
}: {
  line: string
  /** 地の文 — what she is doing, while she is doing it. */
  narration: string | null
  mood: string | null
  isWorking: boolean
  footer: ReactNode
  width: number
  theme: Palette
}) {
  const said = useCycled(isWorking)

  return (
    <box width={width} flexDirection="column">
      {/* Above the frame, where the window floats them: what she is doing right
          now, gone the moment she starts speaking again. */}
      <box height={1} paddingLeft={2}>
        <text fg={theme.faint}>{narration ?? ''}</text>
      </box>

      <box
        borderStyle="rounded"
        borderColor={theme.border}
        backgroundColor={theme.card}
        // Her name plate hangs off the top-left edge of the frame; the border's
        // own title is what a terminal has in place of a pill sitting on it.
        title={` ${HER} `}
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
            <text fg={theme.faint}>{isWorking ? 'ESC' : ''}</text>
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
function useCycled(running: boolean) {
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setAt((was) => was + 1), 2500)
    return () => clearInterval(tick)
  }, [running])
  return WAITING[at % WAITING.length]
}
