import { columns, cut } from './Asking'
import type { Model } from './protocol'

/** The least room worth writing a model's name into. Under this there is
 * nothing left of it but the first letter or two, which names nothing — better
 * the strip says only where she is than that she is thinking with `C…`. */
const WORTH_NAMING = 6

/**
 * What she is thinking with, written for the strip above her box.
 *
 * A model reads as two joined — whoever serves it and the model itself — and
 * that strip already carries what she is doing and the folder she is in, so
 * this is written at whatever length is left rather than at its own. What
 * gives first is the provider: `Anthropic · Claude Opus 4.5` and `Claude Opus
 * 4.5` name the same model and the second half is the half that says which
 * one. Then the front of the name, which is where two models part company —
 * the version they end on is the part they are most likely to share.
 *
 * A model she is on that was never in the list she gave is named by its id.
 * The list is the agent's to write and it can come back short, or not at all;
 * the id is the one thing certainly there, and it reads as something rather
 * than as nothing.
 */
export function thinkingWith(models: Model[], using: string | null, within: number): string {
  if (!using || within <= 0) return ''
  const name = models.find((one) => one.id === using)?.label ?? using
  if (columns(name) <= within) return name

  const model = onItsOwn(name)
  if (columns(model) <= within) return model
  return within < WORTH_NAMING ? '' : cut(model, within)
}

/** The model without whoever serves it. Both spellings of the join are cut:
 * the list writes `Anthropic · Claude Opus 4.5`, and an id the list never
 * offered arrives as `anthropic/claude-opus-4-5`. Whichever it is, it is the
 * first of them that is the join: what is past it is the model's own name,
 * middle dots, slashes and all. */
function onItsOwn(name: string) {
  const joined = name.indexOf(' · ')
  if (joined >= 0) return name.slice(joined + 3)
  const slash = name.indexOf('/')
  return slash > 0 ? name.slice(slash + 1) : name
}
