import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { createOpencode } from '@opencode-ai/sdk'
import { faceFor, type Expression } from './expressions'
import type { BridgeEvent } from './protocol'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')

/**
 * Which model she thinks with. opencode names a model `provider/id`, and the
 * point of this whole exercise is that the provider is not fixed — so it is an
 * environment variable rather than a constant, and the default is a free one so
 * that starting her up never quietly spends the master's money.
 */
const MODEL = process.env.CAFE_MODEL ?? 'opencode/nemotron-3.5-lightning-free'

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
export class MaidSession {
  private client: Awaited<ReturnType<typeof createOpencode>>['client'] | null = null
  private server: Awaited<ReturnType<typeof createOpencode>>['server'] | null = null
  private sessionId: string | null = null
  private closed = false
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

  /** The folder she works in is the one she was started in — opencode takes
   * the process's own. */
  constructor(private onEvent: (event: BridgeEvent) => void) {}

  async start() {
    const started = await createOpencode({
      port: await freePort(),
      config: { model: MODEL, instructions: [writePersona()], permission: PERMISSION },
    })
    if (this.closed) return void started.server.close()
    this.client = started.client
    this.server = started.server

    const opened = await this.client.session.create({ body: { title: 'claudecafe' } })
    this.sessionId = (opened as { data?: { id: string } }).data?.id ?? null

    void this.listen()
  }

  /** Every event the server has, filtered down to this conversation. */
  private async listen() {
    const stream = await this.client!.event.subscribe()
    for await (const event of stream.stream) {
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
      body: { parts: [{ type: 'text', text: prompt }] },
    })
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
