import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { createOpencodeClient as createLive, type OpencodeClient as Live } from '@opencode-ai/sdk/v2/client'
import { briefFor, type Character } from '../her/cast'
import type { BridgeEvent, Conversation, Model, Trouble } from '../between/protocol'
import { asking, questionsIn } from './asking'
import {
  sessionOf,
  SPEAKS,
  type AskedPermission,
  type AskedQuestion,
  type Heard,
  type Message,
  type Part,
  type SaidMore,
  type SessionTrouble,
} from './wire'
import { halves, modelsIn } from './models'
import { justDid, narrate } from './narrate'
import { readMood, splitReport } from './reply'
import { lastSaid, nameFor, READ_BACK, talksIn } from './talks'

/**
 * Which model she starts the session thinking with — she can be handed another
 * one off the picker afterwards, and this is only where she begins. opencode
 * names a model `provider/id`, and the point of this whole exercise is that the
 * provider is not fixed — so it is an environment variable rather than a
 * constant, and the default is a free one so that starting her up never quietly
 * spends the master's money.
 */
const MODEL = process.env.CAFE_MODEL ?? 'opencode/nemotron-3.5-lightning-free'

/**
 * What she does without asking. `ask` is what puts the y/n question on screen —
 * opencode raises it as an event and waits for an answer over HTTP, so the
 * dialogue box gets to be the one that asks.
 */
const PERMISSION = { bash: 'ask', edit: 'ask', webfetch: 'ask' } as const

/**
 * Whoever is on shift, written where opencode can be pointed at it.
 *
 * `instructions` appends rather than replaces, which is the point: she keeps
 * the coding agent's own discipline about reading before writing and gets to be
 * ことね — or くるみ — on top of it. Replacing the prompt would make her charming
 * and useless.
 *
 * A file per girl rather than one file overwritten: swapping closes one server
 * and starts another, and for a moment both of them are reading.
 */
function writePersona(who: Character) {
  const file = path.join(os.tmpdir(), `openchan-persona-${who.id}.md`)
  fs.writeFileSync(file, briefFor(who))
  return file
}

/**
 * A port nobody is on. She starts a server of her own, and the master is an
 * opencode user — landing on its usual port would mean whichever of them
 * opened second simply fails to start.
 */
function freePort(): Promise<number> {
  return new Promise((settle) => {
    const probe = net.createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo
      probe.close(() => settle(port))
    })
  })
}

/**
 * How many times the event stream may put itself back together before the
 * server behind it counts as gone.
 *
 * It has to be a number: left to itself the stream reconnects for ever, so a
 * server that died stays invisible — she simply stops answering and the window
 * goes on looking like nothing is wrong. Three attempts is a few seconds of
 * backoff, which a hiccup survives and a dead process does not.
 */
const RECONNECTS = 3

/**
 * What came back, as much of it as is worth reading: an error's message rather
 * than the stack under it, and on one line.
 *
 * Cut, because a server that fell over prints everything it had to say on the
 * way down — and the note it lands in grows the dialogue box upward, so a long
 * enough one pushes her line and the frame's own top off the top of the screen.
 */
function said(trouble: unknown) {
  const words = (trouble instanceof Error ? trouble.message : String(trouble)).replace(/\s+/g, ' ').trim()
  return words.length > 200 ? `${words.slice(0, 200)}…` : words
}

/**
 * The server that answered is not the one she was written against.
 *
 * Said out loud rather than shrugged at, because the way this goes wrong is
 * that nothing looks wrong: an event whose shape has moved is read as an event
 * with nothing in it, and she goes on smiling while whatever rested on that
 * field silently stops happening.
 *
 * It does not say how bad it is, because it cannot know. On a version whose
 * events happen not to have moved she is perfect; on one where the permission
 * event is called something else she never asks and the turn waits for ever.
 * All that is actually known here is that nobody has checked her against this
 * one, so that is what it says.
 *
 * And it does not stop her, for the same reason: refusing to start over a
 * patch release nobody has got round to reading would be the more expensive
 * mistake of the two.
 */
function wrongVersion(running: string): Trouble {
  return {
    title: `She is talking to opencode ${running}`,
    body: `She is written against ${SPEAKS}, and nobody has read her against this one. Where the events have moved between them she will not fail loudly — she will go on looking fine and quietly stop noticing things. Run her against opencode ${SPEAKS}, or have her checked against the one that is here.`,
    gone: false,
  }
}

/**
 * What is said when she is up again but the conversation is not: the server
 * that came up has no record of the session the last one went down under. She
 * is standing there and can be spoken to, so this is the kind that is put away
 * rather than retried — it is only here so that a reconnect never quietly turns
 * into a conversation with someone who remembers none of it.
 */
const FRESH_START: Trouble = {
  title: 'She is starting over',
  body: 'The conversation that was interrupted could not be reopened — the server behind her has no record of it. She is up, but nothing said before the connection dropped is in her memory.',
  gone: false,
}

