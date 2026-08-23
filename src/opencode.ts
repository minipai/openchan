import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { createOpencodeClient as createAnswering, type OpencodeClient as Answering } from '@opencode-ai/sdk/v2/client'
import { briefFor, type Character } from './cast'
import type { BridgeEvent, Conversation, Model, Question, Talk, Trouble } from './protocol'
import { readMood, splitReport } from './reply'

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
 * A model as opencode wants it named when it is being asked for: the two halves
 * of `provider/id`, apart. Nothing, if what came out of the environment is not
 * a model name at all — then the server keeps whatever it was started with,
 * which is a better answer than half a name.
 */
function halves(model: string) {
  const cut = model.indexOf('/')
  if (cut < 1 || cut === model.length - 1) return undefined
  return { providerID: model.slice(0, cut), modelID: model.slice(cut + 1) }
}

/**
 * Everything the server has to think with, flattened out of the providers it
 * answers with and put in one order — a list that came back grouped by whoever
 * happened to be configured first reads as no order at all.
 *
 * The label carries the provider as well as the model: the same model is
 * offered by several of them, and two rows reading `Claude Sonnet 4.5` with
 * nothing to tell them apart is worse than not offering the choice.
 */
export function modelsIn(providers: ProviderModels[]): Model[] {
  return providers
    .flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        id: `${provider.id}/${model.id}`,
        label: `${provider.name} · ${model.name}`,
      })),
    )
    .sort((one, other) => one.label.localeCompare(other.label))
}

/** As much of a provider as the list needs. */
export type ProviderModels = {
  id: string
  name: string
  models: Record<string, { id: string; name: string }>
}

/**
 * How much of the first sentence a conversation is named after: long enough to
 * know it by, short enough to stand in one row of a list. A paste is a whole
 * paragraph and would be neither.
 */
const NAME_AT_MOST = 60

/**
 * What a conversation comes to be called: the first thing said in it, on one
 * line.
 *
 * It has to be named from up here. opencode leaves a session called
 * `New session - <the moment it was opened>` for good — it names nothing
 * itself — and a list of those is one row printed over and over. What was
 * typed is the better name anyway: whoever is looking for a conversation is
 * looking for the one he remembers having, and what he said in it is what he
 * remembers.
 */
export function nameFor(prompt: string): string {
  const first = prompt.split('\n').map((one) => one.trim()).find(Boolean) ?? ''
  const letters = [...first]
  if (letters.length <= NAME_AT_MOST) return first
  return `${letters.slice(0, NAME_AT_MOST - 1).join('').trimEnd()}…`
}

/** As much of a session on disk as the list of conversations needs. */
export type PastSession = {
  id: string
  title: string
  /** Whose subagent this is, for the ones that are one. */
  parentID?: string
  time: { created: number; updated: number }
}

/**
 * The conversations worth going back to, out of every session the server holds
 * for this folder — most recently spoken in first, which is very nearly always
 * the order they are wanted in.
 *
 * Two kinds are left out. A session with a parent is a subagent's scratchpad,
 * opened by a tool she picked up and never spoken to by anyone; a folder worked
 * in for a week has more of those than real conversations. And a session
 * nothing was ever said in is not a conversation either — every window that
 * opened here and was closed again left one behind.
 *
 * The one she is in now is kept whichever of those it looks like: the list
 * marks where it stands, and a mark on a row that is not there is no mark.
 */
export function talksIn(sessions: PastSession[], current: string): Talk[] {
  return sessions
    .filter((one) => one.id === current || (!one.parentID && !unspoken(one)))
    .map((one) => ({
      id: one.id,
      // One nothing has been said in has nothing to be named after, and
      // opencode's own name for it is the moment it was opened written out in
      // full. It is only ever the one she is standing in.
      title: unspoken(one) ? 'Nothing said in it yet' : one.title,
      when: one.time.updated,
    }))
    .sort((one, other) => other.when - one.when)
}

