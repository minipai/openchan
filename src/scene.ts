import type { BridgeEvent, Model, Report, Trouble } from './protocol'
import type { Expression } from './cast'

export type { Report } from './protocol'

export type Permission = {
  askId: string
  toolName: string
  /** The one line the box shows next to the tool's name: the command, the file,
   * the address. */
  summary: string | null
  /** The whole of what she would do, for when one line is not enough of it. */
  detail: string | null
}

/** What is on the scene right now. */
export type Scene = {
  /** What she is saying this turn, as it arrives. */
  line: string
  expression: Expression
  /** The 【…】 she signed with, as she wrote it. */
  mood: string | null
  /** 地の文 — what she is doing, in the words the session gives it. */
  narration: string | null
  /** What she wrote this turn, waiting to be read. Nothing, until she writes
   * something too long to say. */
  report: Report | null
  isWorking: boolean
  permission: Permission | null
  /** Whether there is a session to speak to yet. She is several seconds behind
   * the window that draws her. */
  isReady: boolean
  /** Something said to her before there was a session to say it to, waiting
   * for one. */
  held: string | null
  /** What is in the way, once something is. */
  trouble: Trouble | null
  /** Every model she could think with, as the agent behind her lists them. */
  models: Model[]
  /** The one she is thinking with, once she has said which. */
  model: string | null
}

/** Before she has said anything. */
export const OPENING: Scene = {
  line: '',
  expression: 'neutral',
  mood: null,
  narration: null,
  report: null,
  isWorking: false,
  permission: null,
  isReady: false,
  held: null,
  trouble: null,
  models: [],
  model: null,
}

/**
 * The scene an event leaves behind.
 *
 * Nothing here decides anything — the session has already turned the agent's
 * stream into her line, the face she signed it with and what she is doing; this
 * only keeps the latest of each. It is kept away from the hook that calls it so
 * that what is on screen can be checked without a terminal to draw it in.
 */
export function next(was: Scene, event: BridgeEvent): Scene {
  switch (event.kind) {
    case 'ready':
      return { ...was, isReady: true }
    case 'says':
      return {
        ...was,
        line: event.line,
        expression: event.expression ?? was.expression,
        mood: event.mood ?? was.mood,
        narration: null,
      }
    // What she wrote rather than said. It arrives beside her line rather than
    // instead of it — she is still talking, and this is only the rest of it.
    case 'reports':
      return { ...was, report: event.report }
    // Everything she picks up gets narrated: there is one line of 地の文 and
    // nothing else on this screen, so nothing is hidden.
    case 'doing':
      return { ...was, narration: event.label }
    // Something she cannot get past — or word that it is over. Whatever she was
    // in the middle of is not going to finish, and a question raised by the
    // thing that broke has nobody left to answer it, so both go with it. What
    // was said to her is kept: opening her again is a live possibility from
    // here, and a sentence that survives the retry is the point of holding it.
    case 'trouble':
      if (!event.trouble) return { ...was, trouble: null }
      return {
        ...was,
        trouble: event.trouble,
        isReady: event.trouble.gone ? false : was.isReady,
        isWorking: false,
        // A question is only let go of when there is nobody left to answer it.
        // One raised on a session that is still standing is still open on the
        // server, waiting — it is behind the note while that is up, and back to
        // be answered the moment the note is put away.
        permission: event.trouble.gone ? null : was.permission,
      }
    // What she thinks with is hers to report rather than the picker's to keep
    // its own copy of: there is one answer and she is holding it.
    case 'thinks-with':
      return { ...was, models: event.models, model: event.using }
    case 'ask-permission':
      return {
        ...was,
        permission: {
          askId: event.askId,
          toolName: event.toolName,
          summary: event.summary ?? null,
          detail: event.detail ?? null,
        },
      }
    case 'done':
      return { ...was, isWorking: false, permission: null, line: event.error ?? was.line }
  }
}

/**
 * Whether nothing has passed between them yet: she has said nothing, nothing is
 * waiting to be said to her, and she is not in the middle of anything.
 *
 * It is asked before swapping her out. A session nobody has spoken to is not a
 * conversation, so the girl standing in it can simply be a different one; once
 * anything has been said, she cannot.
 *
 * A session that has gone counts as nobody's: there is nothing to interrupt and
 * nobody left in it to interrupt, so sending for one of the others — a
 * different girl is a different server — is one of the few things that could
 * work from there.
 */
export const unspoken = (scene: Scene) =>
  scene.trouble?.gone === true || (scene.line === '' && scene.held === null && !scene.isWorking)

/**
 * A prompt, submitted. It waits on the scene rather than going anywhere: the
 * window takes sentences several seconds before there is a session to hand
 * them to, and the input has no way of knowing which side of that it is on.
 *
 * The last thing typed is what she gets — saying something else before she is
 * up is a correction, not a queue.
 */
export function hold(was: Scene, prompt: string): Scene {
  if (!prompt.trim()) return was
  return { ...was, held: prompt }
}

/**
 * The scene the moment what was held is handed over: the box is cleared for her
 * answer and she is working. That last part is the whole point of holding —
 * putting her to work over a prompt nobody has received leaves her at
 * "thinking…" with nothing on the way back.
 */
export function handedOver(was: Scene, prompt: string): Scene {
  return {
    ...was,
    // Only what actually went is let go of: something typed while it was on
    // its way is the next thing to hand over, not something to lose here.
    held: was.held === prompt ? null : was.held,
    line: '',
    mood: null,
    narration: null,
    // Last turn's report goes with last turn. It is kept across everything else
    // — putting the reader away must not lose it — so this is the one place it
    // is let go of.
    report: null,
    isWorking: true,
  }
}
