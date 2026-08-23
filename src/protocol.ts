import type { Character } from './cast'
import type { Expression } from './expressions'

/**
 * One of the models she could think with: what the agent behind her calls it,
 * and what the list shows for it. The label is the adapter's to write — only it
 * knows whether an id reads as anything to a person.
 */
export type Model = { id: string; label: string }

/** Something she wrote rather than said: what she headed it with, and the
 * markdown under it. */
export type Report = { title: string; body: string }

/**
 * Something in the way that she cannot get past on her own, said in words
 * rather than left as an error string nobody reads.
 *
 * Whichever agent is underneath is the one that writes it — it is the only one
 * that knows what actually went wrong — but it writes it in the window's
 * vocabulary, so the screen goes on knowing how to show it when the agent is
 * swapped.
 */
export type Trouble = {
  /** What is wrong, in a line. */
  title: string
  /** What it means, and what gets past it. */
  body: string
  /** What actually came back, for whoever wants to look at it. */
  detail?: string
  /** Whether her session went with it. Then there is nobody to speak to until
   * she is opened again, and opening her again is the only way out. */
  gone: boolean
}

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
  /** What she wrote rather than said: everything below her spoken line that is
   * markdown rather than speech, under whatever she headed it with. She has one
   * line to talk in, and an investigation crammed into it stops reading as her
   * — so it is handed over separately and kept until the next thing she is
   * asked.
   *
   * Sent as it grows, the same as her line is — and it can say there is nothing
   * there. Where the writing starts is read off half-finished text, so a line
   * that looked like a heading until its next character arrived has to be taken
   * back rather than left as a page with nothing in it. */
  | { kind: 'reports'; report: Report | null }
  /** 地の文 — what she is doing, while she is doing it. */
  | { kind: 'doing'; label: string }
  | { kind: 'ask-permission'; askId: string; toolName: string }
  /** Something is in the way — or, with nothing in it, that whatever was in
   * the way is not any more. Whether her session survived it is the trouble's
   * own to say: some of them leave her standing there, and some take the
   * server behind her with them. */
  | { kind: 'trouble'; trouble: Trouble | null }
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
 * Seven things is all the window ever does to her, and it does them the same
 * way whichever agent is underneath — so this is the whole of what something
 * has to be able to do to stand in for opencode.
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
  /** Open her again, after something took the session down. What is on screen
   * is cleared as the attempt starts — pressing it has to look like something
   * happening — and a new trouble raised if this one does not get through
   * either. */
  retry(): void
  /** Stop her, mid-turn. */
  interrupt(): void
  close(): void
}

/**
 * How one is opened: hand her the way to speak, say which of them is on shift
 * and which folder she is working in, and she is yours.
 *
 * Both of those belong to the session rather than to something set on it
 * afterwards: her persona and the folder she can see are the two things the
 * agent underneath cannot be told to change halfway through, so they are
 * settled here or not at all.
 */
export type OpenConversation = (
  say: (event: BridgeEvent) => void,
  who: Character,
  folder: string,
) => Conversation