/** Whether nothing was ever said in a session: opencode touches it whenever
 * anything lands in it, so one last touched when it was opened is empty. */
const unspoken = (one: PastSession) => one.time.updated === one.time.created

/** As much of a message as picking a conversation up needs: whose it was, and
 * the text in it. */
export type PastMessage = { info: { role: string }; parts: { type: string; text?: string }[] }

/**
 * How much of a conversation is read back to find where it was left. The server
 * gives the last of them, and one message is a whole turn of hers — tools and
 * all — so this is the last few turns, which is as far back as the last words
 * she said can be.
 *
 * Bounded because a conversation is as long as it is: a week-old one is
 * megabytes of tool output, and all of it would be read on the key press that
 * opens it.
 */
const READ_BACK = 4

/**
 * Where a conversation was left: the last thing she said in it, read back the
 * same way it was read as she said it — the 【…】 off the end of it, and the
 * page split from the line.
 *
 * The last of her messages that has words in it, rather than simply the last:
 * a turn cut off mid-tool leaves one with nothing said in it, and an empty box
 * is exactly what a resume that did nothing looks like. Its text parts are
 * joined the way they were spoken, a paragraph apart — she says something,
 * picks up a tool, and writes once she knows the answer, and glued end to end
 * those run into one sentence.
 */
export function lastSaid(messages: PastMessage[]) {
  const text = messages
    .filter((one) => one.info.role === 'assistant')
    .map((one) =>
      one.parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text!)
        .join('\n\n')
        .trim(),
    )
    .filter(Boolean)
    .at(-1)
  const { line, expression, marker } = readMood(text ?? '')
  const { line: spoken, report } = splitReport(line)
  return { line: spoken, expression: expression ?? undefined, mood: marker ?? undefined, report }
}

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

/** What she is doing, in words rather than in the tool's own name. */
function narrate(tool: string, input: Record<string, unknown>): string {
  const file = typeof input.filePath === 'string' ? path.basename(input.filePath) : null
  switch (tool) {
    case 'read':
      return file ? `reading ${file}` : 'reading'
    case 'edit':
    case 'write':
      return file ? `writing ${file}` : 'writing'
    case 'bash':
      return typeof input.command === 'string' ? `running ${input.command.split('\n')[0]}` : 'running a command'
    case 'grep':
      return typeof input.pattern === 'string' ? `looking for ${input.pattern}` : 'searching'
    case 'glob':
    case 'list':
      return 'going through the folder'
    case 'webfetch':
      return 'looking it up'
    case 'todowrite':
      return 'putting things in order'
    case 'question':
      return 'asking'
    default:
      return tool
  }
}

/** What the server says went wrong, as it names it. Only the names matter here
 * — one of them is trouble of its own and the rest are this turn's business. */
type SessionError = { name?: string; data?: { providerID?: string; message?: string } }

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

/** A question she asked with the answers written out, as the server raises
 * it: one request, carrying one or more questions, each with its options. */
type AskedQuestion = {
  id: string
  questions: {
    question: string
    header: string
    options: { label: string; description?: string }[]
    multiple?: boolean
  }[]
}

/**
 * Her questions, in the window's vocabulary: the same shape the server gives
 * them, less what the window has no use for. What goes back is the labels —
 * the server takes the answer as the label, not as a position in the list —
 * and a description the agent left empty is no description at all rather than
 * an empty line under the row.
 */
export function questionsIn(asked: AskedQuestion): Question[] {
  return asked.questions.map((one) => ({
    header: one.header,
    question: one.question,
    options: one.options.map(({ label, description }) => (description ? { label, description } : { label })),
    multiple: one.multiple ?? false,
  }))
}

/** A tool she may not use until he says so. The server names the tool under
 * `permission`, and older ones under `type` or `title`; what it would be used
 * for is under `metadata`, shaped by the tool. */
