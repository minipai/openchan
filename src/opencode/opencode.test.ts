import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import type { BridgeEvent } from '../between/protocol'

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
/**
 * Every session on disk, by id: the ones the servers here opened and the ones a
 * test planted to have been talked in before. What is in each of them is kept
 * too — going back into one is a matter of reading it.
 */
const onDisk = new Map<string, PastSession & { messages: PastMessage[] }>()

/** When a session opened here was opened. Everything a test plants is older, so
 * the one she is in is the top of the list, as it is on a real server. */
const NOW = 1_000_000

/** One conversation already on disk when the window opens, with a line of hers
 * at the end of it. */
function planted(id: string, title: string, when: number, said: string, parentID?: string) {
  onDisk.set(id, {
    id,
    title,
    ...(parentID ? { parentID } : {}),
    time: { created: when - 1000, updated: when },
    messages: [
      { info: { role: 'user' }, parts: [{ type: 'text', text: 'go on then' }] },
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: said }] },
    ],
  })
}
/** Every prompt posted, by the session it went into. */
const prompted: string[] = []
/** The model each of them went out under, in order. */
const promptedOn: (string | null)[] = []
const streams: Stream[] = []
let sessions = 0
/** Whether the next server asked for refuses to start. */
let wontStart = false
/** Whether the next stream asked for cannot be opened. */
let wontListen = false
/** What the next look-up of a session answers with, instead of looking. */
let lookupSays: { name: string } | null = null
/** Whether the next read of a conversation's messages throws rather than
 * answering — a server that is not there rejects rather than replying. */
let wontRead = false
/** Whether the next list of the folder's conversations throws. */
let wontList = false
/** While this is set, opening a session waits on it: the moment between a new
 * conversation being asked for and the server opening it, held open. */
let opening: Promise<void> | null = null
let letOpen: (() => void) | null = null
const holdOpens = () => void (opening = new Promise<void>((go) => (letOpen = go)))
const letOpensThrough = () => {
  letOpen?.()
  opening = null
  letOpen = null
}
/** While this is set, reading a conversation back waits on it: the moment
 * between a row being taken and the server answering, held open. */
let reading: Promise<void> | null = null
let letRead: (() => void) | null = null
const holdReads = () => void (reading = new Promise<void>((go) => (letRead = go)))
const letReadsThrough = () => {
  letRead?.()
  reading = null
  letRead = null
  opening = null
  letOpen = null
}
/** Every permission answered over HTTP, in order. */
const refused: { id: string; permissionID: string; response: string }[] = []
/** Every conversation stopped mid-turn, in order. */
const aborted: string[] = []
/** Whether the next session asked for cannot be opened. */
let wontOpen = false

/** The event stream: nothing, until the test says something over it or cuts
 * it. */
class Stream {
  private waiting: (() => void) | null = null
  private queued: unknown[] = []
  private cut: Error | null = null
  async *[Symbol.asyncIterator]() {
    for (;;) {
      while (this.queued.length) yield this.queued.shift()
      if (this.cut) throw this.cut
      await new Promise<void>((go) => (this.waiting = go))
    }
  }
  /** One event, as the server would publish it. */
  say(event: unknown) {
    this.queued.push(event)
    this.wake()
  }
  drop() {
    this.cut = new Error('the server went away')
    this.wake()
  }
  private wake() {
    const go = this.waiting
    this.waiting = null
    go?.()
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
        if (opening) await opening
        if (wontOpen) {
          wontOpen = false
          throw new Error('the server went away')
        }
        const id = `ses_${++sessions}`
        // Freshly opened and never spoken in: created and last touched at the
        // same moment, which is how the real one comes back too.
        onDisk.set(id, { id, title: 'New session', time: { created: NOW, updated: NOW }, messages: [] })
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
      list: async () => {
        if (wontList) {
          wontList = false
          throw new Error('the server went away')
        }
        return { data: [...onDisk.values()] }
      },
      update: async ({ path, body }: { path: { id: string }; body: { title: string } }) => {
        const one = onDisk.get(path.id)
        if (one) one.title = body.title
        return { data: one }
      },
      messages: async ({ path }: { path: { id: string } }) => {
        if (reading) await reading
        if (wontRead) {
          wontRead = false
          throw new Error('the server went away')
        }
        return onDisk.has(path.id)
          ? { data: onDisk.get(path.id)!.messages }
          : { error: { name: 'NotFoundError' } }
      },
      promptAsync: async ({
        path,
        body,
      }: {
        path: { id: string }
        body?: { model?: { providerID: string; modelID: string } }
      }) => {
        prompted.push(path.id)
        const model = body?.model
        promptedOn.push(model ? `${model.providerID}/${model.modelID}` : null)
        // The real server touches a session whenever anything lands in it,
        // which is how one that was only ever opened is told from one that was
        // talked in.
        const one = onDisk.get(path.id)
        if (one) one.time.updated = NOW + prompted.length
        return {}
      },
      abort: async ({ path }: { path: { id: string } }) => {
        aborted.push(path.id)
        return {}
      },
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
    postSessionIdPermissionsPermissionId: async ({
      path,
      body,
    }: {
      path: { id: string; permissionID: string }
      body: { response: string }
    }) => {
      refused.push({ ...path, response: body.response })
      return {}
    },
  }),
}))

