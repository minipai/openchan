import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { act } from 'react'
import { testRender } from '@opentui/react/test-utils'
import { useMaid } from './brain'
import { briefFor, CAST, remember, remembered } from '../her/cast'
import { OPENED_IN } from './folder'
import type { BridgeEvent, OpenConversation } from './protocol'
import { LOST, MODELS, Stand, STUCK, TALKS } from '../opencode/stand'

/** The window, reduced to the two things this cares about. */
function Window({ open, hold }: { open: OpenConversation; hold: (maid: Maid) => void }) {
  const maid = useMaid(open)
  hold(maid)
  return <text>{maid.scene.isWorking ? 'working' : 'idle'}</text>
}

type Maid = ReturnType<typeof useMaid>

/** Whoever the master last sent for, put back afterwards: sending for one of
 * them writes her down for the next window, and the window these tests open is
 * reading the same note. */
const kept = remembered()
afterAll(() => remember(kept))

/** Somewhere to move her that is a real folder — the window refuses to open a
 * session onto one that is not there — and is gone again afterwards, which is
 * also what takes it back out of the note. */
const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openchan-been-')))
/** The note the master's own windows read, put back exactly as it was found:
 * moving her writes the folders down, and these tests move her to folders that
 * are nobody's. */
const NOTE = path.join(os.homedir(), '.openchan', 'folders')
const note = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : null
afterAll(() => {
  fs.rmSync(elsewhere, { recursive: true, force: true })
  if (note === null) fs.rmSync(NOTE, { force: true })
  else fs.writeFileSync(NOTE, note)
})
/** Every window here opens on ことね, whoever the last test sent for. */
const kotone = CAST.find((one) => one.id === 'kotone')!
beforeEach(() => remember(kotone))

/** Every window a test opened, so the next test starts on an empty terminal
 * rather than on top of the last one's. */
const opened: { renderer: { destroy(): void } }[] = []
afterEach(() => {
  for (const setup of opened.splice(0)) setup.renderer.destroy()
})

/**
 * One window over one stand-in, held open for the test to speak into.
 *
 * Everything said to it is settled before it is looked at — what is being
 * checked is what the window does *after* a state change, and that is an effect
 * rather than a render.
 */
async function open() {
  // Every session the window has opened, in order: swapping her closes one and
  // opens another, and which girl each was opened as is the whole question.
  const sessions: Stand[] = []
  let maid!: Maid
  const setup = await testRender(
    <Window
      open={(say, who, folder) => {
        const her = new Stand(say, who, folder)
        sessions.push(her)
        return her
      }}
      hold={(it) => (maid = it)}
    />,
    { width: 30, height: 3 },
  )
  const settle = async (work: () => void) => {
    await act(async () => work())
    await setup.flush()
  }
  await setup.flush()
  opened.push(setup)
  return {
    // The one the window opened with. The others are in `sessions`.
    her: sessions[0]!,
    sessions,
    // The latest render's, not the first: what is being checked is where the
    // window ended up.
    scene: () => maid.scene,
    pick: (model: string) => settle(() => maid.use(model)),
    sendFor: (id: string) => settle(() => maid.swapTo(id)),
    moveTo: (where: string) => settle(() => maid.moveTo(where)),
    folder: () => maid.folder,
    been: () => maid.been,
    stop: () => settle(() => maid.stop()),
    onShift: () => maid.onShift,
    nextShift: () => maid.nextShift,
    say: (prompt: string) => settle(() => maid.ask(prompt)),
    // Said by whoever is standing there now, the same as the rest of these.
    raise: (event: BridgeEvent) => settle(() => sessions[sessions.length - 1]!.raise(event)),
    allowAlways: (askId: string) => settle(() => maid.allowAlways(askId)),
    resumeTo: (id: string) => settle(() => maid.resumeTo(id)),
    startFresh: () => settle(() => maid.startFresh()),
    // Whoever is standing there now: after a swap that is the girl who walked
    // in, not the one whose session was closed behind her.
    wakeUp: () => settle(() => sessions[sessions.length - 1]!.wakeUp()),
    giveUp: () => settle(() => sessions[sessions.length - 1]!.giveUp()),
    getStuck: () => settle(() => sessions[sessions.length - 1]!.getStuck()),
    retry: () => settle(() => maid.retry()),
    dismiss: () => settle(() => maid.dismiss()),
    setup,
  }
}