/**
 * One conversation with her, held open across turns, spoken to over HTTP.
 *
 * The window's own vocabulary is unchanged — this hands out the same events the
 * Agent SDK's session did, so nothing above it knows which agent is underneath.
 * All the work is in one place: opencode streams *parts*, and a part does not
 * say whether it is her voice or her thinking until it is announced. The
 * deltas that carry the words arrive tagged only with the part they belong to,
 * so anything that arrives before its part is announced is held rather than
 * spoken — otherwise she reads her own private notes out loud.
 */
export class MaidSession implements Conversation {
  private client: OpencodeClient | null = null
  /** The client whose types are the running server's, for the two things that
   * have to be right about it: every event she is read by, and the answer to a
   * question she asked with choices. Everything else stays on the older one —
   * it is what the calls are written against, its endpoints are all still there
   * on 1.18.21, and swapping the whole of it over is not this file's errand. */
  private live: Live | null = null
  private server: Awaited<ReturnType<typeof createOpencodeServer>> | null = null
  private sessionId: string | null = null
  private closed = false
  /** What she is thinking with, which is hers to remember rather than the
   * server's: the model travels with each prompt, so changing it is a matter of
   * what the next one says rather than of restarting anything. */
  private model = MODEL
  /** Whether a turn is still open, so a stream that goes quiet twice only
   * closes it once. */
  private working = false
  /** How many turns have been started in her, ever. Only the difference
   * between two moments is worth anything, and there is one thing it is
   * asked: whether the turn running now is the one that was running then. */
  private turns = 0
  /** The conversation whose turn ended while nobody was in it, since the last
   * one was picked up. A turn goes on running in the conversation being left
   * while that one is being read back, and its end is a single event that
   * belongs to nobody at the moment it arrives — so it is kept here in case
   * the read fails and she is put back into it. */
  private ended: string | null = null

  /** What kind of part each id turned out to be, and the words held for it. */
  private parts = new Map<string, { kind: string; held: string }>()
  /** Her line this turn, as it has been spoken so far. */
  private said = ''
  /** Whether the last thing said about her writing was that there is some. Only
   * a change is worth an event: her line moves on every delta, and the page
   * behind it almost never does. */
  private wrote = false
  /** Which part the words already in it came from. A turn is several of them —
   * she says something, picks up a tool, and writes once she knows the answer —
   * and glued end to end they run together into one sentence. */
  private saying: string | null = null
  /** The permission questions on screen, so a stale answer goes nowhere. */
  private asked = new Set<string>()
  /** The questions with choices on screen, for the same reason. */
  private choosing = new Set<string>()
  /** Every sentence sent from this window, by the id it went out under.
   *
   * The id is minted here rather than left to the server, and that is the whole
   * of what makes the turn it starts recognisable afterwards: her side of it
   * announces itself as the answer to this one, and from then on everything
   * that turn asks for is asked under her id. */
  private sent = new Set<string>()
  /** Her side of each of them, by the id the server gave it: the turns this
   * window started, and the only thing in the stream that says so.
   *
   * Never emptied, and it does not need to be. A message id is never used
   * twice, so an id kept for ever can only ever match the turn it was minted
   * for — which is what keeps another window's work in the same folder safe
   * from this one by construction rather than by care. */
  private hers = new Set<string>()
  /** Calls already narrated. A tool announces itself again every time its
   * state moves — and one that had to wait to be allowed announces itself on
   * both sides of the wait — but she only picks it up once. */
  private narrated = new Set<string>()
  /** Calls already whispered about, for the same reason: a part announces
   * itself again every time anything on it moves, and it is finished exactly
   * once however many times it says so. */
  private putDown = new Set<string>()
  /** The list the server gave, kept so that changing model can be said the same
   * way it was first said. */
  private models: Model[] = []
  /** Which attempt at opening her is the live one. Everything an attempt starts
   * answers to the number it was started under: a stream from an attempt that
   * has been given up on takes a few seconds to notice, and by then what it has
   * to say is about a session nobody is in. */
  private opening = 0
  /** What is dropped when an attempt is done with — the event stream, which
   * otherwise goes on reaching for a server that is not there. */
  private stopListening = new AbortController()
  /** Which pick of an earlier conversation is the live one. Two rows taken
   * before the first has been read back is the second one's conversation she is
   * in, and the first's answer is about one nobody is standing in. */
  private picking = 0
  /** The conversation this window opened and nobody has said anything in yet,
   * waiting to be named after the first thing that is. Nothing, once it has
   * been — a conversation is named once, by how it started. */
  private unnamed: string | null = null
  /** Whether something is in the way on screen. The window has one slot for it
   * and the last thing raised is what is in it, so anything with no hurry about
   * it asks first rather than painting over what is there. */
  private troubled = false
  /** Whether a conversation was lost and it has not been said yet. Kept on her
   * rather than worked out inside the attempt: an attempt that opened the new
   * session and then died before announcing her leaves a session the next
   * attempt finds and reopens, and the note would go with the attempt. */
  private startedOver = false

