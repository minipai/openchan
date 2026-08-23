import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { briefFor, type Character } from './cast'
import { faceFor, type Expression } from './expressions'
import type { BridgeEvent, Conversation, Model, Trouble } from './protocol'

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
 * Her line, split from the 【…】 she signs it with.
 *
 * The marker is not part of what she says — it is how she names her face — so
 * it comes off the line and is handed over separately, or the box shows it
 * twice. A marker still being written comes off too: it arrives a character at
 * a time and a half-typed one on screen reads as her stammering.
 */
function readMood(raw: string) {
  const marker = raw.match(/【[^【】]*】\s*$/)
  const line = raw.replace(/【[^【】]*】?\s*$/, '').trimEnd()
  if (!marker) return { line, expression: null as Expression | null, marker: null }
  return { line, expression: faceFor(marker[0]), marker: marker[0] }
}

/**
 * A line that is written rather than spoken: a heading, a fenced block, a list
 * item, a table row, a quotation, a rule.
 *
 * opencode has no notion of a report — an answer arrives as one text part whose
 * `text` grows a delta at a time, and that is all there is to go on. So what
 * counts as one is read off the writing itself, and these are the marks that do
 * not fit in a line of dialogue. A heading counts before its words arrive — the
 * hashes land a character at a time, and a line already known to be a heading
 * must not sit in the box waiting for them.
 */
const WRITTEN = /^ {0,3}(?:#{1,6}(?: |$)|```|~~~|[-*+] |\d+[.)] |\||> |(?:-{3,}|\*{3,})\s*$)/

/** How long a title is allowed to be before the frame it is written on runs
 * out of edge. Counted in characters rather than in what a terminal draws them
 * in — a Japanese heading is twice as wide as it is long, which is why this is
 * well under the width of the page. */
const AT_MOST = 40

/** The line that introduces it, as a title: the last thing she said before she
 * started writing, without the colon it was leading into. */
function shorten(text: string): string {
  const one = text.replace(/[:：]\s*$/, '').trim()
  const letters = [...one]
  if (letters.length <= AT_MOST) return one
  return `${letters.slice(0, AT_MOST - 1).join('').trimEnd()}…`
}

/**
 * Her answer, split into what she says and what she wrote.
 *
 * Everything from the first written line down is the report; what came before
 * it is what she says while handing it over. The split point only ever moves
 * forward as more of the answer arrives, so her line is fixed the moment there
 * is a report at all and is never taken back mid-sentence.
 *
 * An answer with no writing in it is left whole, which is most of them — a
 * couple of sentences must not go behind a key press.
 *
 * She often opens straight into a heading with nothing said in front of it.
 * Then the heading is what she says: the box has to hold something, an emptied
 * one reads as her having left the room, and what she titled it is her own
 * words for it. With neither a sentence nor a heading there is nothing she
 * could be saying, so that one is left whole too.
 */
export function splitReport(said: string): {
  line: string
  report: { title: string; body: string } | null
} {
  // She quotes files, and some of them come from Windows. The carriage returns
  // would go straight to the terminal.
  const text = said.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const at = lines.findIndex((one) => WRITTEN.test(one))
  if (at < 0) return { line: text, report: null }

  const body = lines.slice(at).join('\n').trim()
  // What she headed it with, if she headed it — and only on the first line of
  // it, so that a heading further down cannot rewrite the title on a page the
  // master already has open.
  const headed = body.split('\n')[0]!.match(/^ {0,3}#{1,6} +(.+)$/)?.[1]

  const lead = lines.slice(0, at).join('\n').trim()
  // The line that introduces it is the last thing she said before it, not the
  // first — a paragraph of preamble and then "here is what I found:" names the
  // page better than the preamble does.
  const introduces = lead.split('\n').filter((one) => one.trim()).at(-1)
  const names = headed ?? introduces
  if (!names) return { line: text, report: null }

  return { line: lead || names, report: { title: shorten(names), body } }
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
    this.client = client
    this.server = started
    this.stopListening = stopListening

    const opened = await client.session.create({ body: { title: 'claudecafe' } })
    if (this.spent(mine)) return drop()
    this.sessionId = (opened as { data?: { id: string } }).data?.id ?? null
    if (!this.sessionId) throw new Error('the server opened no session')

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
    if (!this.working) return
    this.working = false
    this.onEvent({ kind: 'done', error })
  }

  ask(prompt: string) {
    if (!this.client || !this.sessionId) return
    const mine = this.opening
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

  answer(askId: string, allow: boolean) {
    if (!this.client || !this.sessionId || !this.asked.delete(askId)) return
    void this.client.postSessionIdPermissionsPermissionId({
      path: { id: this.sessionId, permissionID: askId },
      body: { response: allow ? 'once' : 'reject' },
    })
  }

  /**
   * Open her again, from wherever the last attempt got to. What that attempt
   * left behind goes first — a half-started server, a session id pointing at
   * nothing, the leavings of a turn that will never finish — and the trouble
   * comes off the screen as this starts, so pressing it is visibly something
   * happening rather than a key that does nothing.
   */
  retry() {
    if (this.closed) return
    this.stopListening.abort()
    this.server?.close()
    this.client = null
    this.server = null
    this.sessionId = null
    this.working = false
    this.said = ''
    this.parts.clear()
    this.narrated.clear()
    this.asked.clear()
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