test('nothing typed before she wakes up is sent, and she is not put to work', async () => {
  const { her, say, setup } = await open()

  await say('are you there?')

  expect(her.asked).toEqual([])
  expect(setup.captureCharFrame()).toContain('idle')
})

test('what was held goes the moment she wakes up', async () => {
  const { her, say, wakeUp, setup } = await open()

  await say('are you there?')
  await wakeUp()

  expect(her.asked).toEqual(['are you there?'])
  expect(setup.captureCharFrame()).toContain('working')
})

test('waking up twice does not say it twice', async () => {
  const { her, say, wakeUp } = await open()

  await say('are you there?')
  await wakeUp()
  await wakeUp()

  expect(her.asked).toEqual(['are you there?'])
})

test('something said once she is up goes straight to her', async () => {
  const { her, say, wakeUp, setup } = await open()

  await wakeUp()
  await say('good morning')

  expect(her.asked).toEqual(['good morning'])
  expect(setup.captureCharFrame()).toContain('working')
})

test('an empty line is not held and not sent', async () => {
  const { her, say, wakeUp, setup } = await open()

  await wakeUp()
  await say('   ')

  expect(her.asked).toEqual([])
  expect(setup.captureCharFrame()).toContain('idle')
})

test('nothing said to a session that never opened is posted into it', async () => {
  const { her, say, giveUp, scene, setup } = await open()

  await say('are you there?')
  await giveUp()
  await say('never mind — are you there?')

  expect(her.asked).toEqual([])
  expect(scene().trouble).toEqual(LOST)
  expect(setup.captureCharFrame()).toContain('idle')
})

test('opening her again carries what was said to her into the session that opens', async () => {
  const { her, say, giveUp, retry, wakeUp, scene } = await open()

  await say('are you there?')
  await giveUp()
  await retry()

  // The attempt is what says the trouble is over — the window sets nothing
  // itself, or a retry that fails would look like it had worked.
  expect(her.retries).toBe(1)
  expect(scene().trouble).toBeNull()

  await wakeUp()

  // And the sentence that was waiting through all of it goes, without the
  // window having been restarted.
  expect(her.asked).toEqual(['are you there?'])
  expect(scene().isReady).toBe(true)
})

test('trouble she is still standing behind is put away, and she goes on being spoken to', async () => {
  const { her, wakeUp, getStuck, dismiss, say, scene } = await open()

  await wakeUp()
  await getStuck()
  expect(scene().trouble).toEqual(STUCK)

  await dismiss()
  await say('good morning')

  // Nothing was reopened: it is the same session, and the box is hers to be
  // spoken to on again.
  expect(scene().trouble).toBeNull()
  expect(her.retries).toBe(0)
  expect(her.asked).toEqual(['good morning'])
})

test('what she can think with turns up with her, and the one she is', async () => {
  const { scene, wakeUp } = await open()

  expect(scene().models).toEqual([])
  await wakeUp()

  expect(scene().models).toEqual(MODELS)
  expect(scene().model).toBe('opencode/free')
})

test('picking a model hands it over, and she is the one who says it took', async () => {
  const { her, scene, wakeUp, pick } = await open()

  await wakeUp()
  await pick('anthropic/opus')

  expect(her.handed).toEqual(['anthropic/opus'])
  expect(scene().model).toBe('anthropic/opus')
})

test('nothing but picking one changes what she thinks with', async () => {
  // Everything else the window does to her leaves the model alone — putting a
  // list away without taking a row off it goes through none of this.
  const { her, scene, wakeUp, say } = await open()

  await wakeUp()
  await say('good morning')

  expect(her.handed).toEqual([])
  expect(scene().model).toBe('opencode/free')
})

test('sending for one of the others before anything is said brings her out now', async () => {
  const { her, sessions, sendFor, onShift } = await open()

  await sendFor('kurumi')

  // The session she would have been spoken to in is shut, and the one that
  // replaced it was opened as くるみ — which is the whole of what makes the
  // words it carries hers.
  expect(her.closed).toBe(true)
  expect(sessions.map((one) => one.who.id)).toEqual(['kotone', 'kurumi'])
  expect(briefFor(sessions[1]!.who)).toContain('くるみ')
  expect(onShift().id).toBe('kurumi')
})

