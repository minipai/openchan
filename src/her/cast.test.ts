import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, expect } from 'bun:test'
import {
  answersIn,
  briefFor,
  CAST,
  castIn,
  LANGUAGES,
  languagesIn,
  outfitCalled,
  personaFor,
  remember,
  remembered,
  speak,
  spoken,
  spriteFor,
  wear,
  wearing,
} from './cast'
import { KAOMOJI, type Expression } from './expressions'
import { testNotes } from '../testNotes'

const { file: note, test } = testNotes()

/** One of them by name, so a test reads as being about her. */
const her = (id: string) => CAST.find((one) => one.id === id)!

const FACES = Object.keys(KAOMOJI) as Expression[]

/**
 * A house with girls in it, in whatever state the test wants them: written and
 * drawn, written and not drawn, drawn and not written, or drawn most of the way
 * and left there — which is the one the café package actually has three of.
 *
 * What each is drawn in is an outfit and how many of the 26 faces were drawn for
 * it, because those are the two ways artwork comes up short: a girl nobody
 * finished, and an outfit nobody finished her in.
 */
function houseOf(
  girls: {
    id: string
    name?: string
    drawn?: Record<string, number>
    written?: boolean
    alsoIn?: string[]
  }[],
) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-cast-'))
  fs.mkdirSync(path.join(home, 'persona'), { recursive: true })
  for (const girl of girls) {
    if (girl.written !== false)
      for (const tag of ['en', ...(girl.alsoIn ?? [])])
        fs.writeFileSync(
          path.join(home, 'persona', `${girl.id}.${tag}.md`),
          `---\nname: ${girl.name ?? girl.id}\n---\n\nYou are ${girl.id}, in ${tag}.\n`,
        )
    for (const [outfit, many] of Object.entries(girl.drawn ?? { uniform: FACES.length })) {
      const drawn = path.join(home, 'art', girl.id, outfit)
      fs.mkdirSync(drawn, { recursive: true })
      for (const face of FACES.slice(0, many)) fs.writeFileSync(path.join(drawn, `${face}.webp`), '')
    }
  }
  return home
}

test('the cast is whoever is both written and drawn', () => {
  const home = houseOf([
    { id: 'momo', name: 'もも' },
    // Drawn, and nobody wrote her a word to say.
    { id: 'nao', written: false },
    // Written, and drawn for half the faces she signs off with — the three the
    // café package has are exactly this.
    { id: 'kanae', drawn: { uniform: 13 } },
  ])

  expect(castIn(home)).toEqual([{ id: 'momo', name: 'もも', outfits: ['uniform'] }])
})

test('a girl missing one face is not in it either', () => {
  // Not a judgement call about how many is enough: the face she signs a reply
  // with is the one that gets loaded, and any of the 26 can be the one.
  const home = houseOf([{ id: 'momo', drawn: { uniform: FACES.length - 1 } }])

  expect(castIn(home)).toEqual([])
})

test('what she can be put in is whatever she was drawn in, her uniform first', () => {
  const home = houseOf([{ id: 'momo', drawn: { 'one-piece': FACES.length, uniform: FACES.length } }])

  // Her uniform ahead of the rest whatever order the folders come back in: it
  // is the one she opens the door in, and the list opens on what she has on.
  expect(castIn(home)[0]!.outfits).toEqual(['uniform', 'one-piece'])
})

test('an outfit she is only half drawn in is not one she can be put in', () => {
  // The same rule that keeps a half-drawn girl out of the cast, one level in:
  // she would go mute the first time she signed off with a face nobody drew
  // her that way, and it is the outfit rather than the girl that is missing.
  const home = houseOf([{ id: 'momo', drawn: { uniform: FACES.length, 'one-piece': 13 } }])

  expect(castIn(home)[0]!.outfits).toEqual(['uniform'])
})

test('a girl drawn in something other than a uniform is still one of them', () => {
  const home = houseOf([{ id: 'momo', drawn: { 'one-piece': FACES.length } }])

  expect(castIn(home)[0]!.outfits).toEqual(['one-piece'])
})

test('an outfit is whatever the folder of pictures is called, spaces and all', () => {
  const home = houseOf([{ id: 'momo', drawn: { uniform: FACES.length, 'summer dress': FACES.length } }])

  expect(castIn(home)[0]!.outfits).toEqual(['uniform', 'summer dress'])
})

test('each of them is called what her own file calls her', () => {
  expect(CAST.map((one) => one.id)).toEqual(['kotone', 'kurumi'])
  expect(CAST.map((one) => one.name)).toEqual(['ことね', 'くるみ'])
})

