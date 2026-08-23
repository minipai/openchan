import type { Character } from './her/cast'
import type { Expression } from './her/expressions'

/**
 * One of the models she could think with: what the agent behind her calls it,
 * and what the list shows for it. The label is the adapter's to write — only it
 * knows whether an id reads as anything to a person.
 */
export type Model = { id: string; label: string }

/**
 * One conversation she has already had in this folder: the id it is reopened
 * by, what it came to be called, and when it was last spoken in.
 *
 * The title is the agent's to write, the same as a model's label is — she is
 * named after the first thing said to her and nothing up here could do better.
 * The time is what tells two of them apart when the titles read alike, which
 * for a week's work in one folder is most of them.
 */
export type Talk = { id: string; title: string; when: number }

/**
 * A word about something that just happened, said beside her rather than by
 * her: a tool she picked up and put down again, or one that came back wrong.
 *
 * Nobody is meant to stop and read it. It goes up, it is there for a moment,
 * and it takes itself away again — which is why it is kept off her line and off
 * the 地の文: those two are read, and a sentence pushed aside by word of a file
 * having been written is a sentence nobody got.
 */
export type Whisper = {
  /** What happened, in a few words. It has one row and shares it with nothing. */
  text: string
  /** Whether it went through or came back wrong, which is the only difference
   * the screen makes between them. */
  kind: 'did' | 'failed'
}

/** Something she wrote rather than said: what she headed it with, and the
 * markdown under it. */
export type Report = { title: string; body: string }

/** One of the answers she has written out: the label is the answer itself —
 * it is what goes back to her — and the description is why someone might
 * give it, when she has bothered to say. */
export type Option = { label: string; description?: string }

/**
 * A question she asks with the answers already written out, rather than a
 * line to type one on: what she is asking, the few words it goes under, what
 * can be picked, and whether more than one of them can be.
 */
export type Question = {
  header: string
  question: string
  options: Option[]
  multiple: boolean
}

/**
 * What a standing yes covers, for a tool she is asking to use: the scope it is
 * remembered under for the rest of the session, and the words the box offers it
 * in.
 *
 * The scope is as narrow as the thing that was asked for — the one file, the
 * one program, the one host — because a standing yes is given against what is
 * on screen and nothing wider was on screen. Absent, for a tool nothing is
 * known about: there is no honest scope to write for it, so it is asked every
 * time.
 */
export type Standing = { scope: string; covers: string }

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
  /** A word about what just happened, for a moment: she has put a tool down,
   * and either it went through or it did not. Said beside her rather than
   * instead of anything — several of them stand together, and none of them
   * touches what she is saying. */
  | { kind: 'whispers'; whisper: Whisper }
  /** A tool she may not pick up until he says she can, with what she would do
   * with it: one line of it for the box, which has room for one line, and the
   * whole of it for whoever wants to read before saying yes — and what saying
   * yes to it for the rest of the session would cover, where that is narrow
   * enough to be worth offering. */
  | {
      kind: 'ask-permission'
      askId: string
      toolName: string
      summary?: string
      detail?: string
      /** What allowing it for the rest of the session would cover, when that
       * can be said narrowly enough to offer. */
      standing?: Standing
    }
  /** Something she wants picked rather than typed. Several at once is one
   * event rather than several: the agent asks them together and wants them
   * back together, answered or not answered as one. */
  | { kind: 'ask-choice'; askId: string; questions: Question[] }
  /** Something is in the way — or, with nothing in it, that whatever was in
   * the way is not any more. Whether her session survived it is the trouble's
   * own to say: some of them leave her standing there, and some take the
   * server behind her with them. */
  | { kind: 'trouble'; trouble: Trouble | null }
  /** Every conversation there has been in this folder, and which of them she
   * is in now. Said when the session opens and again when one of the others is
   * picked up — asked for once rather than when the list is opened, because a
   * list that fetches its own contents opens onto an empty box. */
  | { kind: 'talks'; talks: Talk[]; current: string }
  /** Another conversation on screen: the last thing she said in it, and the
   * page under it if she wrote one — nothing at all, for one that has just
   * been started.
   *
   * It replaces the scene rather than adding to it. Everything on screen
   * belonged to the conversation being left — her line, what she was in the
   * middle of, anything she was waiting on — and none of it is true of the one
   * being opened.
   */
  | { kind: 'picks-up'; line: string; expression?: Expression; mood?: string; report: Report | null }
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
 * Eleven things is all the window ever does to her, and it does them the same
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
  /** An answer to an `ask-choice`: for each question, in the order they were
   * asked, the labels picked — none of them, for a question that takes several
   * and got none. An id she is no longer waiting on is dropped rather than
   * sent. */
  choose(askId: string, answers: string[][]): void
  /** An `ask-choice` put down unanswered. Said as its own thing rather than as
   * an empty answer, because an empty answer is an answer: she gets told that
   * nobody picked, not that nobody picked anything. */
  decline(askId: string): void
  /** What she thinks with from the next turn on, by the id the `thinks-with`
   * list gives it. Answered with a `thinks-with` of its own, so what the screen
   * marks is what the next prompt will carry rather than a second copy of it
   * kept up here. */
  use(model: string): void
  /**
   * Go back into one of the conversations the `talks` list gave, by its id.
   *
   * Nothing is restarted: the server behind her holds every session it has ever
   * had in this folder, so picking one up is a matter of which id the next
   * prompt goes into. What she last said in it is announced as it is picked up
   * — a resume that changed nothing anybody can see reads as a list that does
   * nothing.
   *
   * The one she is already in is dropped rather than reopened.
   */
  resume(id: string): void
  /**
   * A new conversation, in the same folder, with the same girl and the same
   * model.
   *
   * The one thing the list of earlier conversations cannot otherwise get back
   * to: the blank conversation a window opens with drops off that list the
   * moment it is left, because nothing was ever said in it.
   *
   * Whatever she is in the middle of is stopped rather than left running, which
   * is where this parts company with picking an earlier conversation up: that
   * answer is still worth having when the conversation is opened again, and
   * this one is being walked away from.
   */
  begin(): void
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