test('the girl who walks in is not handed the scene the last one left', async () => {
  const { wakeUp, sendFor, scene } = await open()

  await wakeUp()
  expect(scene().isReady).toBe(true)

  await sendFor('kurumi')

  // Down to whether there is anyone to speak to: what was on screen belonged to
  // a session that has been closed.
  expect(scene().isReady).toBe(false)
  expect(scene().models).toEqual([])
})

test('sending for one of the others mid-conversation leaves the conversation alone', async () => {
  const { her, sessions, wakeUp, say, sendFor, onShift, nextShift } = await open()

  await wakeUp()
  await say('good morning')
  await sendFor('kurumi')

  // Nothing is opened and nothing is closed: her persona went into the agent
  // when it was started, so the only honest place to put くるみ is the next one.
  expect(sessions).toHaveLength(1)
  expect(her.closed).toBe(false)
  expect(onShift().id).toBe('kotone')
  // And she is not lost in the meantime — the picker marks her, and the screen
  // says she is next.
  expect(nextShift().id).toBe('kurumi')
})

test('sending for whoever is already standing there is not a swap', async () => {
  const { sessions, sendFor, onShift } = await open()

  await sendFor('kotone')

  expect(sessions).toHaveLength(1)
  expect(onShift().id).toBe('kotone')
})

test('nothing but sending for one of them changes who is standing there', async () => {
  // Opening the list, moving through it and putting it away again go through
  // none of this — the same as it is with what she thinks with.
  const { sessions, wakeUp, say, pick, onShift, nextShift } = await open()

  await wakeUp()
  await say('good morning')
  await pick('anthropic/opus')

  expect(sessions).toHaveLength(1)
  expect(onShift().id).toBe('kotone')
  expect(nextShift().id).toBe('kotone')
})

test('a girl sent for mid-conversation is written down for the next window', async () => {
  const { wakeUp, say, sendFor } = await open()

  await wakeUp()
  await say('good morning')
  await sendFor('kurumi')

  // Which is what makes the line above the box true: she cannot walk into this
  // session, and the next window is where the next one comes from.
  expect(remembered().id).toBe('kurumi')

  const later = await open()
  expect(later.onShift().id).toBe('kurumi')
  expect(later.sessions[0]!.who.id).toBe('kurumi')
  expect(briefFor(later.sessions[0]!.who)).toContain('くるみ')
})

test('asking again for the one who is waiting brings her out once there is nothing to interrupt', async () => {
  const { sessions, wakeUp, say, sendFor, stop, onShift } = await open()

  await wakeUp()
  await say('good morning')
  await sendFor('kurumi')
  expect(sessions).toHaveLength(1)

  // ESC before she has said a word: there is no longer a conversation in the
  // way, and the row is still the one marked in the list.
  await stop()
  await sendFor('kurumi')

  expect(sessions.map((one) => one.who.id)).toEqual(['kotone', 'kurumi'])
  expect(onShift().id).toBe('kurumi')
})

test('a session that has gone is not something the box can be taken back from', async () => {
  const { giveUp, dismiss, scene } = await open()

  await giveUp()
  await dismiss()

  // ESC is not offered for this one — but a key press is answered against the
  // last screen drawn, so one aimed at a note that had just been replaced can
  // still arrive. Putting it away would leave an input nothing can go out of
  // and no key that brings the way back.
  expect(scene().trouble).toEqual(LOST)
})

test('a session that never opened can be given to somebody else', async () => {
  const { sessions, giveUp, sendFor, scene } = await open()

  await giveUp()
  await sendFor('kurumi')

  // Nothing to interrupt, the screen has been saying to start her again, and a
  // different girl is a different server — which may well come up.
  expect(sessions.map((one) => one.who.id)).toEqual(['kotone', 'kurumi'])
  expect(scene().trouble).toBeNull()
})

