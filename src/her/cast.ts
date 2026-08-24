import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KAOMOJI } from './expressions'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.resolve(here, '../..')

/** One of them: the folder her artwork and her words are filed under, and the
 * name the screen calls her by. */
export type Character = { id: string; name: string }

/** The one outfit each of them is packed with here. Which one she is wearing is
 * a choice of its own, and not this one. */
const OUTFIT = 'uniform'

/** What a persona file is called, and so what is left of one is her id. */
const SUFFIX = '.en.md'

/** The 26 faces they have been drawn with: the names are also the sprite
 * filenames, so a list that drifts silently stops them changing face. */
export type { Expression } from './expressions'
import type { Expression } from './expressions'

/**
 * Everyone the window can put on screen: whoever is both written and drawn.
 *
 * Nobody is named here on purpose — the cast is whatever has a persona file and
 * every face to go with it, so bringing another one in is a folder and a file
 * rather than a list to remember to add her to. Taking the whole set of faces
 * literally is what keeps a half-drawn girl out: she would go mute mid-sentence
 * the first time she signed off with one nobody drew, and the only sign of it
 * would be an error written over the top of her.
 *
 * The folder is an argument so that the rule can be checked against girls who
 * are missing something, which the ones checked in here are not.
 */
export function castIn(from: string): Character[] {
  const written = path.join(from, 'persona')
  const drawn = path.join(from, 'art')
  return fs
    .readdirSync(written)
    .filter((file) => file.endsWith(SUFFIX))
    .map((file) => file.slice(0, -SUFFIX.length))
    .filter((id) => isDrawn(path.join(drawn, id, OUTFIT)))
    .map((id) => ({ id, name: nameIn(path.join(written, `${id}${SUFFIX}`)) }))
    .sort((one, other) => one.id.localeCompare(other.id))
}

/** Straight out of the cast, not out of a packed copy: this is a prototype and
 * the point is to see the real artwork in a terminal. */
export const CAST = castIn(home)

/** Who opens the door the first time. This is her house — after that it is
 * whoever the master last sent for. */
const FIRST = CAST.find((one) => one.id === 'kotone') ?? CAST[0]!

export const spriteFor = (who: Character, expression: Expression) =>
  path.join(home, 'art', who.id, OUTFIT, `${expression}.webp`)

/** Every face is drawn at this size. */
export const ARTWORK = { width: 512, height: 1280 } as const

/** How wide she stands, as a share of the scene: 512 of the window's 960. */
export const SPRITE_SHARE = 0.53

/**
 * Who was last sent for, kept where the next window will find her.
 *
 * A girl's persona goes into the agent as its server starts, so one asked for
 * mid-conversation cannot walk into that session — she takes the next one, and
 * the next one is usually the next time the master starts her. Forgetting the
 * pick in between would make the whole list a thing that only ever works when
 * nothing has been said yet.
 */
const SHIFT = path.join(os.homedir(), '.openchan', 'on-shift')

export function remembered(): Character {
  const asked = fs.existsSync(SHIFT) ? fs.readFileSync(SHIFT, 'utf8').trim() : ''
  return CAST.find((one) => one.id === asked) ?? FIRST
}

export function remember(who: Character) {
  fs.mkdirSync(path.dirname(SHIFT), { recursive: true })
  fs.writeFileSync(SHIFT, who.id)
}

/** The one language they have, until the screen has more than one. Their
 * persona files and every word on screen are in it. */
const SPEAKS = 'English'

/**
 * Who she is, in the words handed to whatever is thinking for her.
 *
 * Her persona file is the café package's own, frontmatter and all — that top
 * block is filing, not instructions, so it comes off. The mood cues are shared
 * because they are not hers: the 【…】 every one of them signs with is what the
 * sprite layer is driven by, and it is looked up against the artwork's
 * filenames.
 */
export function briefFor(who: Character): string {
  const persona = path.join(home, 'persona')
  const cues = fs.readFileSync(path.join(persona, 'cues.md'), 'utf8').replace(/\$lang/g, SPEAKS)
  return [
    'Adopt this persona for the entire session — it overrides the default assistant voice:',
    filed(path.join(persona, `${who.id}${SUFFIX}`)).body,
    cues,
    `Respond in ${SPEAKS}.`,
  ].join('\n\n')
}

/** Whether every face she could sign a reply with has been drawn for her. */
function isDrawn(folder: string) {
  return Object.keys(KAOMOJI).every((face) => fs.existsSync(path.join(folder, `${face}.webp`)))
}

/** A persona file, split into what the café package files it under and the
 * instructions underneath. */
function filed(file: string) {
  const raw = fs.readFileSync(file, 'utf8')
  const head = raw.match(/^---\n([\s\S]*?)\n---\n/)
  return { head: head?.[1] ?? '', body: head ? raw.slice(head[0].length) : raw }
}

/** What she is called, off the top of her own file rather than out of a table
 * kept next to it. */
function nameIn(file: string) {
  return filed(file).head.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? path.basename(file, SUFFIX)
}