  /** Both of the things a session is fixed to are settled here: the persona
   * goes into the server as it starts and the folder goes into the session as
   * it is opened, so a session is one girl in one folder from end to end.
   * Moving either of them is this one being closed and another opened. */
  constructor(
    private onEvent: (event: BridgeEvent) => void,
    private who: Character,
    private folder: string,
  ) {}

  async start() {
    const mine = ++this.opening
    try {
      await this.open(mine)
    } catch (trouble) {
      // Unless this one has been given up on: swapping her closes a booting
      // server out from under itself, and so does opening her again, and the
      // scene the complaint would land in is not this attempt's any more.
      if (this.spent(mine)) return
      // A server that never came up is invisible from everywhere else — the
      // window would sit at "waking her up…" for good, holding a sentence for a
      // session nobody is opening. Retryable, and worth saying so: the usual
      // reason is something the master can go and fix in one command.
      this.raise({
        title: 'She could not be woken up',
        body: 'The opencode server behind her did not start. Check that opencode is installed and signed in to at least one provider, then try her again.',
        detail: said(trouble),
        gone: true,
      })
    }
  }

  /** Whether an attempt at opening her still has the screen: it has either been
   * closed, or another attempt has been started over the top of it. */
  private spent(mine: number) {
    return this.closed || mine !== this.opening
  }

  private async open(mine: number) {
    const stopListening = new AbortController()
    const started = await createOpencodeServer({
      port: await freePort(),
      config: { model: MODEL, instructions: [writePersona(this.who)], permission: PERMISSION },
    })
    // What this attempt started, let go of. It is asked after every wait rather
    // than only the first: an attempt given up on halfway leaves a server
    // running behind a window nobody can see it from, and a stream reaching for
    // it, and the id of a session on it about to be written over the live one's.
    const drop = () => {
      stopListening.abort()
      started.close()
    }
    if (this.spent(mine)) return drop()

    // The folder goes on the client rather than on the one call that opens the
    // session: opencode holds a server's folders apart from one another all the
    // way down, and the events are the half that catches anyone out. A session
    // opened in one folder publishes onto that folder's stream and no other, so
    // a client asking for the folder the window happens to have been started in
    // would leave her working perfectly and silently — nothing she said, nothing
    // she picked up and nothing she wanted permission for would ever arrive.
    const client = createOpencodeClient({ baseUrl: started.url, directory: this.folder })
    this.server = started
    this.stopListening = stopListening

    // The conversation that was going, picked up again rather than replaced.
    // opencode keeps its sessions on disk and not in the server that made them,
    // so the one the last server went down under is still there for this one to
    // open — with everything said in it, on both sides — and it only has to be
    // asked for by id. A server that does not know the id any more is the one
    // case there is nothing to pick up, and then she starts over and says so.
    const before = this.sessionId
    const found = before === null ? null : await client.session.get({ path: { id: before } })
    if (this.spent(mine)) return drop()
    if (found?.error) {
      // Only not being known is a reason to start over. Anything else the
      // server says about the id is this attempt failing, and is said as that:
      // the conversation may well still be there for the next one.
      if ((found.error as { name?: string }).name !== 'NotFoundError') throw new Error(said(found.error))
      this.startedOver = true
    }
    if (found?.data?.id !== before) {
      const opened = await client.session.create({})
      if (this.spent(mine)) return drop()
      const id = opened.data?.id
      if (!id) throw new Error('the server opened no session')
      this.sessionId = id
      // Left to be named by the first thing said in it, which is the only thing
      // there is to name it after.
      this.unnamed = id
    }
    // Only now is there anything to speak to. Installed after the session is
    // settled rather than as the client is made: everything that reaches for
    // this asks which conversation it is in, and for the seconds an attempt
    // spends opening one there is no answer — an earlier conversation picked up
    // in that window would be opened and then written straight over by the
    // session this attempt goes on to open.
    const live = createLive({ baseUrl: started.url, directory: this.folder })
    this.client = client
    this.live = live

    // Listening is waited for rather than left running, and she is only
    // announced once it has taken: whoever was waiting to speak to her speaks
    // the moment this lands, and a prompt sent before the stream is open loses
    // the front of her answer.
    //
    // Over the newer client, which is the whole of what makes the events below
    // readable: it is the same `/event` on the same server, and the difference
    // is only that what comes off it arrives shaped the way the server actually
    // sends it.
    const stream = await live.event.subscribe(
      {},
      { signal: stopListening.signal, sseMaxRetryAttempts: RECONNECTS },
    )
    if (this.spent(mine)) return drop()
    void this.listen(stream.stream, mine)
    // Said before she is announced rather than after: what was said to her
    // while she was down goes the moment she is, and it should go with the
    // note already up — not into what looks, for a frame, like the conversation
    // it was typed into.
    if (this.startedOver) {
      this.startedOver = false
      this.raise(FRESH_START)
    }
    this.onEvent({ kind: 'ready' })

    // What she could think with, asked for once and after she is announced: the
    // server's answer does not change under her, and a picker that fetches its
    // own contents opens onto an empty box. Not being able to say what else she
    // could think with is not a reason to say she never woke up — she is up,
    // and the model she was started on works — so this one is swallowed rather
    // than allowed to take the session down with it.
    const listed = await client.config.providers().catch(() => null)
    if (this.spent(mine)) return drop()
    this.tellModel(modelsIn(listed?.data?.providers ?? []))

    // And what has been talked about here before, for the same reasons: asked
    // for once rather than when the list is opened, and swallowed if the server
    // will not say — not being able to offer the old conversations is no reason
    // to say she never woke up.
    await this.tellTalks(client, mine)

    // And last of all, which opencode actually answered.
    //
    // Last for two reasons. It is a standing fact rather than news — nothing
    // about this minute — so it waits behind everything that has to happen for
    // her to be usable, and behind everything that could hang: a route that
    // accepts the connection and never answers would otherwise take the model
    // list and the old conversations down with it, and neither of them would
    // say why. And it is not said at all over a note that is already up, for
    // the same reason: whatever is on that one screen slot happened just now
    // and to somebody, and this did not.
    const health = await live.global.health().catch(() => null)
    if (this.spent(mine) || this.troubled) return
    const running = health?.data?.version
    if (running && running !== SPEAKS) this.raise(wrongVersion(running))
  }

