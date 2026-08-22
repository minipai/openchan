import { useEffect, useState } from 'react'
import { NativeImage } from '@opentui/core'
import { useRenderer, useTerminalDimensions } from '@opentui/react'
import { ARTWORK, SPRITE_SHARE, spriteFor, type Expression } from './cast'
import { useColourBehindHer } from './behind'

/** Decoded artwork, kept between faces — she wears the same handful all
 * session and decoding one is the slow part. */
const artwork = new Map<string, NativeImage>()
/** The same artwork cut down to what the scene has room for. Keyed by the cut
 * as well as the face, so a resized terminal simply asks for a new one. */
const framed = new Map<string, NativeImage>()

/**
 * Where she stands, and she stays there: one framing, centred, her head at the
 * top edge and the dialogue box over her lower body.
 *
 * A terminal will not let her hang off the bottom the way the window does —
 * anything drawn past the last row is clipped away and what is left gets
 * shrunk to fit. So she is cut instead of overflowed: the artwork is trimmed
 * to exactly the shape of the scene, and what is left of her runs behind the
 * dialogue box and out through the strip below it.
 */
export function SpriteLayer({
  expression,
  columns,
  rows,
  behind: asked,
  blocks,
}: {
  expression: Expression
  /** How wide she stands, in cells. */
  columns: number
  /** The whole scene, top to bottom, in cells. */
  rows: number
  /** What the terminal said it is painted, when it answered. */
  behind: string | undefined
  /** Half-blocks even where real pixels are on offer. */
  blocks: boolean
}) {
  const { width } = useTerminalDimensions()
  const cell = useCellShape()
  const behind = useColourBehindHer(asked, blocks)
  const [shown, setShown] = useState<NativeImage | null>(null)

  // How much of her the scene has room for, measured in the artwork's own
  // pixels: the space above the box, turned back into the shape it would be if
  // cells were square.
  const cut = Math.min(
    ARTWORK.height,
    Math.max(1, Math.round((ARTWORK.width * (rows / columns)) / cell)),
  )

  useEffect(() => {
    if (columns <= 0 || rows <= 0) return
    let current = true
    const file = spriteFor(expression)
    const key = `${file}@${cut}`

    const ready = framed.get(key)
    if (ready) {
      setShown(ready)
      return
    }

    void (async () => {
      let whole = artwork.get(file)
      if (!whole) {
        whole = await NativeImage.load(file)
        artwork.set(file, whole)
      }
      // Trimmed from the top, so her head keeps the top edge and it is her hem
      // that goes — the same crop the window makes by hanging her off the
      // bottom of itself.
      const cropped = whole.extract({ left: 0, top: 0, width: ARTWORK.width, height: cut })
      framed.set(key, cropped)
      if (current) setShown(cropped)
    })().catch((error) => console.error('her artwork did not load:', error))

    return () => {
      current = false
    }
  }, [expression, cut, columns, rows])

  if (!shown) return null

  return (
    // The frame she stands in carries the colour her transparent pixels blend
    // into, which is nothing at all on a terminal that draws real pictures —
    // there she stands on the master's own background. See behind.ts.
    <box
      position="absolute"
      top={0}
      left={Math.round((width - columns) / 2)}
      width={columns}
      height={rows}
      zIndex={2}
      backgroundColor={behind}
    >
      <image
        width={columns}
        height={rows}
        source={shown}
        // Kitty keeps her alpha, so she stands on whatever the terminal's own
        // background is — no plate behind her, the same as the window. Asked
        // for cells, she is drawn out of half-block characters instead, on
        // terminals that would have taken the picture whole.
        protocol={blocks ? 'blocks' : 'auto'}
        // Filling rather than fitting: the cut above already matches this
        // shape, and rounding it to whole cells must not be allowed to open a
        // gap over her head.
        fit="cover"
      />
    </box>
  )
}

/**
 * How wide a cell is against how tall it is. Terminals answer with the size of
 * the whole grid in pixels; the ones that do not leave the usual 1:2.
 */
function useCellShape() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const pixels = renderer.resolution
  if (!pixels || !width || !height) return 0.5
  return pixels.width / width / (pixels.height / height)
}

export const spriteColumns = (width: number) => Math.max(8, Math.round(width * SPRITE_SHARE))