test('a session closed to make room does not fail into the scene of the girl who replaced it', async () => {
  const { her, sendFor, wakeUp, scene } = await open()

  await sendFor('kurumi')
  // The server behind her was shut mid-boot and says so on its way down. It is
  // saying it to a screen that stopped being hers when she left it.
  await act(async () => her.giveUp())
  await wakeUp()

  expect(scene().trouble).toBeNull()
  expect(scene().isReady).toBe(true)
})


test('she starts in the folder the window was started in', async () => {
  const { her, folder } = await open()

  expect(folder()).toBe(OPENED_IN)
  expect(her.folder).toBe(OPENED_IN)
})

test('moving her opens a session in the folder she was moved to', async () => {
  const { her, sessions, moveTo, folder } = await open()

  await moveTo(elsewhere)

  // opencode settles a session's folder when it opens it, so the only honest
  // way to move her is the one sending for one of the others takes: close the
  // conversation and open another.
  expect(her.closed).toBe(true)
  expect(sessions.map((one) => one.folder)).toEqual([OPENED_IN, elsewhere])
  expect(folder()).toBe(elsewhere)
})

test('the girl who comes back is not handed the scene she left in the old folder', async () => {
  const { wakeUp, moveTo, scene } = await open()

  await wakeUp()
  expect(scene().isReady).toBe(true)

  await moveTo(elsewhere)

  expect(scene().isReady).toBe(false)
  expect(scene().models).toEqual([])
})

test('a conversation is not what stops her being moved', async () => {
  // Unlike sending for one of the others: being asked to work somewhere else is
  // a thing to do now, and one that waited for the next window would be no
  // answer at all.
  const { sessions, wakeUp, say, moveTo, folder } = await open()

  await wakeUp()
  await say('good morning')
  await moveTo(elsewhere)

  expect(sessions).toHaveLength(2)
  expect(folder()).toBe(elsewhere)
})

test('the folder she was in is on the list that took her out of it', async () => {
  const { moveTo, been } = await open()

  await moveTo(elsewhere)

  // Both ends are written down, so the list that moved her is also the one that
  // brings her back.
  expect(been()[0]).toBe(elsewhere)
  expect(been()).toContain(OPENED_IN)

  // And the next window opens with them already in it.
  const later = await open()
  expect(later.been()).toContain(elsewhere)
})

test('moving her to where she already is is not a move', async () => {
  const { sessions, wakeUp, say, moveTo, scene } = await open()

  await wakeUp()
  await say('good morning')
  await moveTo(OPENED_IN)

  // Which is also what taking the row already marked comes to: the list closes
  // and nothing under it has moved.
  expect(sessions).toHaveLength(1)
  expect(scene().isReady).toBe(true)
})

test('a folder that is not there is not opened onto', async () => {
  const { sessions, moveTo, folder } = await open()

  // A row written down for a folder that has been moved or deleted since. The
  // session it would open never comes up, several seconds later, with nothing
  // on screen to say a missing folder was why.
  await moveTo(path.join(elsewhere, 'nowhere'))

  expect(sessions).toHaveLength(1)
  expect(folder()).toBe(OPENED_IN)
})

test('whoever was sent for mid-conversation walks into the folder she is moved to', async () => {
  // The next session is the one she has been waiting for, and this is it. The
  // screen has been saying she is next — leaving her out of the session that
  // opens here would leave it saying so forever.
  const { sessions, wakeUp, say, sendFor, moveTo, onShift, nextShift } = await open()

  await wakeUp()
  await say('good morning')
  await sendFor('kurumi')
  expect(onShift().id).toBe('kotone')

  await moveTo(elsewhere)

  expect(sessions.map((one) => one.who.id)).toEqual(['kotone', 'kurumi'])
  expect(sessions[1]!.folder).toBe(elsewhere)
  expect(onShift().id).toBe('kurumi')
  expect(nextShift().id).toBe('kurumi')
})

test('neither picking a model nor sending for one of them moves her', async () => {
  // What she thinks with, who is standing there and where she works are three
  // lists, and only one of them is this one.
  const { sessions, wakeUp, say, pick, sendFor, folder } = await open()

  await wakeUp()
  await say('good morning')
  await pick('anthropic/opus')
  await sendFor('kurumi')

  expect(sessions).toHaveLength(1)
  expect(folder()).toBe(OPENED_IN)
})