  /**
   * Every conversation there has been in this folder, said out loud, and which
   * of them she is in.
   *
   * The client carries the folder, and opencode holds a server's folders apart
   * all the way down — so this is the folder's conversations and no others,
   * which is the whole of what makes the list worth opening.
   */
  private async tellTalks(client: OpencodeClient, mine: number) {
    const current = this.sessionId
    if (!current) return
    const listed = await client.session.list().catch(() => null)
    // A server that would not say is not a folder with nothing in it. Said as
    // nothing, it would empty a list that is on screen and correct — and this
    // is asked again at the end of every turn, so it would keep doing it.
    if (!listed?.data) return
    if (this.spent(mine) || this.sessionId !== current) return
    this.onEvent({ kind: 'talks', talks: talksIn(listed.data, current), current })
  }

  /** What she thinks with, said out loud. The screen marks the one in force off
   * this rather than off what it asked for — there is one place the answer
   * lives and it is here, so the list cannot drift from what the next prompt
   * will actually carry. */
  private tellModel(models = this.models) {
    this.models = models
    this.onEvent({ kind: 'thinks-with', models, using: this.model })
  }

  /** Every event the server has, filtered down to this conversation. */
  private async listen(events: AsyncIterable<Heard>, mine: number) {
    try {
      for await (const heard of events) {
        if (this.spent(mine)) return
        const from = sessionOf(heard)
        // Taken wherever it comes from: this is what makes a turn started here
        // recognisable, and the ones that matter most announce themselves in a
        // conversation she has already walked out of.
        if (heard.type === 'message.updated') this.readMessage(heard.properties.info)
        if (from && from !== this.sessionId) {
          if (heard.type === 'session.idle') this.ended = from
          this.turnDown(from, heard)
          continue
        }
        this.read(heard)
      }
    } catch (trouble) {
      return this.dropped(mine, said(trouble))
    }
    this.dropped(mine)
  }

  /**
   * The stream, given up on. It puts itself back together across a hiccup, so
   * it only runs out of attempts when the server is not coming back — and from
   * then on every prompt is posted into nothing at all, silently, which is the
   * worst way for her to be gone.
   */
  private dropped(mine: number, detail?: string) {
    if (this.spent(mine)) return
    this.raise({
      title: 'She stopped answering',
      body: 'The connection to the server behind her dropped. Nothing said to her can arrive until she is opened again.',
      detail,
      gone: true,
    })
  }

  /** Something in the way, on its way to the screen. */
  private raise(trouble: Trouble | null) {
    this.troubled = trouble !== null
    this.onEvent({ kind: 'trouble', trouble })
  }

  /** Anything else the stream carries is somebody else's business, and there is
   * more of it than there is of this — the union it is read through is not even
   * the whole of what arrives. */
  private read(heard: Heard) {
    switch (heard.type) {
      case 'message.part.updated':
        return this.readPart(heard.properties.part)
      case 'message.part.delta':
        return this.readDelta(heard.properties)
      case 'permission.asked':
        return this.readPermission(heard.properties)
      case 'question.asked':
        return this.readQuestion(heard.properties)
      case 'session.idle':
        return this.finish()
      case 'session.error':
        return this.readError(heard.properties.error)
    }
  }