type AskedPermission = {
  id: string
  permission?: string
  type?: string
  title?: string
  metadata?: Record<string, unknown>
}

/**
 * What she would actually do with the tool she is asking for, off the
 * permission the server raised: the one line the box has room for, and the
 * whole of it for whoever wants to read before saying yes.
 *
 * The server shapes `metadata` by the tool — a command for bash, a path and a
 * unified diff for edit, an address for webfetch — so this is the one place
 * that knows those shapes, the same as `narrate` is for tool calls. Both halves
 * are given even when they say the same thing: the box shortens the line it
 * shows to whatever is left after the keys, and the long way round is how the
 * rest of it gets read.
 */
function asking(metadata: Record<string, unknown>): { summary?: string; detail?: string } {
  const { command, filepath, diff, url } = metadata as Record<string, string | undefined>
  if (typeof command === 'string') return { summary: command.split('\n')[0], detail: command }
  if (typeof filepath === 'string') {
    const near = path.relative(process.cwd(), filepath)
    return {
      summary: near && !near.startsWith('..') ? near : filepath,
      detail: typeof diff === 'string' ? hunks(diff) : undefined,
    }
  }
  if (typeof url === 'string') return { summary: url, detail: url }
  return {}
}

/** A unified diff with its preamble off. The server writes the path three
 * times above the first hunk and the box has already said which file this is —
 * what is worth the screen is the changed lines. */
