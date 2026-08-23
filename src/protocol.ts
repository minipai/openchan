import type { Character } from './cast'
import type { Expression } from './expressions'

/**
 * One of the models she could think with: what the agent behind her calls it,
 * and what the list shows for it. The label is the adapter's to write — only it
 * knows whether an id reads as anything to a person.
 */
export type Model = { id: string; label: string }

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
  /** What she can think with, and which of them she is thinking with. Said
   * when the session opens and again every time it changes — the one in force
   * is the agent's to report, so the list only ever marks what has taken. */
  | { kind: 'thinks-with'; models: Model[]; using: string }
  /** The turn, closed out. An error is hers to say out loud — there is one line
   * on this screen and swallowing it would leave her mute for no visible
   * reason. */
  | { kind: 'done'; error?: string }

/**
 * Her brain, from the face's side of the bridge.
 *
 * Six things is all the window ever does to her, and it does them the same way
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
  /** What she thinks with from the next turn on, by the id the `thinks-with`
   * list gives it. Answered with a `thinks-with` of its own, so what the screen
   * marks is what the next prompt will carry rather than a second copy of it
   * kept up here. */
  use(model: string): void
  /** Stop her, mid-turn. */
  interrupt(): void
  close(): void
}

/**
 * How one is opened: hand her the way to speak and say which of them is on
 * shift, and she is yours.
 *
 * Who she is belongs to the session rather than to something set on it
 * afterwards: her persona is the one thing the agent underneath cannot be told
 * to change halfway through, so it is settled here or not at all.
 */
export type OpenConversation = (
  say: (event: BridgeEvent) => void,
  who: Character,
) => Conversation
