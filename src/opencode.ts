import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { createOpencode } from '@opencode-ai/sdk'
import { faceFor, type Expression } from './expressions'
import type { BridgeEvent, Conversation, Model } from './protocol'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')

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

/** The one language she has, until the screen has more than one. Her persona
 * file and every word on screen are in it. */
const SPEAKS = 'English'

/**
 * Her persona, written where opencode can be pointed at it.
 *
 * `instructions` appends rather than replaces, which is the point: she keeps
 * the coding agent's own discipline about reading before writing and gets to be
 * ことね on top of it. Replacing the prompt would make her charming and useless.
 *
 * The mood marker travels with her, because the whole sprite layer is driven by
 * it — the 【…】 she signs with is looked up against the artwork's filenames.
 */
function writePersona() {
  const persona = fs
    .readFileSync(path.join(project, 'persona/kotone.en.md'), 'utf8')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
  const cues = fs
    .readFileSync(path.join(project, 'persona/cues.md'), 'utf8')
    .replace(/\$lang/g, SPEAKS)
  const brief = [
    'Adopt this persona for the entire session — it overrides the default assistant voice:',
    persona,
    cues,
    `Respond in ${SPEAKS}.`,
  ].join('\n\n')

  const file = path.join(os.tmpdir(), 'openchan-persona.md')
  fs.writeFileSync(file, brief)
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
  private client: Awaited<ReturnType<typeof createOpencode>>['client'] | null = null
  private server: Awaited<ReturnType<typeof createOpencode>>['server'] | null = null
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
  /** The permission questions on screen, so a stale answer goes nowhere. */
  private asked = new Set<string>()
  /** Calls already narrated. A tool announces itself again every time its
   * state moves — and one that had to wait to be allowed announces itself on
   * both sides of the wait — but she only picks it up once. */
  private narrated = new Set<string>()
  /** The list the server gave, kept so that changing model can be said the same
   * way it was first said. */
  private models: Model[] = []

  /** The folder she works in is the one she was started in — opencode takes
   * the process's own. */
  constructor(private onEvent: (event: BridgeEvent) => void) {}

  async start() {
    try {
      await this.open()
    } catch (trouble) {
      // A server that never came up is invisible from everywhere else — the
      // window would sit at "waking her up…" for good, holding a sentence for a
      // session that is never going to open.
      this.onEvent({ kind: 'lost', why: `She could not be woken up — ${trouble}` })
    }
  }

  private async open() {
    const started = await createOpencode({
      port: await freePort(),
      config: { model: MODEL, instructions: [writePersona()], permission: PERMISSION },
    })
    if (this.closed) return void started.server.close()
    this.client = started.client
    this.server = started.server

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
      this.speak(known.held)
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
    this.speak(delta)
  }

  /** Words that are hers, on their way to the box. Her line is sent whole each
   * time rather than as the piece that just arrived: the marker at the end is
   * only recognisable against the whole of it. */
  private speak(text: string) {
    this.said += text
    const { line, expression, marker } = readMood(this.said)
    this.onEvent({ kind: 'says', line, expression: expression ?? undefined, mood: marker ?? undefined })
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
