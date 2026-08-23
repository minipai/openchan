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
}

/** Before she has said anything. */
export const OPENING: Scene = {
  line: '',
  expression: 'neutral',
  mood: null,
  narration: null,
  isWorking: false,
  permission: null,
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
    case 'ask-permission':
      return { ...was, permission: { askId: event.askId, toolName: event.toolName } }
    case 'done':
      return { ...was, isWorking: false, permission: null, line: event.error ?? was.line }
  }
}