  /**
   * A part announcing itself. Two of them matter: the one that says a run of
   * deltas was her speaking rather than thinking, and the one that says she has
   * picked up a tool.
   */
  private readPart(part: Part) {
    const known = this.parts.get(part.id)
    this.parts.set(part.id, { kind: part.type, held: known?.held ?? '' })

    if (part.type === 'text' && known?.held) {
      this.speak(part.id, known.held)
      this.parts.set(part.id, { kind: part.type, held: '' })
    }

    if (part.type === 'tool') {
      const { state, callID: call, tool } = part
      if (state.status === 'running' && !this.narrated.has(call)) {
        this.narrated.add(call)
        this.onEvent({ kind: 'doing', label: narrate(tool, state.input) })
      }
      // Put down, one way or the other. It is worth a word of its own because
      // the 地の文 cannot say it: that line says what she is doing and is still
      // saying it when she has stopped, and whether a command came back wrong
      // is the half of a turn she does not always mention out loud.
      const over = state.status === 'completed' || state.status === 'error'
      if (over && !this.putDown.has(call)) {
        this.putDown.add(call)
        // One that did not go through is said in the words it was being done
        // in rather than in the past: she was writing that file, and "wrote"
        // is a claim that it is written — which is the one thing that did not
        // happen. A tool refused at the box counts as that too.
        const wrong = state.status === 'error'
        this.onEvent({
          kind: 'whispers',
          whisper: wrong
            ? { text: narrate(tool, state.input), kind: 'failed' }
            : { text: justDid(tool, state.input), kind: 'did' },
        })
      }
    }
  }

  /**
   * A few more words. Which part they belong to decides whether they are hers
   * to say: a part not yet announced is held, because the announcement is what
   * tells thinking apart from speech.
   */
  private readDelta({ partID, field, delta }: SaidMore) {
    if (field !== 'text') return
    const part = this.parts.get(partID)
    if (!part) return void this.parts.set(partID, { kind: 'unknown', held: delta })
    if (part.kind === 'unknown') return void this.parts.set(partID, { ...part, held: part.held + delta })
    if (part.kind !== 'text') return
    this.speak(partID, delta)
  }

  /** Words that are hers, on their way to the box. Her line is sent whole each
   * time rather than as the piece that just arrived: the marker at the end is
   * only recognisable against the whole of it, and so is where she stopped
   * talking and started writing. */
  private speak(partID: string, text: string) {
    // A new part starts a new paragraph. They are one answer but not one
    // sentence, and a report that begins a part of its own would otherwise be
    // stuck onto the end of the last thing she said — where nothing can see
    // that it starts a line.
    if (this.saying !== null && this.saying !== partID) this.said += '\n\n'
    this.saying = partID
    this.said += text
    const { line, expression, marker } = readMood(this.said)
    const { line: spoken, report } = splitReport(line)
    this.onEvent({ kind: 'says', line: spoken, expression: expression ?? undefined, mood: marker ?? undefined })
    // Sent as it grows rather than at the end of the turn: the whole point is
    // that the long half never reaches the one line she has to talk in. Taken
    // back the same way — a `#` on its own is a heading until the character
    // after it turns out to be a hashtag, and a page offered over that would
    // still be offered at the end of the turn with nothing in it.
    if (report || this.wrote) {
      this.wrote = report !== null
      this.onEvent({ kind: 'reports', report })
    }
  }

  private readPermission(asked: AskedPermission) {
    this.asked.add(asked.id)
    this.onEvent({
      kind: 'ask-permission',
      askId: asked.id,
      toolName: asked.permission,
      ...asking(asked.permission, asked.metadata),
    })
  }

  private readQuestion(asked: AskedQuestion) {
    this.choosing.add(asked.id)
    this.onEvent({ kind: 'ask-choice', askId: asked.id, questions: questionsIn(asked) })
  }

  /**
   * A turn the server ended itself. Most of what comes back is this turn's
   * business and hers to say out loud — but a provider she has no credentials
   * for is not: nothing said to her on that model will get through either, so
   * it is put where the input was, with the thing to go and do about it. She is
   * still standing there, and picking another model is the shorter way out.
   */
  private readError(error?: SessionTrouble) {
    if (error?.name !== 'ProviderAuthError') return this.finish(JSON.stringify(error))
    const { providerID: provider, message } = error.data
    this.raise({
      title: `She is not signed in to ${provider}`,
      body: `opencode has no credentials for ${provider}, so nothing can be run on it. Connect it in opencode, or have her think with a model from somewhere else.`,
      detail: message,
      gone: false,
    })
    this.finish()
  }

  /** The turn, closed out. Her line and the face she signed it with are already
   * on screen — the stream carried them — so there is nothing left to say but
   * that she has stopped, and why, if it was not her idea. */
  private finish(error?: string) {
    // The turn just moved this conversation to the top of the list and changed
    // how long ago it was last spoken in. Said before the turn is closed out
    // rather than after, and whether or not this window was watching it: a turn
    // started before an earlier conversation was picked up and back out of is
    // still a turn that ended in it.
    if (this.client) void this.tellTalks(this.client, this.opening)
    if (!this.working) return
    this.working = false
    this.onEvent({ kind: 'done', error })
  }

