import { useMemo, useRef } from 'react'
import type { Choice } from './Picker'
import { folderRows, troubleWith, TYPE_A_PATH } from '../../between/folder'
import type { Scene } from '../../between/brain'
import { answersIn, LANGUAGES, outfitCalled, type Character, type Language } from '../../her/cast'

/**
 * The row on the list of conversations that is not one of them: taking it
 * starts a new one instead of going back into an old one. Every other row's id
 * is a session id, so nothing can be mistaken for it.
 *
 * At the top of the list rather than the bottom, unlike the row that asks for a
 * folder: the folders are eight at most, and this is every conversation the
 * folder has ever had — a row under those is a row to be scrolled to.
 */
const A_NEW_ONE: Choice = { id: 'a new conversation', label: 'Start a new conversation' }

/**
 * How long ago a conversation was last spoken in, in the words anyone would say
 * it in.
 *
 * It is what tells two rows of the list apart: a conversation is named after
 * the first thing said in it, and a week of work in one folder starts several
 * of them the same way. Rounded rather than exact — nobody picking up where he
 * left off is counting minutes, and the row has one line for it.
 */
function ago(when: number, now: number): string {
  const minutes = Math.round((now - when) / 60_000)
  if (minutes < 1) return 'just now'
  const times = (many: number, what: string) => `${many} ${what}${many === 1 ? '' : 's'} ago`
  if (minutes < 60) return times(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return times(hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 7) return times(days, 'day')
  if (days < 365) return times(Math.round(days / 7), 'week')
  return times(Math.round(days / 365), 'year')
}

/**
 * The row on the list of languages that is not one of them: taking it asks her
 * for nothing in particular, and she answers whatever she is written to in. It
 * is the row a house with no persona but the English one would have had on its
 * own, and the only way back off a pick once one has been made.
 *
 * At the top, because it is where the list starts from rather than somewhere it
 * ends up. Every other row's id is a language tag, so nothing can be mistaken
 * for it.
 */
const AS_YOU_WRITE: Choice = { id: 'as you write', label: answersIn(null) }

/** Which of the six lists it is. */
export type Picking = 'models' | 'shift' | 'folder' | 'talks' | 'speaks' | 'outfit'

/**
 * What the list open right now is a list of: what it is called, what is in it,
 * which row it opens marked, where a row taken off it goes, and whether it can
 * be typed at.
 */
export type List = {
  title: string
  items: Choice[]
  chosen: string | null
  take: (id: string) => void
  narrowing: { typed: string; onType: (typed: string) => void } | undefined
}

export function useTheList({
  which,
  scene,
  cast,
  onShift,
  outfit,
  nextShift,
  nextSpeaks,
  folder,
  been,
  narrowing,
  use,
  swapTo,
  speakIn,
  dressIn,
  moveTo,
  resumeTo,
  startFresh,
  sayTrouble,
  typeAPath,
}: {
  /** Which one is open, and nothing at all when none is. */
  which: Picking | null
  scene: Scene
  cast: Character[]
  /** Who is standing there, whose wardrobe is the one worth offering. */
  onShift: Character
  /** What she has on, for the list to mark. */
  outfit: string
  nextShift: Character
  /** What the language list marks: whatever was asked for, and nothing when
   * nothing has been. */
  nextSpeaks: Language | null
  folder: string
  been: string[]
  /** What the lists that can be typed at have been narrowed to. Held by the
   * window rather than here, because ESC is the window's key and what it does
   * depends on whether there is anything typed to clear. */
  narrowing: { typed: string; onType: (typed: string) => void }
  use: (model: string) => void
  swapTo: (id: string) => void
  /** What she is to answer in from the next session on, and nothing at all for
   * the row that asks her for nothing. */
  speakIn: (id: string | null) => void
  dressIn: (outfit: string) => void
  moveTo: (where: string) => void
  resumeTo: (id: string) => void
  startFresh: () => void
  /** Whatever was wrong with the folder just asked for, which is kept beside
   * the line one is typed on. Nothing, when there was nothing wrong with it. */
  sayTrouble: (why: string | null) => void
  /** Off the rows and onto a line to write a folder out on. What is put there
   * stays: the list closes on the row that was taken, and this is what taking
   * that row was for. */
  typeAPath: () => void
}): List | null {
  // Everyone who could be standing there, as rows. The list knows nothing about
  // what is in it, so the id it hands back is hers and the label is her name.
  const shifts: Choice[] = useMemo(
    () => cast.map((one) => ({ id: one.id, label: one.name })),
    [cast],
  )

  // Everything the girl standing there has been drawn in, as rows. Hers rather
  // than the cast's: what is on the list is a folder of her pictures, and
  // another girl's outfit is nothing this one can be put in.
  const wardrobe: Choice[] = useMemo(
    () => onShift.outfits.map((one) => ({ id: one, label: outfitCalled(one) })),
    [onShift],
  )

  // The conversations she has had here, as rows: what each came to be called,
  // and under it when it was last spoken in — which is what tells two of them
  // apart. How long ago is worked out when the rows are, so a list left open
  // does not tick.
  const talks: Choice[] = useMemo(
    () => scene.talks.map((one) => ({ id: one.id, label: one.title, description: ago(one.when, Date.now()) })),
    [scene.talks],
  )
  // The rows as they were when the list was opened, and left alone while it is.
  // She goes on answering underneath it, and the end of a turn puts the
  // conversation it happened in back at the top — rows sliding out from under
  // the highlight is a conversation opened by accident. Kept up to date at
  // every other moment, and taken as they come while there are none: a list
  // opened before she is up would otherwise stay empty for as long as it is up.
  const rows = useRef(talks)
  if (which !== 'talks' || !rows.current.length) rows.current = talks

  if (which === null) return null
  if (which === 'models')
    return {
      title: 'What she thinks with',
      items: scene.models,
      chosen: scene.model,
      take: use,
      narrowing,
    }
  if (which === 'talks')
    return {
      title: 'What you talked about before',
      // The one row that is not a conversation starts one. It is not held with
      // the others — the rows are frozen while the list is open and this one
      // has nothing to freeze — and it is not there at all until they are: a
      // list with one row that only offers itself is not a list, and everything
      // the list knows how to do it works out from having rows.
      items: rows.current.length ? [A_NEW_ONE, ...rows.current] : [],
      chosen: scene.talk,
      take: (id: string) => (id === A_NEW_ONE.id ? startFresh() : resumeTo(id)),
      narrowing,
    }
  if (which === 'shift')
    return { title: 'Who is on shift', items: shifts, chosen: nextShift.id, take: swapTo, narrowing: undefined }
  if (which === 'speaks')
    return {
      title: 'What she answers in',
      items: [AS_YOU_WRITE, ...LANGUAGES.map((one) => ({ id: one.id, label: one.name }))],
      chosen: nextSpeaks?.id ?? AS_YOU_WRITE.id,
      take: (id: string) => speakIn(id === AS_YOU_WRITE.id ? null : id),
      narrowing: undefined,
    }
  if (which === 'outfit')
    return { title: 'What she is wearing', items: wardrobe, chosen: outfit, take: dressIn, narrowing: undefined }
  return {
    title: 'Where she works',
    items: folderRows(folder, been),
    chosen: folder,
    narrowing: undefined,
    // The one row that is not a folder asks for one instead: the folder wanted
    // is very often one she has never been in, and the list can only offer the
    // ones she has.
    take: (id: string) => {
      if (id === TYPE_A_PATH) {
        sayTrouble(null)
        return typeAPath()
      }
      // A row written down for a folder that has been moved or deleted since.
      // Closing the list on it would look exactly like the move having worked,
      // so it says what happened and leaves a line to type somewhere else on.
      const why = troubleWith(id)
      sayTrouble(why)
      if (why === null) moveTo(id)
      else typeAPath()
    },
  }
}
