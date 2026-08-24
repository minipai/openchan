import type { Event, Message, Part } from '@opencode-ai/sdk/v2/types'

/**
 * The opencode she is written against.
 *
 * It is not in the lockfile and cannot be. The server behind her is whatever
 * `opencode` is on the master's PATH — the SDK spawns it by name — so it moves
 * when he upgrades it, and nothing in this repository moves with it. Written
 * down here, it can at least be checked against the one that actually answered
 * and said out loud when the two are not the same, which is the difference
 * between supporting a version and hoping.
 *
 * It moves with the `@opencode-ai/sdk` pin and there is a test that says so:
 * the types below are that package's, and they only describe this server
 * because they were read against it.
 */
export const SPEAKS = '1.18.21'

/**
 * One event off her server's stream, as that server describes it.
 *
 * The SDK carries two sets of types and only one of them is alive. The older
 * set — the one the rest of this adapter's calls are written against — has not
 * moved since 1.17 and has drifted away from the server underneath: it has no
 * `message.part.delta` at all, it calls a permission `permission.updated` and
 * hangs the turn's id off the permission itself, and it puts no session on a
 * part event. None of that is what arrives. The `v2` set is generated from the
 * same schema the running server serves at `/doc`, and it was read against
 * 1.18.21 event by event: the same eighty-nine, in the same order, carrying the
 * same fields.
 *
 * So events are read through these and never through the older set. That is the
 * whole rule, and it is worth stating because both sets are exported from the
 * same package under names that differ by nothing.
 *
 * One thing the server sends is in neither: `server.heartbeat`, which arrives
 * every few seconds with nothing in it. The union is not the whole of the
 * stream, so nothing may treat it as closed — an event matching none of the
 * cases is one to drop, not a case somebody forgot.
 *
 * Two in it are dropped knowingly. 1.18.21 carries a second permission
 * subsystem, `permission.v2.asked` and `question.v2.asked`, and nothing on the
 * path she prompts by has been seen to raise either — a real turn asking to run
 * a command raises the plain ones. If she ever goes silent at a tool instead of
 * asking, that is the first place to look.
 */
export type Heard = Event

/** What one kind of event carries, as the server sends it. */
type Sends<T extends Heard['type']> = Extract<Heard, { type: T }>['properties']

/**
 * A tool she may not use until he says so.
 *
 * The turn asking is under `tool`, beside the call that wants the permission,
 * and there is no `messageID` on the permission itself — reading one there is
 * reading a field that never arrives, and everything resting on it quietly
 * stops happening. `permission` is the tool's name and the server always sends
 * one.
 */
export type AskedPermission = Sends<'permission.asked'>

/** A question she asked with the answers written out: one request, carrying
 * one or more questions, each with its options. */
export type AskedQuestion = Sends<'question.asked'>

/** What the server says went wrong. Only the names matter here — one of them is
 * trouble of its own and the rest are this turn's business. */
export type SessionTrouble = Sends<'session.error'>['error']

/** A few more words on a part already announced. They arrive tagged with the
 * part and not with what it turned out to be, which is why they are held. */
export type SaidMore = Sends<'message.part.delta'>

export type { Message, Part }

/**
 * Which conversation an event is about, where it is about one.
 *
 * One place, not two. An event that belongs to a conversation says so on
 * itself, the part events included — which is exactly what the older types are
 * wrong about. Some say nothing because they are the server's own news: a
 * plugin loaded, the catalog refreshed, the heartbeat. And `session.error` is
 * allowed to leave it out, so one that does is read as belonging to nobody and
 * lands in whichever conversation is on screen. That has always been so and is
 * not made better here; it is written down because this is where somebody will
 * come looking.
 *
 * Asked of the event rather than looked up on a list of which ones carry it —
 * and asked of it carefully, because what arrives is whatever came down the
 * wire: a frame the stream could not parse is handed over as the raw text of
 * it, and `in` against something that is not an object throws. Thrown here it
 * would be caught as the server having died, which is the one thing it does not
 * mean.
 */
export function sessionOf(heard: Heard): string | null {
  const props = heard.properties
  const named = props && 'sessionID' in props ? props.sessionID : undefined
  return typeof named === 'string' ? named : null
}