test('the ones in the house are drawn with every face they could sign with', () => {
  for (const who of CAST)
    for (const outfit of who.outfits)
      for (const face of FACES) expect(fs.existsSync(spriteFor(who, outfit, face))).toBe(true)
})

test('the two of them in the house have each been drawn in two things', () => {
  expect(CAST.map((one) => one.outfits)).toEqual([
    ['uniform', 'one-piece'],
    ['uniform', 'one-piece'],
  ])
})

test('each of them wears her own artwork', () => {
  expect(spriteFor(her('kotone'), 'uniform', 'happy')).not.toBe(
    spriteFor(her('kurumi'), 'uniform', 'happy'),
  )
})

test('what she is wearing is which folder of her pictures is loaded', () => {
  const who = her('kotone')

  expect(spriteFor(who, 'one-piece', 'happy')).not.toBe(spriteFor(who, 'uniform', 'happy'))
  expect(spriteFor(who, 'one-piece', 'happy').endsWith(path.join('one-piece', 'happy.webp'))).toBe(true)
})

test('an outfit is printed as the folder it is filed under, bar the capital', () => {
  expect(outfitCalled('uniform')).toBe('Uniform')
  expect(outfitCalled('one-piece')).toBe('One-piece')
})

test('what a session is opened with is her own persona, and the cues they all sign with', () => {
  const brief = briefFor(her('kurumi'), null)

  expect(brief).toContain('くるみ')
  expect(brief).not.toContain('ことね')
  // The mood table is not hers — it is how any of them names the face she is
  // wearing, and the sprite layer is driven off it.
  expect(brief).toContain(KAOMOJI.happy)
})

test('the filing at the top of a persona file is not read out as an instruction', () => {
  const brief = briefFor(her('kotone'), null)

  expect(brief).toContain('ことね')
  expect(brief).not.toContain('personality:')
  expect(brief).not.toContain('outfits:')
})

test('her own words are what she is being played from, and nothing but', () => {
  const persona = personaFor(her('kotone'), null)

  // Everything her file says under the filing block, down to the last line of
  // it: read here off the file itself rather than off what the code did with
  // it, so that a persona quietly cut short would show up as one.
  const raw = fs.readFileSync(path.resolve(import.meta.dir, '../../persona/kotone.en.md'), 'utf8')
  expect(raw.trimEnd().endsWith(persona)).toBe(true)
  expect(raw.slice(raw.indexOf(persona)).trim()).toBe(persona)
  // And the same words the session was opened with: the page and the brief
  // cannot drift apart, because there is one place either of them reads.
  expect(briefFor(her('kotone'), null)).toContain(persona)
  // Filed at the top and instructions underneath: the filing is not writing of
  // hers and is not on the page.
  expect(persona).not.toContain('personality:')
  expect(persona).not.toContain('outfits:')
  // And the cues every one of them signs with are not hers either — they are
  // handed to the agent, not written about her.
  expect(persona).not.toContain(KAOMOJI.happy)
})

test('two of them are not handed the same words', () => {
  expect(new Set(CAST.map((one) => briefFor(one, null))).size).toBe(CAST.length)
})

test('who was sent for is still who is on shift in the next window', () => {
  remember(her('kurumi'))

  expect(remembered()).toEqual(her('kurumi'))
})

test('a note naming nobody in the house leaves whoever opens the door standing', () => {
  remember({ id: 'nobody', name: 'nobody', outfits: [] })

  expect(remembered()).toEqual(her('kotone'))
})

const CHINESE = LANGUAGES.find((one) => one.id === 'zh-Hant')!

test('what she can be asked to answer in is what the whole house is written in', () => {
  // Both of them written in it, so it is on the list; one of them, so it is
  // not — the pick outlives whoever is standing in it.
  const home = houseOf([
    { id: 'momo', alsoIn: ['zh-Hant', 'ja'] },
    { id: 'nao', alsoIn: ['zh-Hant'] },
  ])

  expect(languagesIn(home, castIn(home)).map((one) => one.id)).toEqual(['en', 'zh-Hant'])
})

test('a pair of files named after something that is not a language is not one', () => {
  // Neither of the two ways the platform has of not knowing a tag makes it a
  // language: `traditional` throws — and a house that refuses to open over a
  // filename somebody typed would be the worse of the two failures — while
  // `foo` is handed straight back, which is how it would otherwise become a row
  // on the list and `Respond in foo.` in her instructions.
  const home = houseOf([
    { id: 'momo', alsoIn: ['traditional', 'en-', 'foo'] },
    { id: 'nao', alsoIn: ['traditional', 'en-', 'foo'] },
  ])

  expect(languagesIn(home, castIn(home)).map((one) => one.id)).toEqual(['en'])
})

