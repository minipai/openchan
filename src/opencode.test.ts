import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import type { BridgeEvent } from './protocol'

/**
 * opencode, with nothing behind it.
 *
 * As much of the SDK as opening her touches: a server that can be started and
 * closed, a session store that every server started here can see — opencode
 * keeps sessions in one database however many servers come and go, and that is
 * the whole of what makes reconnecting into one possible — and an event stream
 * the test can cut, which is what a server dying looks like from her side.
 */
const servers: { closed: boolean }[] = []
/** Every session any server here has opened, by id. */
const onDisk = new Set<string>()
/** Every prompt posted, by the session it went into. */
const prompted: string[] = []
const streams: Stream[] = []
let sessions = 0
/** Whether the next server asked for refuses to start. */
let wontStart = false
/** Whether the next stream asked for cannot be opened. */
let wontListen = false
/** What the next look-up of a session answers with, instead of looking. */
let lookupSays: { name: string } | null = null

/** The event stream: nothing, until the test cuts it. */
class Stream {
  private cut: ((trouble: Error) => void) | null = null
  async *[Symbol.asyncIterator]() {
    throw await new Promise<Error>((settle) => (this.cut = settle))
  }
  drop() {
    this.cut?.(new Error('the server went away'))
  }
}

mock.module('@opencode-ai/sdk', () => ({
  createOpencodeServer: async () => {
    if (wontStart) {
      wontStart = false
      throw new Error('opencode is not installed')
    }
    const server = {
      url: 'http://stand-in',
      closed: false,
      close() {
        this.closed = true
      },
    }
    servers.push(server)
    return server
  },
  createOpencodeClient: () => ({
    session: {
      create: async () => {
        const id = `ses_${++sessions}`
        onDisk.add(id)
        return { data: { id } }
      },
      get: async ({ path }: { path: { id: string } }) => {
        if (lookupSays) {
          const error = lookupSays
          lookupSays = null
          return { error }
        }
        return onDisk.has(path.id) ? { data: { id: path.id } } : { error: { name: 'NotFoundError' } }
      },
      promptAsync: async ({ path }: { path: { id: string } }) => {
        prompted.push(path.id)
        return {}
      },
      abort: async () => ({}),
    },
    event: {
      subscribe: async () => {
        if (wontListen) {
          wontListen = false
          throw new Error('the server went away')
        }
        const stream = new Stream()
        streams.push(stream)
        return { stream }
      },
    },
    config: { providers: async () => ({ data: { providers: [] } }) },
    postSessionIdPermissionsPermissionId: async () => ({}),
  }),
}))

import { MaidSession, modelsIn, type ProviderModels } from './opencode'
import { CAST } from './cast'

beforeEach(() => {
  servers.length = 0
  onDisk.clear()
  prompted.length = 0
  streams.length = 0
  sessions = 0
  wontStart = false
  wontListen = false
  lookupSays = null
})

/** Until something is true of what she has said, or it has had long enough. */
async function until(what: string, check: () => boolean) {
  for (let tries = 0; tries < 100 && !check(); tries++) await new Promise((tick) => setTimeout(tick, 0))
  if (!check()) throw new Error(`she never ${what}`)
}

/** Every session a test opened, closed afterwards. */
const sessionsOpened: MaidSession[] = []
afterEach(() => {
  for (const her of sessionsOpened.splice(0)) her.close()
})

/** Her, opened over the stand-in server, with everything she says kept. */
async function opened() {
  const events: BridgeEvent[] = []
  const her = new MaidSession((event) => events.push(event), CAST[0]!, '/somewhere')
  sessionsOpened.push(her)
  await her.start()
  const troubles = () => events.filter((event) => event.kind === 'trouble').map((event) => event.trouble)
  return {
    her,
    events,
    troubles,
    /** The server behind her going away, and her noticing. */
    lose: async () => {
      streams[streams.length - 1]!.drop()
      await until('noticed the server was gone', () => troubles().some((trouble) => trouble?.gone))
    },
    /** Opened again, and waited for, however it went: she is announced, or
     * the attempt says why not. */
    retry: async () => {
      const before = events.length
      her.retry()
      await until(
        'came back up, or said why not',
        () => events.slice(before).some((event) => event.kind === 'ready' || (event.kind === 'trouble' && event.trouble?.gone)),
      )
    },
  }
}