function hunks(diff: string): string {
  // The start of a line, not anywhere: the path is written above the first
  // hunk three times, and a path with @@ in it would otherwise be the cut.
  const first = diff.search(/^@@/m)
  return (first === -1 ? diff : diff.slice(first)).trim()
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
  /** The newer client over the same server, for the one thing the older one
   * cannot say: the answer to a question she asked with choices. Everything
   * else stays on the older one — it is the one everything else is written
   * against, and swapping the whole of it over is not this file's errand. */
  private answering: Answering | null = null
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
  /** Calls already narrated. A tool announces itself again every time its
   * state moves — and one that had to wait to be allowed announces itself on
   * both sides of the wait — but she only picks it up once. */
  private narrated = new Set<string>()
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
    this.client = client
    this.answering = createAnswering({ baseUrl: started.url, directory: this.folder })

    // Listening is waited for rather than left running, and she is only
    // announced once it has taken: whoever was waiting to speak to her speaks
    // the moment this lands, and a prompt sent before the stream is open loses
    // the front of her answer.
    const stream = await client.event.subscribe({
      signal: stopListening.signal,
      sseMaxRetryAttempts: RECONNECTS,
    })
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
  private async listen(events: AsyncIterable<unknown>, mine: number) {
    try {
      for await (const event of events) {
        if (this.spent(mine)) return
        const props = (event as { properties?: Record<string, unknown> }).properties ?? {}
        if (props.sessionID && props.sessionID !== this.sessionId) continue
        this.read(event as { type: string; properties: Record<string, never> })
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
    this.onEvent({ kind: 'trouble', trouble })
  }

  private read(event: { type: string; properties: Record<string, never> }) {
    const props = event.properties as Record<string, unknown>
    switch (event.type) {
      case 'message.part.updated':
        return this.readPart(props.part as Record<string, unknown>)
      case 'message.part.delta':
        return this.readDelta(props as { partID: string; field: string; delta: string })
      // The running server says `asked`; the SDK's own types say `updated`.
      // They drift, so both are answered rather than picking a side.
      case 'permission.asked':
      case 'permission.updated':
        return this.readPermission(props as unknown as AskedPermission)
      case 'question.asked':
        return this.readQuestion(props as unknown as AskedQuestion)
      case 'session.idle':
        return this.finish()
      case 'session.error':
        return this.readError(props.error as SessionError | undefined)
    }
  }

  /**
   * A part announcing itself. Two of them matter: the one that says a run of
   * deltas was her speaking rather than thinking, and the one that says she has
   * picked up a tool.
   */
  private readPart(part: Record<string, unknown>) {
    const id = part.id as string
    const kind = part.type as string
    const known = this.parts.get(id)
    this.parts.set(id, { kind, held: known?.held ?? '' })

    if (kind === 'text' && known?.held) {
      this.speak(id, known.held)
      this.parts.set(id, { kind, held: '' })
    }

    if (kind === 'tool') {
      const state = part.state as { status: string; input?: Record<string, unknown> }
      const call = part.callID as string
      if (state?.status !== 'running' || this.narrated.has(call)) return
      this.narrated.add(call)
      this.onEvent({ kind: 'doing', label: narrate(part.tool as string, state.input ?? {}) })
    }
  }

  /**
   * A few more words. Which part they belong to decides whether they are hers
   * to say: a part not yet announced is held, because the announcement is what
   * tells thinking apart from speech.
   */
  private readDelta({ partID, field, delta }: { partID: string; field: string; delta: string }) {
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
      toolName: asked.permission ?? asked.type ?? asked.title ?? 'a tool',
      ...asking(asked.metadata ?? {}),
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
  private readError(error?: SessionError) {
    if (error?.name !== 'ProviderAuthError') return this.finish(JSON.stringify(error))
    const provider = error.data?.providerID ?? 'that provider'
    this.raise({
      title: `She is not signed in to ${provider}`,
      body: `opencode has no credentials for ${provider}, so nothing can be run on it. Connect it in opencode, or have her think with a model from somewhere else.`,
      detail: error.data?.message,
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
    this.said = ''
    this.saying = null
    this.wrote = false
    this.parts.clear()
    this.narrated.clear()
    void this.client.session
      .promptAsync({
        path: { id: this.sessionId },
        // The model goes with the prompt rather than being set on the session:
        // that is the whole of what makes swapping it take from the next turn on
        // without anything being restarted.
        body: { model: halves(this.model), parts: [{ type: 'text', text: prompt }] },
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
    if (!this.answering || !this.choosing.delete(askId)) return
    void this.answering.question.reply({ requestID: askId, answers })
  }

  /** Rejected, in the server's word for it: the tool comes back to her as
   * refused rather than answered, and she goes on from there. */
  decline(askId: string) {
    if (!this.answering || !this.choosing.delete(askId)) return
    void this.answering.question.reject({ requestID: askId })
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
    // Everything half-said goes with the conversation it was half-said in: the
    // parts held for it belong to a turn this window is no longer watching.
    this.working = false
    this.said = ''
    this.saying = null
    this.wrote = false
    this.parts.clear()
    this.narrated.clear()
    if (before) this.letGo(client, before)
    void this.pickUp(client, id, before, ++this.picking, this.opening)
  }

  /**
   * Whatever the conversation being left was waiting on, refused on the way out.
   *
   * A tool she is waiting to be allowed holds the turn open on the server until
   * somebody answers it, and after this nobody can: the question is off the
   * screen with the conversation it belongs to, and the window will not take an
   * answer for an id it is no longer holding. Refused, the turn goes on and
   * ends where it belongs. Left, it waits for ever, and so does anything said
   * into that conversation afterwards.
   */
  private letGo(client: OpencodeClient, from: string) {
    for (const askId of this.asked) {
      void client
        .postSessionIdPermissionsPermissionId({
          path: { id: from, permissionID: askId },
          body: { response: 'reject' },
        })
        .catch(() => null)
    }
    this.asked.clear()
    for (const askId of this.choosing) void this.answering?.question.reject({ requestID: askId }).catch(() => null)
    this.choosing.clear()
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
      if (!moved) this.sessionId = before
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
    this.answering = null
    this.server = null
    this.working = false
    this.said = ''
    this.parts.clear()
    this.narrated.clear()
    this.asked.clear()
    this.choosing.clear()
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