test('a dot in her id does not hide the languages she is written in', () => {
  // The cast is counted off whatever is left when `.en.md` comes off the end,
  // so a dotted id is a girl like any other — and the language list reads the
  // same filenames. Two readers disagreeing about what an id may look like is a
  // house where she stands there with her translations quietly missing.
  const home = houseOf([{ id: 'momo.v2', alsoIn: ['zh-Hant'] }])

  expect(castIn(home).map((one) => one.id)).toEqual(['momo.v2'])
  expect(languagesIn(home, castIn(home)).map((one) => one.id)).toEqual(['en', 'zh-Hant'])
})

test('each language is written down as that language calls itself', () => {
  expect(LANGUAGES.map((one) => one.name)).toEqual(['English', '繁體中文'])
})

test('what she was asked to answer in is still it in the next window', () => {
  speak(CHINESE)

  expect(spoken()).toEqual(CHINESE)
})

test('taking the pick off leaves her asked for nothing, not asked for English', () => {
  speak(CHINESE)
  speak(null)

  expect(spoken()).toBe(null)
  // And it is written down as such rather than left to the note's absence: the
  // note is there, and what it says is nothing.
  expect(fs.existsSync(note('speaks'))).toBe(true)
})

test('a note naming a language the house is not written in asks her for nothing', () => {
  // Through `speak` first, so the note is where the note goes whether or not
  // this machine has ever opened her.
  speak(CHINESE)
  fs.writeFileSync(note('speaks'), 'kl')

  expect(spoken()).toBe(null)
})

test('asked for a language, she is played from that persona and told to answer in it', () => {
  const brief = briefFor(her('kurumi'), CHINESE)

  expect(brief).toContain('Respond in 繁體中文.')
  // Her own words in that language, off the file rather than translated here.
  expect(brief).toContain(personaFor(her('kurumi'), CHINESE))
  expect(brief).toContain('軟萌妹妹系女僕風')
  expect(brief).not.toContain('Soft, saccharine little-maid style')
  // And the face she signs with is asked for in it too — the mood beside her
  // line is read by whoever is watching, not by the sprite layer.
  expect(brief).toContain('one short phrase in 繁體中文')
})

test('asked for nothing, she is told nothing about language at all', () => {
  const brief = briefFor(her('kurumi'), null)

  expect(brief).not.toContain('Respond in')
  // Which is the whole of what returning to the default has to come to: no line
  // of the brief says what to answer in, so whatever is behind her goes on
  // doing what it would have done.
  expect(brief).not.toContain('繁體中文')
  expect(brief).toContain(personaFor(her('kurumi'), null))
})

test('what she answers in is sayable even when it is nothing in particular', () => {
  expect(answersIn(CHINESE)).toBe('繁體中文')
  expect(answersIn(null)).toBe('however you write')
})

test('she opens the door in her uniform, with nothing written down', () => {
  fs.writeFileSync(note('outfits'), '')

  expect(wearing(her('kotone'))).toBe('uniform')
})

test('what she was put in is what she is wearing in the next window', () => {
  wear(her('kotone'), 'one-piece')

  expect(wearing(her('kotone'))).toBe('one-piece')
})

test("an outfit is one girl's own, and not what the next one is put in", () => {
  wear(her('kotone'), 'one-piece')
  wear(her('kurumi'), 'uniform')

  // Two lines in one note rather than one name for the house: `one-piece` on
  // kotone is not the folder of pictures kurumi's name would find, and it is
  // only chance that it is a folder either of them has.
  expect(wearing(her('kotone'))).toBe('one-piece')
  expect(wearing(her('kurumi'))).toBe('uniform')
})

test('a note naming something nobody drew for her leaves her in her uniform', () => {
  wear(her('kotone'), 'swimsuit')

  expect(wearing(her('kotone'))).toBe('uniform')
})

test('a name with a space in it comes back off the note whole, on either side', () => {
  // Both halves of a line are folder names and either can hold a space — her id
  // is a persona filename with the tag off it, the outfit is the folder her
  // pictures are in. Read a word at a time, `momo chan/summer dress` has three
  // readings and two of them put her silently back in her uniform every time
  // the window opens.
  // Two of them, and her uniform first: with one the note could be read every
  // wrong way there is and she would still come back in it, because falling
  // back to the only thing she owns is the same answer as reading the note.
  const momo = { id: 'momo chan', name: 'もも', outfits: ['uniform', 'summer dress'] }
  wear(momo, 'summer dress')

  expect(wearing(momo)).toBe('summer dress')
  // And she is still her own line, next to whoever else is written down.
  expect(wearing(her('kotone'))).toBe('uniform')
})
