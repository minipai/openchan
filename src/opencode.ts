import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk'
import { briefFor, type Character } from './cast'
import { faceFor, type Expression } from './expressions'
import type { BridgeEvent, Conversation, Model } from './protocol'

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

/** A tool she may not use until he says so. The server names the tool under
 * `permission`, and older ones under `type` or `title`. */
type AskedPermission = {
  id: string
  permission?: string
  type?: string
  title?: string
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
    try {
      await this.open()
    } catch (trouble) {
      // Unless this one was shut on the way up: swapping her closes a booting
      // server out from under itself, and the scene the complaint would land in
      // belongs to the girl who replaced her.
      if (this.closed) return
      // A server that never came up is invisible from everywhere else — the
      // window would sit at "waking her up…" for good, holding a sentence for a
      // session that is never going to open.
      this.onEvent({ kind: 'lost', why: `She could not be woken up — ${trouble}` })
    }
  }

  private async open() {
    const started = await createOpencodeServer({
      port: await freePort(),
      config: { model: MODEL, instructions: [writePersona(this.who)], permission: PERMISSION },
    })
    if (this.closed) return void started.close()
    this.server = started

    // The folder goes on the client rather than on the one call that opens the
    // session: opencode holds a server's folders apart from one another all the
    // way down, and the events are the half that catches anyone out. A session
    // opened in one folder publishes onto that folder's stream and no other, so
    // a client asking for the folder the window happens to have been started in
    // would leave her working perfectly and silently — nothing she said, nothing
    // she picked up and nothing she wanted permission for would ever arrive.
    this.client = createOpencodeClient({ baseUrl: started.url, directory: this.folder })

    const opened = await this.client.session.create({ body: { title: 'claudecafe' } })
    this.sessionId = (opened as { data?: { id: string } }).data?.id ?? null
    if (!this.sessionId) throw new Error('the server opened no session')

    // Listening is waited for rather than left running, and she is only
    // announced once it has taken: whoever was waiting to speak to her speaks
    // the moment this lands, and a prompt sent before the stream is open loses
    // the front of her answer.
    const stream = await this.client.event.subscribe()
    if (this.closed) return
    void this.listen(stream.stream)
    this.onEvent({ kind: 'ready' })

    // What she could think with, asked for once and after she is announced: the
    // server's answer does not change under her, and a picker that fetches its
    // own contents opens onto an empty box. Not being able to say what else she
    // could think with is not a reason to say she never woke up — she is up,
    // and the model she was started on works — so this one is swallowed rather
    // than allowed to take the session down with it.
    const listed = await this.client.config.providers().catch(() => null)
    if (this.closed) return
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
  private async listen(events: AsyncIterable<unknown>) {
    for await (const event of events) {
      if (this.closed) return
      const props = (event as { properties?: Record<string, unknown> }).properties ?? {}
      if (props.sessionID && props.sessionID !== this.sessionId) continue
      this.read(event as { type: string; properties: Record<string, never> })
    }
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
        return this.finish(JSON.stringify(props.error))
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
    })
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
    this.working = true
    this.said = ''
    this.saying = null
    this.wrote = false
    this.parts.clear()
    this.narrated.clear()
    void this.client.session.promptAsync({
      path: { id: this.sessionId },
      // The model goes with the prompt rather than being set on the session:
      // that is the whole of what makes swapping it take from the next turn on
      // without anything being restarted.
      body: { model: halves(this.model), parts: [{ type: 'text', text: prompt }] },
    })
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

  interrupt() {
    if (!this.client || !this.sessionId) return
    void this.client.session.abort({ path: { id: this.sessionId } })
    this.working = false
  }

  close() {
    this.closed = true
    this.server?.close()
  }
}