  ask(prompt: string) {
    if (!this.client || !this.sessionId) return
    const mine = this.opening
    // The first thing said in a conversation is what it is called from then on.
    if (this.unnamed === this.sessionId) {
      this.unnamed = null
      void this.name(this.client, this.sessionId, prompt, mine)
    }
    this.working = true
    // Under an id of this window's minting, which is what makes the turn it
    // starts this window's to recognise afterwards. Any id will do — a
    // conversation is kept in the order things happened in it rather than by
    // id — and all that matters is that no two of them are ever the same.
    const sentAs = `msg_${crypto.randomUUID()}`
    this.sent.add(sentAs)
    this.turns++
    this.said = ''
    this.saying = null
    this.wrote = false
    this.parts.clear()
    this.narrated.clear()
    this.putDown.clear()
    void this.client.session
      .promptAsync({
        path: { id: this.sessionId },
        // The model goes with the prompt rather than being set on the session:
        // that is the whole of what makes swapping it take from the next turn on
        // without anything being restarted.
        body: { messageID: sentAs, model: halves(this.model), parts: [{ type: 'text', text: prompt }] },
      })
      // A sentence that could not even be posted says the same thing the stream
      // is about to take a few seconds to work out, and says it while he is
      // still looking at the sentence: there is no server on the other end.
      .catch((trouble) => this.dropped(mine, said(trouble)))
  }

  use(model: string) {
    this.model = model
    this.tellModel()
  }

  /** A conversation, named — and the list said again, so that the row for the
   * one being talked in stops reading as the blank it was opened as. Swallowed
   * if the server will not have it: a conversation under a poor name is worth
   * more than a sentence that did not go. */
  private async name(client: OpencodeClient, id: string, prompt: string, mine: number) {
    await client.session.update({ path: { id }, body: { title: nameFor(prompt) } }).catch(() => null)
    if (this.spent(mine)) return
    await this.tellTalks(client, mine)
  }

  answer(askId: string, allow: boolean) {
    if (!this.client || !this.sessionId || !this.asked.delete(askId)) return
    void this.client.postSessionIdPermissionsPermissionId({
      path: { id: this.sessionId, permissionID: askId },
      body: { response: allow ? 'once' : 'reject' },
    })
  }

  choose(askId: string, answers: string[][]) {
    if (!this.live || !this.choosing.delete(askId)) return
    void this.live.question.reply({ requestID: askId, answers })
  }

  /** Rejected, in the server's word for it: the tool comes back to her as
   * refused rather than answered, and she goes on from there. */
  decline(askId: string) {
    if (!this.live || !this.choosing.delete(askId)) return
    void this.live.question.reject({ requestID: askId })
  }

  /**
   * One of the earlier conversations, picked up.
   *
   * Nothing is torn down and nothing is restarted: the server behind her holds
   * every session it has ever had in this folder, so going back into one is a
   * matter of which id the next prompt goes into.
   *
   * Whatever she was in the middle of is left running where it is. It belongs
   * to the conversation being left, not to this one — and it finishes there and
   * is waiting in it whenever it is opened again, which is a better answer than
   * throwing the answer away because somebody looked at something else.
   */
  resume(id: string) {
    const client = this.client
    const before = this.sessionId
    if (!client || id === before) return
    // Moved into now rather than when the server has answered. Nothing on
    // screen says a pick has not landed yet — the list is gone and the line is
    // there to be typed on — so a sentence written in the moment between is
    // meant for the conversation that was picked, and posting it into the one
    // being left would lose it and her answer to it with no sign of either.
    this.sessionId = id
    // Whether she was in the middle of something on the way out. Read before
    // it is let go of, because the read back can fail and put her back in it —
    // and a turn nobody is watching for the end of never ends on screen.
    const mid = this.working
    // Nothing ended while nobody was in it before this pick was asked for.
    this.ended = null
    this.forget()
    if (before) this.letGo(before)
    void this.pickUp(client, id, before, ++this.picking, this.opening, mid)
  }

  /**
   * A new conversation, opened on the same server.
   *
   * Nothing is torn down here either. The girl is fixed to the server and the
   * folder to the client, and the model travels with each prompt — so a new
   * conversation is one more session on a server that already holds every
   * session this folder has ever had, and all three of them come along
   * untouched.
   *
   * Whatever she was in the middle of is stopped on the way out, which is where
   * this parts company with picking an earlier conversation up: that answer is
   * still worth having when the conversation is opened again, and this one is
   * being walked away from — left running, it would go on being paid for and
   * arrive in a conversation nobody is going to read.
   */
  begin() {
    const client = this.client
    if (!client) return
    // Which turn is being stopped, if one is: the one that was running when the
    // key was pressed, and not whatever is running when the server answers. A
    // sentence sent in between was meant for the conversation still on screen,
    // and the turn it starts is not this one's to kill.
    void this.openFresh(client, this.working ? this.turns : null, this.picking, this.opening)
  }

