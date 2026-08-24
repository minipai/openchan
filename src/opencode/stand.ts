import type { Character, Language } from '../her/cast'
import type { BridgeEvent, Conversation, Model, Talk, Trouble } from '../between/protocol'

/**
 * Her, with nobody behind her.
 *
 * It records what it was asked and says whatever the test says on her behalf —
 * wakes up, or refuses to, when told. That is the whole of what a slow opencode
 * server does differently from a fast one, and the whole of what the hook and
 * the window need from something standing in for one. Shared between their
 * tests rather than copied, so the two are driving the same thing.
 */
export class Stand implements Conversation {
  readonly asked: string[] = []
  /** Every model she has been handed, in order. */
  readonly handed: string[] = []
  /** Every permission answered from the keyboard, in order. */
  readonly answered: { askId: string; allow: boolean }[] = []
  /** Every question with choices answered off the list, in order — and the
   * ones put down without an answer, marked as that rather than as nothing
   * picked. */
  readonly chosen: { askId: string; answers: string[][] | 'declined' }[] = []
  /** The questions she is still waiting on. The real one drops an answer to
   * any other id rather than sending it, so this does too. */
  private readonly waiting = new Set<string>()
  /** How many times she has been told to stop mid-turn. */
  interrupted = 0
  /** Whether the window has shut this one, which is what swapping her does. */
  closed = false
  /** How many times the window has asked for her to be opened again. */
  retries = 0
  /** Every earlier conversation she has been sent back into, in order. */
  readonly resumed: string[] = []
  /** How many new conversations have been started from the window. */
  begun = 0
  private model = MODELS[0]!.id
  private talk = TALKS[0]!.id
  constructor(
    private say: (event: BridgeEvent) => void,
    readonly who: Character,
    readonly folder: string,
    readonly speaks: Language | null,
  ) {}
  /** Nothing yet: she is several seconds behind the window that draws her, and
   * the test says when those are up. */
  async start() {}
  /** Anything at all, said as her. */
  raise(event: BridgeEvent) {
    if (event.kind === 'ask-permission' || event.kind === 'ask-choice') this.waiting.add(event.askId)
    this.say(event)
  }
  wakeUp() {
    this.say({ kind: 'ready' })
    this.say({ kind: 'thinks-with', models: MODELS, using: this.model })
    this.say({ kind: 'talks', talks: TALKS, current: this.talk })
  }
  giveUp() {
    this.say({ kind: 'trouble', trouble: LOST })
  }
  /** Something in the way that left her session standing. */
  getStuck() {
    this.say({ kind: 'trouble', trouble: STUCK })
  }
  /** Opening her again. The real one says the trouble is over as it starts and
   * announces her if it gets through — which is what the test does by hand. */
  retry() {
    this.retries++
    this.say({ kind: 'trouble', trouble: null })
  }
  ask(prompt: string) {
    this.asked.push(prompt)
  }
  use(model: string) {
    this.handed.push(model)
    this.model = model
    this.say({ kind: 'thinks-with', models: MODELS, using: model })
  }
  /** Back into an earlier conversation, the way the real one does it: the list
   * says which one is open now, and she says where it was left. */
  resume(id: string) {
    const found = TALKS.find((one) => one.id === id)
    if (!found || id === this.talk) return
    this.resumed.push(id)
    this.talk = id
    this.say({ kind: 'talks', talks: TALKS, current: id })
    this.say({ kind: 'picks-up', line: `we left off on ${found.title}`, report: null })
  }
  /** A new conversation, the way the real one does it: the list says the one
   * she is in now, and the scene is replaced with where it was left — which for
   * one nothing has been said in is nothing. */
  begin() {
    this.talk = `ses_new_${++this.begun}`
    this.say({
      kind: 'talks',
      talks: [{ id: this.talk, title: 'Nothing said in it yet', when: Date.now() }, ...TALKS],
      current: this.talk,
    })
    this.say({ kind: 'picks-up', line: '', report: null })
  }
  answer(askId: string, allow: boolean) {
    if (this.waiting.delete(askId)) this.answered.push({ askId, allow })
  }
  choose(askId: string, answers: string[][]) {
    if (this.waiting.delete(askId)) this.chosen.push({ askId, answers })
  }
  decline(askId: string) {
    if (this.waiting.delete(askId)) this.chosen.push({ askId, answers: 'declined' })
  }
  interrupt() {
    this.interrupted++
  }
  close() {
    this.closed = true
  }
}

/** How far back the conversations the stand-in offers are, so that what the
 * window writes under each row is something to check. */
const HOURS = 60 * 60 * 1000

/** What the stand-in says has been talked about in this folder, most recently
 * spoken in first — the order the real one puts them in. */
export const TALKS: Talk[] = [
  { id: 'ses_now', title: 'The colours of the sky', when: Date.now() - HOURS },
  { id: 'ses_before', title: 'Where the needle was', when: Date.now() - 5 * HOURS },
]

/** What the stand-in says she could think with. */
export const MODELS: Model[] = [
  { id: 'opencode/free', label: 'opencode · Free' },
  { id: 'anthropic/opus', label: 'Anthropic · Opus' },
]

/** Her server never came up, or went away: nobody left to speak to until she is
 * opened again. */
export const LOST: Trouble = {
  title: 'She could not be woken up',
  body: 'The opencode server behind her did not start.',
  gone: true,
}

/** Something in the way of the model she is on, with her still standing there. */
export const STUCK: Trouble = {
  title: 'She is not signed in to anthropic',
  body: 'opencode has no credentials for anthropic.',
  gone: false,
}
