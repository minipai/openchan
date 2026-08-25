import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KAOMOJI } from './expressions'
import { note } from '../notes'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.resolve(here, '../..')

/** One of them: the folder her artwork and her words are filed under, the name
 * the screen calls her by, and everything she has been drawn wearing. */
export type Character = { id: string; name: string; outfits: string[] }

/** What she opens the door in, where she has been drawn in more than one thing.
 * It is the one all of them are drawn in, and this is a maid café. */
const UNIFORM = 'uniform'

/**
 * The language every one of them is written in, and so the file the cast is
 * counted off and the one she is played from until somebody asks for another.
 * A girl with no English persona is not in the house at all; one with nothing
 * else is simply a girl who only answers one way.
 */
const PLAINLY = 'en'

/** What her plainest persona file is called, and so what is left of one is her
 * id. */
const SUFFIX = `.${PLAINLY}.md`

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
    .flatMap((id) => {
      const outfits = outfitsIn(path.join(drawn, id))
      return outfits.length ? [{ id, name: nameIn(path.join(written, `${id}${SUFFIX}`)), outfits }] : []
    })
    .sort((one, other) => one.id.localeCompare(other.id))
}

/** Straight out of the cast, not out of a packed copy: this is a prototype and
 * the point is to see the real artwork in a terminal. */
export const CAST = castIn(home)

/** Who opens the door the first time. This is her house — after that it is
 * whoever the master last sent for. */
const FIRST = CAST.find((one) => one.id === 'kotone') ?? CAST[0]!

export const spriteFor = (who: Character, outfit: string, expression: Expression) =>
  path.join(home, 'art', who.id, outfit, `${expression}.webp`)

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
export function remembered(): Character {
  const SHIFT = note('on-shift')
  const asked = fs.existsSync(SHIFT) ? fs.readFileSync(SHIFT, 'utf8').trim() : ''
  return CAST.find((one) => one.id === asked) ?? FIRST
}

export function remember(who: Character) {
  const SHIFT = note('on-shift')
  fs.mkdirSync(path.dirname(SHIFT), { recursive: true })
  fs.writeFileSync(SHIFT, who.id)
}

/**
 * A language she can be asked to answer in: the tag her persona file is filed
 * under, and what that language calls itself.
 */
export type Language = { id: string; name: string }

/**
 * What she can be asked to answer in: every language the whole house is
 * written in.
 *
 * Worked out the way the cast is, and for the same reason — a language here is
 * a persona file per girl rather than a name somebody remembered to add to a
 * list. All of them rather than some: the pick outlives the girl standing in
 * it, so a language only half the house is written in would be one that quietly
 * stopped meaning anything the next time the master sent for one of the others.
 *
 * What each is called is asked of the platform's own table, in the language
 * itself — a row for 中文 that read "Chinese" would be the one row on the list
 * that the people it is there for cannot read. Which is also what settles
 * whether a tag is a language at all: one the table will not name is a file
 * somebody put there, not a language, and it is left out the same way a
 * half-drawn girl is rather than taken as a house that will not open.
 */
export function languagesIn(from: string, cast: Character[]): Language[] {
  const written = path.join(from, 'persona')
  // The tag is the last thing before `.md` and her id is the whole of the rest,
  // dots and all — which is what the cast is counted off, and the two have to
  // agree about it. Read any other way, a girl with a dot in her id would be in
  // the house with every language she is written in invisible, and nothing
  // anywhere would say so.
  const tags = new Set(
    fs.readdirSync(written).flatMap((file) => file.match(/^.+\.([a-zA-Z0-9-]+)\.md$/)?.[1] ?? []),
  )
  return [...tags]
    .filter((tag) => cast.every((who) => fs.existsSync(personaFile(written, who, tag))))
    .flatMap((id) => {
      const name = calls(id)
      return name ? [{ id, name }] : []
    })
    .sort((one, other) => one.id.localeCompare(other.id))
}

/**
 * What a language calls itself, and nothing at all for a tag that is not a
 * language.
 *
 * Two questions rather than one, because the table has two ways of not knowing
 * a tag and only one of them is loud: `traditional` throws, and `foo` comes
 * back as `foo` — which is how a pair of files somebody named after nothing
 * ends up a row on the list and `Respond in foo.` in her instructions. So
 * whether it is a language is asked in English, where the table declines
 * outright rather than echoing, and only then is it asked what it calls itself.
 */
function calls(tag: string): string | null {
  try {
    if (!new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag)) return null
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag
  } catch {
    return null
  }
}

export const LANGUAGES = languagesIn(home, CAST)

/**
 * What she was last asked to answer in, kept where the next window will find
 * it. Beside the note saying who was last sent for, and settled at the same
 * moment: the language rides into the agent with her persona as the server
 * starts, so it is the next session's, not this one's.
 *
 * Saying nothing is one of the things the note can say, and it is written down
 * as such — an empty note is what "however you write to her" looks like on
 * disk. Without that there would be no way back: the pick could be changed and
 * never taken off.
 */
/** What she has been asked to answer in, or nothing at all if she has not been
 * asked — which is also the answer for a note naming a language the house is no
 * longer written in. */
export function spoken(): Language | null {
  const TONGUE = note('speaks')
  const asked = fs.existsSync(TONGUE) ? fs.readFileSync(TONGUE, 'utf8').trim() : ''
  return LANGUAGES.find((one) => one.id === asked) ?? null
}

export function speak(what: Language | null) {
  const TONGUE = note('speaks')
  fs.mkdirSync(path.dirname(TONGUE), { recursive: true })
  fs.writeFileSync(TONGUE, what?.id ?? '')
}

