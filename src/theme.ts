export type Palette = {
  card: string
  border: string
  foreground: string
  muted: string
  faint: string
  primary: string
}

/**
 * The desktop window's dark palette, flattened to hex. What she falls back to
 * when the terminal will not say what colour it is painted.
 */
const DARK: Palette = {
  card: '#2e2e2e',
  border: '#4a4a4a',
  foreground: '#fafafa',
  muted: '#a1a1a1',
  faint: '#6b6b6b',
  primary: '#a24a55',
} as const

/** Her own colour, the one thing that does not follow the terminal. */
const HERS = DARK.primary

/**
 * Her box, coloured against the terminal it is standing on.
 *
 * The box takes the terminal's own colour, so it is a frame drawn around her
 * words rather than a panel laid over the screen — the terminal is already
 * being asked what colour it is painted, to keep her out of a black slab. Only
 * the border is lifted off that, enough to be a line. The writing goes
 * whichever way round stays readable: a light terminal gets dark text rather
 * than the window's white.
 */
export function paletteOver(background: string | undefined): Palette {
  const painted = readHex(background)
  if (!painted) return DARK

  // Rec. 601, which is close enough to decide light from dark.
  const bright = (0.299 * painted[0] + 0.587 * painted[1] + 0.114 * painted[2]) / 255
  const dark = bright < 0.5
  const toward = dark ? 255 : 0
  const lifted = (amount: number) =>
    '#' +
    painted
      .map((channel) => Math.round(channel + (toward - channel) * amount).toString(16).padStart(2, '0'))
      .join('')

  return {
    card: lifted(0),
    border: lifted(0.28),
    foreground: dark ? DARK.foreground : '#141414',
    muted: lifted(0.55),
    faint: lifted(0.38),
    primary: HERS,
  }
}

const readHex = (colour: string | undefined) => {
  const found = colour && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  return found ? [parseInt(found[1], 16), parseInt(found[2], 16), parseInt(found[3], 16)] : null
}