  /**
   * The new conversation, opened, and only then moved into.
   *
   * The other way round, the screen would be cleared over a session that does
   * not exist yet: for as long as there is nowhere else to be, a sentence typed
   * belongs to the conversation that is on screen, and that is still this one.
   * So a server that will not open one leaves everything exactly as it was, and
   * says so.
   */
  private async openFresh(client: OpencodeClient, stopping: number | null, mine: number, attempt: number) {
    const opened = await client.session.create({}).catch(() => null)
    // Or an earlier conversation was taken off the list over the top of this,
    // and the conversation being opened here is one nobody asked for any more.
    if (this.spent(attempt) || mine !== this.picking) return
    const id = opened?.data?.id
    if (!id) {
      // Nothing has been given up for this: a conversation still being read
      // back is still the one she is being moved into, and this says she is
      // where she is because she is.
      return this.raise({
        title: 'A new conversation could not be started',
        body: 'The server behind her would not open one. She is still in the one she was already in, and what is said next goes into that.',
        detail: opened?.error ? said(opened.error) : 'the server did not answer',
        gone: false,
      })
    }
    // Only now is this the conversation being opened, and any other still
    // being read back given up on. Claimed here rather than at the key press,
    // so that one that could not be opened leaves that one alone.
    this.picking++
    const before = this.sessionId
    if (before) {
      // Her turn is stopped where it stands, and whatever it was waiting on is
      // refused: after this there is nobody left who could answer it, and a
      // question nobody answers holds that turn open on the server for ever.
      if (stopping !== null && stopping === this.turns) {
        void client.session.abort({ path: { id: before } }).catch(() => null)
      }
      // Still listened to even where it was told to stop: a turn does not end
      // the moment the abort is posted, and it can get a question in first.
      this.letGo(before)
    }
    this.sessionId = id
    // Named by the first thing said in it, the same as the one the window
    // opened with.
    this.unnamed = id
    this.forget()
    // Nothing said in it yet, which is the whole of where it was left.
    this.onEvent({ kind: 'picks-up', line: '', report: null })
    await this.tellTalks(client, attempt)
  }

  /** Everything half-said, let go of: the words of a turn this window has
   * stopped watching, and what they were being read as. They belong to the
   * conversation they were being said into, and she is not in it any more. */
  private forget() {
    this.working = false
    this.said = ''
    this.saying = null
    this.wrote = false
    this.parts.clear()
    this.narrated.clear()
    this.putDown.clear()
  }

  /**
   * Whatever the conversation being left was waiting on, refused on the way
   * out — and the turn left running there kept an ear on, for whatever it asks
   * for next.
   *
   * A tool she is waiting to be allowed holds the turn open on the server until
   * somebody answers it, and after this nobody can: the question is off the
   * screen with the conversation it belongs to, and the window will not take an
   * answer for an id it is no longer holding. Refused, the turn goes on and
   * ends where it belongs. Left, it waits for ever, and so does anything said
   * into that conversation afterwards.
   */
  private letGo(from: string) {
    for (const askId of this.asked) this.refuse(from, askId)
    this.asked.clear()
    for (const askId of this.choosing) this.refuseChoice(askId)
    this.choosing.clear()
  }

  /**
   * Her side of a sentence sent from here, announcing itself.
   *
   * The server mints its own id for it, and that is the id everything the turn
   * goes on to ask for is asked under — so this is where a turn started here
   * becomes recognisable, and it is the only place it can be. The link is the
   * sentence it is answering, which was sent under an id of this window's.
   */
  private readMessage(info: Message) {
    if (info.role !== 'assistant') return
    if (!this.sent.has(info.parentID)) return
    this.hers.add(info.id)
  }

  /**
   * A turn asking for something in a conversation she is not in — and, where it
   * is one of this window's own, turned down where it stands.
   *
   * A turn is deliberately left running when she walks out on it: its answer is
   * worth having when the conversation is opened again. But it can go on
   * wanting a tool allowed or a question of hers answered for as long as it
   * runs, and that cannot be put on screen — it belongs to a conversation
   * nobody is in. Refused, the same way anything it was already waiting on was
   * refused on the way out, it carries on and ends where it belongs; left, it
   * holds the turn open for ever.
   *
   * Which it is comes off the id it asks under, and that is the whole of the
   * question. It is not whether that conversation is busy — this window cannot
   * know that, and what the server says about it lags what it has taken by a
   * few hundred milliseconds anyway. It is whether this window started the turn
   * doing the asking, which it does know, because it minted the id the turn
   * grew out of. Anything else is somebody else's opencode working in the same
   * folder, and theirs to answer.
   */
  private turnDown(from: string, heard: Heard) {
    switch (heard.type) {
      case 'permission.asked': {
        // The turn asking is under `tool`, beside the call that wants the
        // permission. One raised any other way says nothing about whose turn it
        // is, and there is nothing to go on.
        const asked = heard.properties
        if (this.hers.has(asked.tool?.messageID ?? '')) this.refuse(from, asked.id)
        return
      }
      case 'question.asked': {
        // A question raised by the tool she asks with says which turn asked it.
        // One raised any other way says nothing, and there is nothing to go on.
        const asked = heard.properties
        if (this.hers.has(asked.tool?.messageID ?? '')) this.refuseChoice(asked.id)
      }
    }
  }