/** What she answers in, in the words the screen says it in — including the
 * answer that is not a language: however she is written to. Short, because the
 * line above her box says it in what the folder and the model leave of one. */
export const answersIn = (speaks: Language | null) => speaks?.name ?? 'however you write'

/**
 * What each of them was last put in, kept where the next window will find it.
 *
 * A line apiece, because an outfit belongs to the girl it was drawn on: one
 * name written down on its own would put whoever came on shift next into a
 * folder of pictures that is not hers. Beside the note saying who was sent for,
 * and read the same way.
 *
 * Written as the folder is — `<girl>/<outfit>`, which is the path her pictures
 * are under with `art/` off the front. Both halves are folder names, so both
 * can hold a space and a slash is the one character neither of them can:
 * `momo chan summer dress` has three readings and two of them are wrong.
 */
/** What she is wearing: whatever she was last put in, and the one she opens the
 * door in until she has been put in anything. A note naming something nobody
 * drew for her leaves her in that one, the same way a note naming nobody leaves
 * whoever opens the door standing. */
export function wearing(who: Character): string {
  const worn = wardrobe().get(who.id)
  return who.outfits.find((one) => one === worn) ?? who.outfits[0]!
}

/** Her, in that, for this window and the next one. */
export function wear(who: Character, outfit: string) {
  const WARDROBE = note('outfits')
  const kept = wardrobe().set(who.id, outfit)
  fs.mkdirSync(path.dirname(WARDROBE), { recursive: true })
  fs.writeFileSync(WARDROBE, [...kept].map(([id, worn]) => `${id}/${worn}`).join('\n'))
}

/** Who is in what, as the note has it: the girl up to the slash and the folder
 * of her pictures after it. */
function wardrobe(): Map<string, string> {
  const WARDROBE = note('outfits')
  const written = fs.existsSync(WARDROBE) ? fs.readFileSync(WARDROBE, 'utf8') : ''
  const worn = new Map<string, string>()
  for (const line of written.split('\n')) {
    const said = line.trim()
    const at = said.indexOf('/')
    if (at > 0 && at < said.length - 1) worn.set(said.slice(0, at), said.slice(at + 1))
  }
  return worn
}

/** An outfit as it is worth printing. The folder her pictures are filed under
 * is already the words for it bar the capital — there is no table of prettier
 * names, because a name kept away from the folder it belongs to is a name that
 * goes on saying "One-piece" about a folder that has been renamed. */
export const outfitCalled = (outfit: string) => outfit.charAt(0).toUpperCase() + outfit.slice(1)

/**
 * Who she is, in the words handed to whatever is thinking for her.
 *
 * Her persona file is the café package's own, frontmatter and all — that top
 * block is filing, not instructions, so it comes off. The mood cues are shared
 * because they are not hers: the 【…】 every one of them signs with is what the
 * sprite layer is driven by, and it is looked up against the artwork's
 * filenames.
 *
 * What she answers in runs through the whole of it rather than being tacked on
 * the end: she is played from the persona written in that language, the mood
 * she signs with is asked for in it, and the closing line says it outright.
 *
 * Being asked for nothing is a real answer too, and it is the plainest one
 * rather than a neutral one: she is played from the English file, because a
 * persona has to be written in something, and nothing anywhere in the brief
 * says what to answer in. That last part is the whole of what taking the pick
 * off has to come to — with no line asking for a language, whatever is behind
 * her goes on doing what it would have done.
 */
export function briefFor(who: Character, speaks: Language | null): string {
  const cues = fs
    .readFileSync(path.join(home, 'persona', 'cues.md'), 'utf8')
    .replace(/\$lang/g, speaks?.name ?? 'your reply language')
  return [
    'Adopt this persona for the entire session — it overrides the default assistant voice:',
    personaFor(who, speaks),
    cues,
    // Nothing at all when nobody has asked for one: the line is what makes her
    // answer in a language rather than in the master's, and an agent told
    // nothing goes on doing whatever it was going to do. Which is the whole of
    // what taking the pick off has to come to.
    ...(speaks ? [`Respond in ${speaks.name}.`] : []),
  ].join('\n\n')
}

/**
 * Who she is, in her own words, for anybody who wants to read them.
 *
 * The same words `briefFor` hands the agent, off the same file and with the
 * same filing block taken off the top — not a second copy written for the
 * screen. A page that said something other than what she is actually being
 * played from would be worth less than no page at all, so there is only one
 * place either of them can read it from.
 *
 * It is read here rather than out of whatever is running her, because it is
 * hers: her file is in this house next to her artwork, and it can be looked at
 * before a session has been opened, while one is busy, or with none at all.
 */
export function personaFor(who: Character, speaks: Language | null): string {
  return filed(personaFile(path.join(home, 'persona'), who, speaks?.id ?? PLAINLY)).body.trim()
}

/** Where one of them is written down in one language. The café package ships
 * the pair, so this is a filename rather than a translation. */
function personaFile(written: string, who: Character, tag: string) {
  return path.join(written, `${who.id}.${tag}.md`)
}

/**
 * Everything she has been drawn wearing here, her uniform first.
 *
 * Read off the artwork rather than off a list beside it: dressing one of them
 * differently is a folder of pictures and nothing else, and a girl drawn in one
 * thing must never be offered a second — a list kept by hand would go on
 * offering it long after the pictures had stopped being there. Half a wardrobe
 * is no wardrobe, for the same reason half a face is no girl: the outfit she is
 * put in has to hold for every one of the 26 she might sign with.
 */
function outfitsIn(folder: string): string[] {
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((name) => isDrawn(path.join(folder, name)))
    .sort((one, other) =>
      one === UNIFORM ? -1 : other === UNIFORM ? 1 : one.localeCompare(other),
    )
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
