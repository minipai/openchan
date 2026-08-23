import type { BridgeEvent } from './protocol'
import type { Expression } from './cast'

export type Permission = { askId: string; toolName: string }

/** What is on the scene right now. */
export type Scene = {
  /** What she is saying this turn, as it arrives. */
  line: string
  expression: Expression
  /** The 【…】 she signed with, as she wrote it. */
  mood: string | null
  /** 地の文 — what she is doing, in the words the session gives it. */
  narration: string | null
  isWorking: boolean
  permission: Permission | null
  /** Whether there is a session to speak to yet. She is several seconds behind
   * the window that draws her. */
  isReady: boolean
  /** Something said to her before there was a session to say it to, waiting
   * for one. */
  held: string | null
  /** Why she is not coming, once it is clear she is not. */
  lost: string | null
}

/** Before she has said anything. */
export const OPENING: Scene = {
  line: '',
  expression: 'neutral',
  mood: null,
  narration: null,
  isWorking: false,
  permission: null,
  isReady: false,
  held: null,
  lost: null,
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
    // Everything she picks up gets narrated: there is one line of 地の文 and
    // nothing else on this screen, so nothing is hidden.
    case 'doing':
      return { ...was, narration: event.label }
    // She is not coming. What was being held for her is let go of here rather
    // than kept for a session that will never open, and the reason takes her
    // line — a sentence disappearing without one is the whole of this bug.
    case 'lost':
      return { ...was, lost: event.why, held: null, isWorking: false, line: event.why }
    case 'ask-permission':
      return { ...was, permission: { askId: event.askId, toolName: event.toolName } }
    case 'done':
      return { ...was, isWorking: false, permission: null, line: event.error ?? was.line }
  }
}

/**
 * A prompt, submitted. It waits on the scene rather than going anywhere: the
 * window takes sentences several seconds before there is a session to hand
 * them to, and the input has no way of knowing which side of that it is on.
 *
 * The last thing typed is what she gets — saying something else before she is
 * up is a correction, not a queue.
 */
export function hold(was: Scene, prompt: string): Scene {
  // Once she is known not to be coming, holding would be the old bug wearing a
  // better hat: kept forever for a session that will never open.
  if (!prompt.trim() || was.lost !== null) return was
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
    isWorking: true,
  }
}
