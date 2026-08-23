import { columns } from './Asking'
import { STRIP_SPENDS } from './DialogueBox'
import { fitted, shortened } from './folder'
import { thinkingWith } from './model'
import type { Model } from './protocol'

/**
 * How much of the line is kept for what she is doing — at most this, and never
 * more than a quarter of what there is, because a quarter of a narrow terminal
 * is not eight columns and holding eight back there is holding back the whole
 * line.
 *
 * It is held back whether or not she is doing anything right now, so that what
 * she is thinking with is written at one length rather than growing and
 * shrinking as she picks things up and puts them down.
 */
const DOING_KEEPS = 8

/**
 * The right end of the strip above her box: the folder she is in, and what she
 * is thinking with beside it.
 *
 * One line, three things, and the model is the long one — so the line is shared
 * out rather than taken. What she is doing keeps a word of it; the folder is
 * written into half of what is left, from the tail, so it always names the
 * folder it is; and what she is thinking with takes the rest, at whatever
 * length that turns out to be.
 *
 * Half of what is left rather than half of the whole line is the part that
 * makes a forty-column terminal work: at that width the old half was the whole
 * of the room going spare, and the model had nowhere to stand. The folder gives
 * a few columns of its allowance there — never the folder it names, which is
 * the tail, and never its place on the line.
 *
 * And where even that leaves nothing worth writing, the model is what goes:
 * the strip is then exactly the strip there was before there was a model on it,
 * with the folder back at half the line and everything else hers.
 */
export function shareOut(boxWidth: number, where: string, models: Model[], using: string | null) {
  const shared = boxWidth - STRIP_SPENDS
  const folder = fitted(shortened(where), Math.floor(shared / 2))
  const keeps = Math.min(DOING_KEEPS, Math.floor(shared / 4))
  const model = thinkingWith(models, using, shared - columns(folder) - keeps)
  if (model) return { model, folder }
  return { model: '', folder: fitted(shortened(where), Math.floor(boxWidth / 2)) }
}