import { MaidSession } from './opencode'
import type { PastMessage, PastSession } from './talks'
import { CAST } from '../her/cast'

beforeEach(() => {
  servers.length = 0
  onDisk.clear()
  prompted.length = 0
  promptedOn.length = 0
  streams.length = 0
  sessions = 0
  wontStart = false
  wontListen = false
  wontRead = false
  wontList = false
  reading = null
  letRead = null
  lookupSays = null
  refused.length = 0
  aborted.length = 0
  wontOpen = false
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
  /** The stream the live attempt is listening to, for the test to speak over. */
  const stream = () => streams[streams.length - 1]!
  return {
    her,
    events,
    troubles,
    stream,
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

test('every conversation the folder has is offered, with the one she is in marked', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { events } = await opened()

  const talks = events.filter((event) => event.kind === 'talks').at(-1)
  expect(talks?.talks.map((one) => one.title)).toEqual(['Nothing said in it yet', 'Where the needle was'])
  expect(talks?.current).toBe('ses_1')
})

test('an earlier conversation is picked up where it was left, and the next thing said goes into it', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.【 proud ᕙ( •̀ ᗜ •́)ᕗ 】')
  const { her, events } = await opened()
  her.ask('good morning')

  her.resume('ses_old')
  await until('picked the old conversation up', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('and which haystack was that?')

  // One server throughout: nothing was torn down, only the id the prompt goes
  // into changed.
  expect(servers).toHaveLength(1)
  expect(prompted).toEqual(['ses_1', 'ses_old'])
  // And the screen is where that conversation was left, not where this one was.
  const up = events.find((event) => event.kind === 'picks-up')
  expect(up?.line).toBe('It was in the second haystack.')
  expect(up?.expression).toBe('proud')
  // The list says which one she is in now, so it opens marking the right row.
  expect(events.filter((event) => event.kind === 'talks').at(-1)?.current).toBe('ses_old')
})

test('the conversation she is already in is not picked up again', async () => {
  const { her, events } = await opened()
  const before = events.length

  her.resume('ses_1')
  await new Promise((tick) => setTimeout(tick, 5))

  expect(events.slice(before)).toEqual([])
})

test('a conversation that is not there any more says so, and leaves her where she is', async () => {
  const { her, events, troubles } = await opened()
  her.ask('good morning')

  her.resume('ses_deleted')
  await until('said it could not be opened', () => troubles().length > 0)
  her.ask('are you still there?')

  // Still in the conversation she was in, and still able to be spoken to: this
  // is one she is standing behind rather than one that took her with it.
  expect(prompted).toEqual(['ses_1', 'ses_1'])
  expect(events.some((event) => event.kind === 'picks-up')).toBe(false)
  expect(troubles().at(-1)?.gone).toBe(false)
})

test('a new conversation is a fresh session on the same server, and nothing is stopped for it', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, events } = await opened()

  her.begin()
  await until('opened a new conversation', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('good morning')

  // One server throughout, and nobody interrupted: the girl is fixed to the
  // server and the folder to the client, so a new conversation is one more
  // session on what is already standing there.
  expect(servers).toHaveLength(1)
  expect(aborted).toEqual([])
  expect(prompted).toEqual(['ses_2'])
  // Nothing said in it yet, which is the whole of where it was left.
  expect(events.find((event) => event.kind === 'picks-up')?.line).toBe('')
  // And the list says she is in it, so it opens marking the right row.
  expect(events.filter((event) => event.kind === 'talks').at(-1)?.current).toBe('ses_2')
})

test('a turn still running is stopped when a new conversation is started over it', async () => {
  const { her, events } = await opened()
  her.ask('what colour is the sky?')

  her.begin()
  await until('opened a new conversation', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('good morning')

  // Nobody asking for a new conversation is coming back for the answer to the
  // last thing they asked, and a turn left running goes on being paid for.
  expect(aborted).toEqual(['ses_1'])
  expect(prompted).toEqual(['ses_1', 'ses_2'])
})

test('a sentence sent while the new conversation is being opened is left running', async () => {
  const { her, events } = await opened()
  her.ask('what colour is the sky?')

  // The key pressed while she is working, and another sentence typed into the
  // conversation still on screen before the server has opened the new one.
  holdOpens()
  her.begin()
  her.ask('and the sea?')
  letOpensThrough()
  await until('opened a new conversation', () => events.some((event) => event.kind === 'picks-up'))

  // The turn this was pressed over is long gone; what is running is the one
  // that was meant for the conversation being left, and it is left to finish
  // there.
  expect(aborted).toEqual([])
  expect(prompted).toEqual(['ses_1', 'ses_1'])
})

test('a tool she was waiting to be allowed is refused when a new conversation is started', async () => {
  const { her, events, stream } = await opened()
  stream().say({
    type: 'permission.asked',
    properties: { id: 'ask-1', sessionID: 'ses_1', permission: 'bash', metadata: { command: 'ls' } },
  })
  await until('put the question up', () => events.some((event) => event.kind === 'ask-permission'))

  her.begin()
  await until('opened a new conversation', () => events.some((event) => event.kind === 'picks-up'))

  // The question is off the screen with the conversation it belongs to, and
  // left alone it would hold that turn open on the server for ever.
  expect(refused).toEqual([{ id: 'ses_1', permissionID: 'ask-1', response: 'reject' }])
})

test('a new conversation the server will not open leaves her in the one she was in, and says so', async () => {
  const { her, events, troubles } = await opened()
  her.ask('good morning')

  wontOpen = true
  her.begin()
  await until('said it could not start one', () => troubles().length > 0)
  her.ask('are you still there?')

  // Nothing was given up until there was somewhere to go: she is still working
  // in the conversation she was in, and that is where the next thing said goes.
  expect(aborted).toEqual([])
  expect(prompted).toEqual(['ses_1', 'ses_1'])
  expect(events.some((event) => event.kind === 'picks-up')).toBe(false)
  expect(troubles().at(-1)?.gone).toBe(false)
})

test('a new conversation is thought with whatever the last one was', async () => {
  const { her, events } = await opened()
  her.use('anthropic/opus')

  her.begin()
  await until('opened a new conversation', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('good morning')

  // The model travels with each prompt rather than sitting on the session, so
  // there is nothing about a new one for it to be lost to.
  expect(promptedOn).toEqual(['anthropic/opus'])
})

test('a new conversation that could not be opened leaves one still being read back alone', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, events, troubles } = await opened()

  // A row taken, and a new conversation asked for before the server has said
  // what was in it.
  holdReads()
  her.resume('ses_old')
  wontOpen = true
  her.begin()
  await until('said it could not start one', () => troubles().length > 0)
  letReadsThrough()
  await until('picked the old conversation up', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('and which haystack was that?')

  // The pick is still the live one. Given up on here, the screen would have
  // stayed on the conversation being left while everything said went into the
  // one being opened — and the note would have said she was still in neither.
  expect(events.find((event) => event.kind === 'picks-up')?.line).toBe('It was in the second haystack.')
  expect(prompted).toEqual(['ses_old'])
})

test('the first thing said in a conversation is what it is called from then on', async () => {
  const { her, events } = await opened()

  her.ask('where was the needle?')
  await until('named the conversation', () =>
    events.some((event) => event.kind === 'talks' && event.talks.some((one) => one.title === 'where was the needle?')),
  )

  // Named once, by how it started: the next thing said does not rename it.
  her.ask('and the second haystack?')
  await new Promise((tick) => setTimeout(tick, 5))
  expect(onDisk.get('ses_1')?.title).toBe('where was the needle?')
})

test('a conversation the server will not answer for leaves her where she was, and says so', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, events, troubles } = await opened()
  wontRead = true

  her.resume('ses_old')
  await until('said it could not be opened', () => troubles().length > 0)
  her.ask('are you still there?')

  // A rejected read is the server being gone, not the window being over: she is
  // back in the conversation she was in and can still be spoken to.
  expect(prompted).toEqual(['ses_1'])
  expect(events.some((event) => event.kind === 'picks-up')).toBe(false)
  expect(troubles().at(-1)?.gone).toBe(false)
})

