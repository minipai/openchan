import type { Expression } from './expressions'

/**
 * What passes between her brain and her face.
 *
 * This is the swap point: nothing above this file knows that opencode is what
 * answers — only that she is there, she said something, she picked something
 * up, she wants permission, she is done.
 */
export type BridgeEvent =
  /** She has a session and can be spoken to. The window is up for several
   * seconds before this — the server behind her has to boot — and nothing said
   * in the meantime can go anywhere until it arrives. */
  | { kind: 'ready' }
  /** Her line so far, marker stripped, with the face and the 【…】 she signed
   * it with once she has finished writing them. */
  | { kind: 'says'; line: string; expression?: Expression; mood?: string }
  /** 地の文 — what she is doing, while she is doing it. */
  | { kind: 'doing'; label: string }
  | { kind: 'ask-permission'; askId: string; toolName: string }
  /** She is not coming: the server behind her never came up. There is nobody
   * to speak to until the window is started again. */
  | { kind: 'lost'; why: string }
  /** The turn, closed out. An error is hers to say out loud — there is one line
   * on this screen and swallowing it would leave her mute for no visible
   * reason. */
  | { kind: 'done'; error?: string }

/**
 * Her brain, from the face's side of the bridge.
 *
 * Five things is all the window ever does to her, and it does them the same way
 * whichever agent is underneath — so this is the whole of what something has to
 * be able to do to stand in for opencode.
 */
export interface Conversation {
  /** Open it. She says nothing until this has settled. */
  start(): Promise<void>
  ask(prompt: string): void
  /** An answer to an `ask-permission`. An id she is no longer waiting on is
   * dropped rather than sent. */
  answer(askId: string, allow: boolean): void
  /** Stop her, mid-turn. */
  interrupt(): void
  close(): void
}

/** How one is opened: hand her the way to speak, and she is yours. */
export type OpenConversation = (say: (event: BridgeEvent) => void) => Conversation