  /** One tool she is waiting to be allowed, turned down. */
  private refuse(from: string, askId: string) {
    void this.client
      ?.postSessionIdPermissionsPermissionId({
        path: { id: from, permissionID: askId },
        body: { response: 'reject' },
      })
      .catch(() => null)
  }

  /** One question of hers, turned down. It goes by the request it was raised
   * as and nothing else: the newer client answers a question wherever it was
   * asked. */
  private refuseChoice(askId: string) {
    void this.live?.question.reject({ requestID: askId }).catch(() => null)
  }

  /**
   * The conversation being opened, read back: it is the one that says where it
   * was left, and it is also the one that says the conversation is still there.
   * Deleted from an opencode window somewhere else since the list was drawn,
   * she is put back where she was and told so — silently left in a session that
   * is not there, nothing said to her would arrive.
   */
  private async pickUp(
    client: OpencodeClient,
    id: string,
    before: string | null,
    mine: number,
    attempt: number,
    mid: boolean,
  ) {
    const found = await client.session.messages({ path: { id }, query: { limit: READ_BACK } }).catch(() => null)
    // Or another row was taken over the top of this one, and this answer is
    // about a conversation nobody is in any more.
    if (this.spent(attempt) || mine !== this.picking) return
    if (!found?.data) {
      // Put back where she was — but only where nothing has gone into the
      // conversation that was picked. A sentence written before this landed is
      // already in that one and she is already answering it: moving her back
      // out would leave the answer streaming into a session the window has
      // stopped listening to, and the next sentence going somewhere else
      // again. Then all that failed is the reading back, and that is all this
      // says.
      const moved = this.working
      if (!moved) {
        this.sessionId = before
        // Back in the turn as well as in the conversation: it is still running
        // there, and its end is what puts her down on screen. Let go of on the
        // way out and not taken back up, that end arrives to nobody and she is
        // left working for ever.
        this.working = mid
        // Unless it is already over. A read back the server is slow to refuse
        // is long enough for that turn to finish, and the word that it has is
        // one event that came while she was between conversations. It is said
        // here instead, which is the first moment there is anyone to say it to.
        if (this.ended === before) this.finish()
      }
      return this.raise({
        title: moved ? 'That conversation could not be read back' : 'That conversation could not be opened',
        body: moved
          ? 'The server behind her would not say what was in it, so the last thing she said there is not on screen. She is in it all the same, and what has just been said to her has gone into it.'
          : 'The server behind her has no record of it any more. She is back in the one she was already in.',
        detail: found?.error ? said(found.error) : 'the server did not answer',
        gone: false,
      })
    }
    // Only while nothing has been said since. A sentence written before this
    // landed is already in this conversation and she is already answering it —
    // and where the conversation used to be left is not worth wiping that for.
    if (!this.working) this.onEvent({ kind: 'picks-up', ...lastSaid(found.data) })
    await this.tellTalks(client, attempt)
  }

  /**
   * Open her again, from wherever the last attempt got to. What that attempt
   * left behind goes first — a half-started server, the leavings of a turn that
   * will never finish — and the trouble comes off the screen as this starts, so
   * pressing it is visibly something happening rather than a key that does
   * nothing.
   *
   * The session id is the one thing kept: it is what the next attempt reopens
   * the conversation by, and letting go of it here is what would make every
   * reconnect a fresh start.
   */
  retry() {
    if (this.closed) return
    this.stopListening.abort()
    this.server?.close()
    this.client = null
    this.live = null
    this.server = null
    this.working = false
    this.said = ''
    this.parts.clear()
    this.narrated.clear()
    this.putDown.clear()
    this.asked.clear()
    this.choosing.clear()
    // Whatever was left running belonged to the server that has just been shut,
    // and there is nothing left of it to listen to.
    this.raise(null)
    void this.start()
  }

  interrupt() {
    if (!this.client || !this.sessionId) return
    void this.client.session.abort({ path: { id: this.sessionId } })
    this.working = false
  }

  close() {
    this.closed = true
    // Or the stream goes on reaching for a server that has been shut, for as
    // long as the window is open.
    this.stopListening.abort()
    this.server?.close()
  }
}