/** A tool she wants, and what a standing yes to it would cover. */
const RUNS_GIT: BridgeEvent = {
  kind: 'ask-permission',
  askId: 'ask-1',
  toolName: 'bash',
  summary: 'git status --short',
  standing: { scope: 'bash git', covers: 'run git' },
}

test('what he has let her always do is answered where it arrives and never asked again', async () => {
  const { her, raise, allowAlways, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await raise({ ...RUNS_GIT, askId: 'ask-2', summary: 'git commit' })

  // The second one went back as the same yes the y key sends — the server is
  // never told to allow the tool itself, which would be every command she
  // could think of rather than the one he agreed to.
  expect(her.answered).toEqual([
    { askId: 'ask-1', allow: true },
    { askId: 'ask-2', allow: true },
  ])
  expect(scene().permission).toBeNull()
})

test('a standing yes covers the scope it was given against and nothing wider', async () => {
  const { her, raise, allowAlways, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await raise({
    ...RUNS_GIT,
    askId: 'ask-2',
    summary: 'rm -rf dist',
    standing: { scope: 'bash rm', covers: 'run rm' },
  })

  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(scene().permission?.askId).toBe('ask-2')
})

test('a standing yes goes with the session it was given in', async () => {
  const { raise, allowAlways, sendFor, sessions, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await sendFor('kurumi')
  await raise({ ...RUNS_GIT, askId: 'ask-2' })

  // A different girl on a different server was never the one he said yes to,
  // and she asks for herself.
  expect(sessions).toHaveLength(2)
  expect(sessions[1]!.answered).toEqual([])
  expect(scene().permission?.askId).toBe('ask-2')
})

test('a standing yes does not follow her to another folder', async () => {
  const { raise, allowAlways, moveTo, sessions, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await moveTo(elsewhere)
  await raise({ ...RUNS_GIT, askId: 'ask-2' })

  expect(sessions).toHaveLength(2)
  expect(sessions[1]!.answered).toEqual([])
  expect(scene().permission?.askId).toBe('ask-2')
})

test('a standing yes does not survive her being opened again', async () => {
  const { her, raise, allowAlways, giveUp, retry, wakeUp, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await giveUp()
  await retry()
  await wakeUp()
  await raise({ ...RUNS_GIT, askId: 'ask-2' })

  // The same session object, but not necessarily the same conversation: a
  // server with no record of the old one starts a fresh one under it, and the
  // yes was given inside the one that went away.
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(scene().permission?.askId).toBe('ask-2')
})

test('a standing yes does not follow her into a new conversation', async () => {
  const { her, wakeUp, raise, allowAlways, startFresh, scene } = await open()
  await wakeUp()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await startFresh()
  await raise({ ...RUNS_GIT, askId: 'ask-2' })

  // What he let her go on doing was let go of with the conversation it was
  // said in, and a new one is not that conversation.
  expect(her.begun).toBe(1)
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(scene().permission?.askId).toBe('ask-2')
})

test('a new conversation is not started while there is nobody to open one on', async () => {
  const { her, wakeUp, giveUp, startFresh, scene } = await open()
  await wakeUp()
  await giveUp()

  await startFresh()

  // The note saying she is gone is still up, and so is the one key that brings
  // her back: a new conversation on a server that is not there would take both
  // off the screen and leave nothing that works.
  expect(her.begun).toBe(0)
  expect(scene().trouble?.gone).toBe(true)
  expect(scene().isReady).toBe(false)
})

test('a standing yes does not follow her into a conversation she is picking up again', async () => {
  const { her, raise, allowAlways, resumeTo, scene } = await open()

  await raise(RUNS_GIT)
  await allowAlways('ask-1')
  await resumeTo(TALKS[1]!.id)
  await raise({ ...RUNS_GIT, askId: 'ask-2' })

  // Nothing was closed — the server keeps every conversation the folder has had
  // on the one session — but the page he said yes on is not the page she is on
  // now, and he is asked again.
  expect(her.resumed).toEqual([TALKS[1]!.id])
  expect(her.answered).toEqual([{ askId: 'ask-1', allow: true }])
  expect(scene().permission?.askId).toBe('ask-2')
})