test('a second conversation taken before the first has been read back is the one she is in', async () => {
  planted('ses_a', 'The colours of the sky', 20_000, 'Grey.')
  planted('ses_b', 'Where the needle was', 30_000, 'In the second haystack.')
  const { her, events } = await opened()

  holdReads()
  her.resume('ses_a')
  her.resume('ses_b')
  letReadsThrough()
  await until('picked one up', () => events.some((event) => event.kind === 'picks-up'))
  her.ask('and then?')

  // The first row's answer is about a conversation nobody is standing in.
  expect(events.filter((event) => event.kind === 'picks-up').map((event) => event.line)).toEqual([
    'In the second haystack.',
  ])
  expect(prompted).toEqual(['ses_b'])
})

test('a sentence said before the conversation has been read back goes into the one that was picked', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, events } = await opened()

  holdReads()
  her.resume('ses_old')
  // Nothing on screen says the pick has not landed: the list is gone and the
  // line is there to be typed on.
  her.ask('and which haystack was that?')
  letReadsThrough()
  await until('said the list again', () => events.filter((event) => event.kind === 'talks').length > 1)

  expect(prompted).toEqual(['ses_old'])
  // And where it was left is not put over the answer she is already giving.
  expect(events.some((event) => event.kind === 'picks-up')).toBe(false)
})

