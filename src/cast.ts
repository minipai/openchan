import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Straight out of the cast, not out of a packed copy: this is a prototype and
 * the point is to see the real artwork in a terminal. */
const EXPRESSIONS = path.resolve(here, '../art/kotone/uniform')

export const HER = 'ことね'

/** The 26 faces she has been drawn with: the names are also the sprite
 * filenames, so a list that drifts silently stops her changing face. */
export type { Expression } from './expressions'
import type { Expression } from './expressions'

export const spriteFor = (expression: Expression) => path.join(EXPRESSIONS, `${expression}.webp`)

/** Every face is drawn at this size. */
export const ARTWORK = { width: 512, height: 1280 } as const

/** How wide she stands, as a share of the scene: 512 of the window's 960. */
export const SPRITE_SHARE = 0.53