test('opening her again after the server went away carries on the same conversation', async () => {
  const { her, lose, retry, troubles } = await opened()
  her.ask('my secret word is pineapple')

  await lose()
  await retry()
  her.ask('what was my secret word?')

  // A second server, and the first one shut — but one session between them,
  // and it is the one the second prompt goes into.
  expect(servers).toHaveLength(2)
  expect(servers[0]!.closed).toBe(true)
  expect(prompted).toEqual(['ses_1', 'ses_1'])
  // Nothing on screen but the trouble being cleared: it is the same
  // conversation, and there is nothing to say about that.
  expect(troubles().at(-1)).toBeNull()
})

test('a conversation the server has no record of is started over, and she says so', async () => {
  const { her, lose, retry, events, troubles } = await opened()
  her.ask('my secret word is pineapple')

  await lose()
  onDisk.clear()
  await retry()
  her.ask('what was my secret word?')

  expect(prompted).toEqual(['ses_1', 'ses_2'])
  // Said plainly, before she is announced — so whatever was waiting for her
  // goes with the note already up — and said as something she is still
  // standing behind, because she is.
  const note = troubles().at(-1)
  expect(note?.title).toBe('She is starting over')
  expect(note?.gone).toBe(false)
  const kinds = events.map((event) => event.kind)
  expect(kinds.lastIndexOf('trouble')).toBeLessThan(kinds.lastIndexOf('ready'))
})

test('a lost conversation is still said to be lost when the attempt that replaced it did not get through', async () => {
  const { her, lose, retry, troubles } = await opened()
  her.ask('my secret word is pineapple')

  // The first attempt opens the new session and then dies before announcing
  // her — so the next attempt finds that session and reopens it. That is not
  // the conversation coming back, and must not be allowed to look like it.
  await lose()
  onDisk.clear()
  wontListen = true
  await retry()
  expect(troubles().at(-1)?.gone).toBe(true)

  await retry()
  her.ask('what was my secret word?')

  expect(prompted).toEqual(['ses_1', 'ses_2'])
  expect(troubles().at(-1)?.title).toBe('She is starting over')
})

test('a server that cannot say whether it knows the conversation has failed, not lost it', async () => {
  const { her, lose, retry, troubles } = await opened()
  her.ask('my secret word is pineapple')

  await lose()
  lookupSays = { name: 'InternalError' }
  await retry()

  // Said as the attempt failing, which can be tried again — and the next try
  // finds the conversation where it was.
  expect(troubles().at(-1)?.gone).toBe(true)
  await retry()
  her.ask('what was my secret word?')

  expect(prompted).toEqual(['ses_1', 'ses_1'])
  expect(troubles().at(-1)).toBeNull()
})

test('a server that never came up is simply tried again, not started over', async () => {
  wontStart = true
  const { her, retry, troubles } = await opened()
  expect(troubles().at(-1)?.gone).toBe(true)

  await retry()
  her.ask('are you there?')

  // There was no conversation to lose, so there is none to say she lost.
  expect(prompted).toEqual(['ses_1'])
  expect(troubles().at(-1)).toBeNull()
})

/** Two providers as the server answers with them, one of them offering the same
 * model under its own name. */
const PROVIDERS: ProviderModels[] = [
  {
    id: 'opencode',
    name: 'opencode',
    models: {
      'nemotron-3.5-lightning-free': { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning' },
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
]

test('every model every provider has is on the list, named the way opencode names it', () => {
  expect(modelsIn(PROVIDERS)).toEqual([
    { id: 'anthropic/claude-sonnet-4-5', label: 'Anthropic · Claude Sonnet 4.5' },
    { id: 'opencode/claude-sonnet-4-5', label: 'opencode · Claude Sonnet 4.5' },
    { id: 'opencode/nemotron-3.5-lightning-free', label: 'opencode · Nemotron 3.5 Lightning' },
  ])
})

test('the same model from two providers is two rows that can be told apart', () => {
  const listed = modelsIn(PROVIDERS).filter((model) => model.label.includes('Claude Sonnet 4.5'))

  expect(listed).toHaveLength(2)
  expect(new Set(listed.map((model) => model.label)).size).toBe(2)
})

test('a provider with nothing configured adds nothing to the list', () => {
  expect(modelsIn([{ id: 'lonely', name: 'Lonely', models: {} }])).toEqual([])
})
