import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, expect, test } from 'bun:test'
import { briefFor, CAST, castIn, remember, remembered, spriteFor } from './cast'
import { KAOMOJI, type Expression } from './expressions'

/** One of them by name, so a test reads as being about her. */
const her = (id: string) => CAST.find((one) => one.id === id)!

const FACES = Object.keys(KAOMOJI) as Expression[]

/**
 * A house with girls in it, in whatever state the test wants them: written and
 * drawn, written and not drawn, drawn and not written, or drawn most of the way
 * and left there — which is the one the café package actually has three of.
 */
function houseOf(girls: { id: string; name?: string; faces?: number; written?: boolean }[]) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-cast-'))
  fs.mkdirSync(path.join(home, 'persona'), { recursive: true })
  for (const girl of girls) {
    if (girl.written !== false)
      fs.writeFileSync(
        path.join(home, 'persona', `${girl.id}.en.md`),
        `---\nname: ${girl.name ?? girl.id}\n---\n\nYou are ${girl.id}.\n`,
      )
    const drawn = path.join(home, 'art', girl.id, 'uniform')
    fs.mkdirSync(drawn, { recursive: true })
    for (const face of FACES.slice(0, girl.faces ?? FACES.length))
      fs.writeFileSync(path.join(drawn, `${face}.webp`), '')
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
    { id: 'kanae', faces: 13 },
  ])

  expect(castIn(home)).toEqual([{ id: 'momo', name: 'もも' }])
})

test('a girl missing one face is not in it either', () => {
  // Not a judgement call about how many is enough: the face she signs a reply
  // with is the one that gets loaded, and any of the 26 can be the one.
  const home = houseOf([{ id: 'momo', faces: FACES.length - 1 }])

  expect(castIn(home)).toEqual([])
})

test('each of them is called what her own file calls her', () => {
  expect(CAST.map((one) => one.id)).toEqual(['kotone', 'kurumi'])
  expect(CAST.map((one) => one.name)).toEqual(['ことね', 'くるみ'])
})

test('the ones in the house are drawn with every face they could sign with', () => {
  for (const who of CAST)
    for (const face of FACES) expect(fs.existsSync(spriteFor(who, face))).toBe(true)
})

test('each of them wears her own artwork', () => {
  expect(spriteFor(her('kotone'), 'happy')).not.toBe(spriteFor(her('kurumi'), 'happy'))
})

test('what a session is opened with is her own persona, and the cues they all sign with', () => {
  const brief = briefFor(her('kurumi'))

  expect(brief).toContain('くるみ')
  expect(brief).not.toContain('ことね')
  // The mood table is not hers — it is how any of them names the face she is
  // wearing, and the sprite layer is driven off it.
  expect(brief).toContain(KAOMOJI.happy)
})

test('the filing at the top of a persona file is not read out as an instruction', () => {
  const brief = briefFor(her('kotone'))

  expect(brief).toContain('ことね')
  expect(brief).not.toContain('personality:')
  expect(brief).not.toContain('outfits:')
})

test('two of them are not handed the same words', () => {
  expect(new Set(CAST.map(briefFor)).size).toBe(CAST.length)
})

/** Whoever the master last sent for, put back once these have had their way
 * with it — this is the same note the running window reads. */
const kept = remembered()
afterAll(() => remember(kept))

test('who was sent for is still who is on shift in the next window', () => {
  remember(her('kurumi'))

  expect(remembered()).toEqual(her('kurumi'))
})

test('a note naming nobody in the house leaves whoever opens the door standing', () => {
  remember({ id: 'nobody', name: 'nobody' })

  expect(remembered()).toEqual(her('kotone'))
})
