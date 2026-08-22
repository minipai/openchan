import type { Expression } from './expressions'

/**
 * What passes between her brain and her face.
 *
 * This is the swap point: nothing above this file knows that opencode is what
 * answers — only that she said something, she picked something up, she wants
 * permission, she is done.
 */
export type BridgeEvent =
  /** Her line so far, marker stripped, with the face and the 【…】 she signed
   * it with once she has finished writing them. */
  | { kind: 'says'; line: string; expression?: Expression; mood?: string }
  /** 地の文 — what she is doing, while she is doing it. */
  | { kind: 'doing'; label: string }
  | { kind: 'ask-permission'; askId: string; toolName: string }
  /** The turn, closed out. An error is hers to say out loud — there is one line
   * on this screen and swallowing it would leave her mute for no visible
   * reason. */
  | { kind: 'done'; error?: string }