test('a sentence already sent into the picked conversation keeps her in it when the read back fails', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, troubles } = await opened()

  holdReads()
  her.resume('ses_old')
  her.ask('and which haystack was that?')
  wontRead = true
  letReadsThrough()
  await until('said it could not be read back', () => troubles().length > 0)
  her.ask('and the first one?')

  // Put back where she was, that sentence would be answered into a session the
  // window has stopped listening to and the next one would go somewhere else
  // again. All that failed is the reading back, and that is all it says.
  expect(prompted).toEqual(['ses_old', 'ses_old'])
  expect(troubles().at(-1)?.title).toBe('That conversation could not be read back')
  expect(troubles().at(-1)?.gone).toBe(false)
})

test('a tool she was waiting to be allowed is refused when the conversation it was in is left', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { her, events, stream } = await opened()
  stream().say({
    type: 'permission.asked',
    properties: { id: 'ask-1', sessionID: 'ses_1', permission: 'bash', metadata: { command: 'ls' } },
  })
  await until('put the question up', () => events.some((event) => event.kind === 'ask-permission'))

  her.resume('ses_old')
  await until('picked the old conversation up', () => events.some((event) => event.kind === 'picks-up'))

  // Left alone it would hold that turn open on the server for ever: the
  // question is off the screen with the conversation it belongs to, and there
  // is nobody left who could answer it.
  expect(refused).toEqual([{ id: 'ses_1', permissionID: 'ask-1', response: 'reject' }])
})

test('a list the server will not give is not said as a folder with nothing in it', async () => {
  planted('ses_old', 'Where the needle was', 20_000, 'It was in the second haystack.')
  const { events, stream } = await opened()
  const said = () => events.filter((event) => event.kind === 'talks').length

  const before = said()
  wontList = true
  stream().say({ type: 'session.idle', properties: { sessionID: 'ses_1' } })
  await new Promise((tick) => setTimeout(tick, 10))

  // The list on screen is right, and saying nothing is better than saying there
  // is nothing — this is asked again at the end of every turn.
  expect(said()).toBe(before)
})

/** One tool part, as the server publishes it every time anything on it moves. */
const toolPart = (call: string, state: Record<string, unknown>) => ({
  type: 'message.part.updated',
  properties: {
    part: { id: `prt_${call}`, type: 'tool', callID: call, tool: 'bash', state: { input: { command: 'bun test' }, ...state } },
  },
})

test('a tool put down is a word of its own, said once however often the part says so', async () => {
  const { events, stream } = await opened()
  const whispers = () => events.filter((event) => event.kind === 'whispers')

  stream().say(toolPart('call_1', { status: 'running' }))
  await until('said what she was doing', () => events.some((event) => event.kind === 'doing'))

  // The part goes on announcing itself after it is over — twice here, and she
  // finished it once.
  stream().say(toolPart('call_1', { status: 'completed', title: 'bun test', output: 'ok' }))
  stream().say(toolPart('call_1', { status: 'completed', title: 'bun test', output: 'ok' }))
  await until('said she had put it down', () => whispers().length > 0)
  await new Promise((tick) => setTimeout(tick, 10))

  expect(whispers()).toHaveLength(1)
  // In the past, because the 地の文 is still saying she is at it: one line says
  // what she is doing and the other what came of it.
  expect(whispers()[0]).toEqual({ kind: 'whispers', whisper: { text: 'ran bun test', kind: 'did' } })
})

test('a tool that came back wrong is not said to have been done', async () => {
  const { events, stream } = await opened()
  const whispers = () => events.filter((event) => event.kind === 'whispers')

  stream().say(toolPart('call_2', { status: 'error', error: 'exit 1' }))
  await until('said it came back wrong', () => whispers().length > 0)

  // Still what she was at rather than what she did: a command refused at the
  // box comes back this way too, and it never ran at all.
  expect(whispers()[0]).toEqual({ kind: 'whispers', whisper: { text: 'running bun test', kind: 'failed' } })
})
