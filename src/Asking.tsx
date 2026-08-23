import { keyFor, shownAs } from './keys'
import type { Permission } from './scene'
import type { Palette } from './theme'

/**
 * Her question, along the bottom of the box: what she wants to use and what she
 * would use it for, with the keys that answer it.
 *
 * Two rows, because they are two different things — a sentence, and the keys
 * that answer it — and putting them on one row left the sentence whatever the
 * keys did not want, which at eighty columns was nothing at all. Opened, the
 * whole of what she would do is written out above them, and the question is
 * unchanged: y and n mean what they meant, open or shut.
 */
export function Asking({
  theme,
  permission,
  open,
  width,
  rows,
}: {
  theme: Palette
  permission: Permission
  /** Whether the whole of what she would do is being shown. */
  open: boolean
  /** The box's own width, borders and all. */
  width: number
  /** How many rows there are above the question before the box runs off the
   * top of the screen. */
  rows: number
}) {
  // What is left of the box once its border and padding are off it.
  const room = width - 6
  const [allow, refuse, details] = (['allow', 'refuse', 'details'] as const)
    .map(keyFor)
    .map((key) => `${shownAs(key.press)} ${key.says}`)
  const wants = permission.summary
    ? `She wants to use ${permission.toolName}: ${permission.summary}`
    : `She wants to use ${permission.toolName}`

  // Nothing is measured until it is asked for: a diff runs to thousands of
  // lines and the question sits there for as long as she is waiting.
  const lines = open && permission.detail !== null ? permission.detail.split('\n') : []
  // The count of what was left off takes a row of its own, so it comes out of
  // the room rather than being added on top of it.
  const over = lines.length > rows
  const shown = over ? lines.slice(0, rows - 1) : lines

  return (
    <box flexDirection="column">
      {lines.length > 0 && (
        <box flexDirection="column" paddingY={1}>
          {shown.map((line, at) => (
            <text key={at} fg={theme.muted}>{cut(line, room)}</text>
          ))}
          {over && <text fg={theme.faint}>{`… ${lines.length - shown.length} more`}</text>}
        </box>
      )}

      <text fg={theme.foreground}>{cut(wants, room)}</text>
      <box flexDirection="row" gap={2}>
        <text fg={theme.primary}>{allow}</text>
        <text fg={theme.muted}>{refuse}</text>
        {permission.detail !== null && <text fg={theme.faint}>{details}</text>}
      </box>
    </box>
  )
}

/**
 * Drawn two cells wide: the CJK blocks, kana, Hangul, the fullwidth forms and
 * the emoji. Measured by its length instead, a Chinese filename comes out half
 * the width it is drawn and takes the row it was cut to fit with it.
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|[\u{1f300}-\u{1faff}]|[\u{20000}-\u{3fffd}]/u

/** How many cells of the row a string takes up. */
export function columns(text: string): number {
  let wide = 0
  for (const glyph of text) wide += WIDE.test(glyph) ? 2 : 1
  return wide
}

/**
 * A line cut to the room there is for it, with the cut marked — one that ends
 * flush against the border reads as the whole of it, and the whole of it is
 * what she is being allowed. Cut by glyph rather than by index, so a pair that
 * makes one character is not left as half of one.
 */
export function cut(text: string, room: number): string {
  if (columns(text) <= room) return text
  let kept = ''
  let wide = 0
  for (const glyph of text) {
    const next = wide + (WIDE.test(glyph) ? 2 : 1)
    if (next > room - 1) break
    kept += glyph
    wide = next
  }
  return `${kept}…`
}
