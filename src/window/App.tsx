import { useRef, useState, type ReactNode } from 'react'
import { decodePasteBytes, stripAnsiSequences, type InputRenderable, type PasteEvent } from '@opentui/core'
import { useKeyboard, usePaste, useTerminalDimensions } from '@opentui/react'
import { SpriteLayer, spriteColumns } from './SpriteLayer'
import { DialogueBox } from './box/DialogueBox'
import { KeysOverlay } from './over/KeysOverlay'
import { PathBox } from './over/PathBox'
import { Picker } from './over/Picker'
import { ReportReader } from './over/ReportReader'
import { TroubleNote } from './box/TroubleNote'
import { Whispers } from './box/Whispers'
import { Asking, columns } from './box/Asking'
import { cornerFor, pressed, takes } from './keys'
import { useTheList, type Picking } from './over/list'
import { useHerQuestion } from './question'
import { useNote } from './note'
import { useMaid, type Scene } from '../between/brain'
import type { Character } from '../her/cast'
import { asPath, shortened, troubleWith } from '../between/folder'
import { shareOut } from './strip/strip'
import type { OpenConversation } from '../between/protocol'
import { paletteOver } from './theme'

/** The strip the window leaves under the dialogue box. */
const UNDER_THE_BOX = 1

/**
 * What a line break is drawn as on the one line she is spoken to on.
 *
 * The line is one row and cannot hold a real newline — the input drops them —
 * so a pasted paragraph would arrive with its lines run together into one
 * sentence. It is written down as a mark instead: what is on the line is what
 * will be said, breaks and all, and every mark is a newline again on the way
 * out. Visible on purpose, because a break that showed as nothing would read
 * as a paste that had lost it.
 *
 * On this line the mark is what a break is, so a paste that carries one of its
 * own is read as a break as well — and reads as one, because that is what it
 * is drawn as. Keeping the two apart means keeping what was pasted somewhere
 * the line is not, and then what is on the line is no longer what will be said.
 */
const A_BREAK = '↵'

/**
 * How much the line will hold.
 *
 * The input keeps a thousand characters unless it is told otherwise, and what
 * is past that it drops without a word — a pasted page arrives with its end
 * missing and nothing on screen says so. This is high enough that nothing
 * anybody says to her in one go reaches it, and what does reach it is said
 * rather than swallowed.
 */
export const LINE_HOLDS = 100_000

/**
 * What can stand over the scene: the keyboard help, one of the four lists, the
 * line a folder is typed out on, or what she wrote this turn.
 *
 * One value rather than a flag each, because only ever one of them is up. Held
 * apart, that rule had to be spelled out by every key that opened one — and
 * forgetting a single line left two of them on screen, both answering Enter.
 */
type Over = Picking | 'keys' | 'path' | 'report' | null

/**
 * The frame whatever is over the scene stands in: the whole window, with the
 * one thing in the middle of it.
 *
 * Middle by the terminal's arithmetic rather than a guessed offset — these are
 * different heights depending on what she is in the middle of, and a guess put
 * the keys over the question they were opened to explain.
 *
 * Over the box she speaks from and over her; nothing says which of these is
 * over which, because there is never a second one of them on screen to be over.
 */
function OverTheScene({
  width,
  height,
  shown = true,
  children,
}: {
  width: number
  height: number
  /** Whether it is drawn at all. Not drawn is not the same as not there: what
   * is in it is kept, for the one thing over the scene that is hers rather
   * than the window's and has to come back as it was left. */
  shown?: boolean
  children: ReactNode
}) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
      zIndex={8}
      visible={shown}
    >
      {children}
    </box>
  )
}

/**
 * Everything the box is besides her line and the command she is asking to run:
 * the strip under it, its frame, the mood under her line, the divider, and the
 * two rows of the question itself — three, when it is one she can be allowed
 * for the rest of the session, which is counted where it is known about.
 */
const BESIDES_THE_DETAIL = 12

/**
 * How much of a command or a diff there is room to open up.
 *
 * The box grows upwards out of the bottom of the screen, so a detail too tall
 * for the terminal pushes her line and the top of the frame off it — she ends
 * up in a box with no lid. What she last said is the part that varies: it
 * wraps, and two sentences at eighty columns are four rows.
 *
 * How it wraps is guessed at rather than measured, and guessed high on purpose.
 * The layout is not settled until it is drawn, and the two ways of being wrong
 * are not the same: a row too few and the box opens one line shorter than it
 * could have, a row too many and it loses its lid.
 *
 * She answers in paragraphs, and every one of them ends on a row of its own
 * with room to spare — so they are counted one by one rather than as a single
 * run of text, which is short by a row per break in a long answer.
 */
function roomToOpen(height: number, box: number, line: string, offered: boolean): number {
  const wrapped = line
    .split('\n')
    .reduce((rows, paragraph) => rows + Math.max(1, Math.ceil(columns(paragraph) / (box - 6))), 0)
  const spoken = Math.max(2, wrapped + 1)
  return Math.max(2, height - BESIDES_THE_DETAIL - (offered ? 1 : 0) - spoken)
}

/**
 * What the empty input says. An input that looks ready to be spoken to is what
 * made the first sentence anyone typed look like it had vanished, so it says
 * she is not up yet for as long as she is not.
 */
function invitation(scene: Scene): string {
  if (!scene.isReady) return 'Waking her up…'
  return scene.isWorking ? 'ESC to stop her…' : 'Say something to her…'
}

/**
 * The line above the box: what she is doing, or — before there is anyone to do
 * anything — that what was said to her is being kept. It goes there rather than
 * in the input because it has to survive the next thing being typed.
 *
 * It is also where someone sent for mid-conversation waits. She cannot come out
 * until this session is over, and a pick that changed nothing anybody can see
 * would read as the list being broken — so the screen says who is next while
 * there is nothing more pressing to say.
 */
function above(scene: Scene, next: Character | null): string | null {
  if (!scene.isReady && scene.held !== null) return 'waiting for her to wake up'
  if (scene.narration) return scene.narration
  return next && `${next.name} takes the next shift`
}

/**
 * The window. Which agent answers is handed in for the same reason the hook
 * takes one — so the whole of what is on screen can be driven by something that
 * is not a running opencode server.
 */
export function App({ behind, open: openMaid }: { behind: string | undefined; open?: OpenConversation }) {
  const { width, height } = useTerminalDimensions()
  // Her box is coloured against the terminal, the same answer that keeps her
  // out of a black slab.
  const theme = paletteOver(behind)
  const {
    scene,
    cast,
    onShift,
    nextShift,
    folder,
    been,
    ask,
    answer,
    allowAlways,
    choose,
    decline,
    stop,
    use,
    swapTo,
    moveTo,
    resumeTo,
    startFresh,
    retry,
    dismiss,
    hush,
  } = useMaid(openMaid)
  // The line she is spoken to on, and a copy of what is typed on it. The copy
  // is for coming back: the line is taken out of the box while her question or
  // a note is drawn there, and a half-written sentence would go with it. What
  // Enter sends is read off the line itself, not the copy — a paste a terminal
  // did not wrap is the sentence and its Enter in one chunk, every byte taken
  // in before the window has rendered once, so at the Enter the copy is still
  // whatever the last render saw. The line is cleared the same way, because
  // once the copy has caught up to empty the render that would clear it never
  // comes: the copy was already empty the last time the line was drawn from
  // it, and nothing it has not drawn gets pushed back down.
  const line = useRef<InputRenderable>(null)
  const [typed, setTyped] = useState('')
  // Ctrl-B: draw her out of half-block characters even where the terminal
  // could take real pixels. It is the rougher picture, and it is a look.
  const [blocks, setBlocks] = useState(false)
  // The one thing over the scene, whichever it is. What is in each of them is
  // held elsewhere — the rows of a list, the page she wrote — so all the window
  // keeps is which one is open, and opening one is what puts away the last.
  const [over, setOver] = useState<Over>(null)
  // Whatever was wrong with the last folder typed out, kept beside the line it
  // is typed on.
  const [trouble, setTrouble] = useState<string | null>(null)
  // What the list of models has been narrowed to by typing at it. Held here
  // rather than by the list, because ESC is the window's key and what it does
  // depends on whether there is anything typed to clear.
  const [narrowedTo, setNarrowedTo] = useState('')
  // Which question has been opened up, rather than whether one is: the next
  // thing she asks for is a fresh question and starts shut, however the last
  // one was left.
  const [opened, setOpened] = useState<string | null>(null)
  // A word about what the window just did, and the copies it is mostly said
  // about.
  const { note, say, copy } = useNote()
  // What she wrote is the one of them that can be taken out from under itself:
  // the next thing she is asked takes the report with it, and a reader left
  // standing over nothing would go on swallowing ESC with no page on screen to
  // explain why. So what is standing there is not quite what was opened.
  const standing: Over = over === 'report' && scene.report === null ? null : over
  // Which list it is, when it is one of them. The frame, the keys and putting
  // it away are the same for all four — only the rows and where a chosen one
  // goes differ.
  const picking =
    standing === 'models' || standing === 'shift' || standing === 'folder' || standing === 'talks'
      ? standing
      : null
  // The lists that can be typed at, and only once there are rows to narrow: what
  // she thinks with, which runs to hundreds of rows, and what has been talked
  // about here, whose rows are sentences — as against four names on either of
  // the others. A list with nothing in it takes no letters, and a key nothing
  // takes must go on meaning what it meant: opened while she is down, r is
  // still the one way to open her again.
  const narrows =
    (picking === 'models' && scene.models.length > 0) || (picking === 'talks' && scene.talks.length > 0)

  const asked = scene.permission
  // Her question with the answers written out. She raised it, so it is not one
  // of the things the window opens — anything the window does open goes over
  // it, and it is back, where it was left, when that is put away. Kept on the
  // scene and only hidden while something is over it: the ticks and the
  // highlight are the list's own, and a list taken down and put up again
  // would come back with neither.
  const choosing = scene.asked
  // Which of her questions is up, when she asked several at once: they are
  // taken one at a time, in the order she asked them, and what has been picked
  // of it so far is kept until the last of them is answered.
  const { question, answered, pick, nobodyWillPick } = useHerQuestion(choosing, { choose, decline })
  // Whether the question is the thing being answered right now, rather than
  // waiting under something else. Something in the way counts: the note goes
  // over it the same way it goes over her permission question, and ESC is the
  // note's until it is put away — not a decline aimed at a list nobody can
  // see.
  const answering = standing === null && scene.trouble === null && question !== null
  // Whether the line she is spoken to on is the thing being typed into. A list,
  // a page, her own question or something in the way stands where the line is
  // or over it, and a tool she is waiting to be allowed is drawn in its place —
  // so what is pasted then belongs to whatever is there, and the line is not
  // even on screen to take it.
  const spokenTo = standing === null && !answering && scene.trouble === null && asked === null
  const where = {
    up: standing === 'keys',
    picking: picking !== null || answering,
    ticking: answering && question.multiple,
    narrows,
    narrowed: narrows && narrowedTo !== '',
    path: standing === 'path',
    reading: standing === 'report',
    hasReport: scene.report !== null,
    said: scene.line !== '',
    isWorking: scene.isWorking,
    asked: asked !== null,
    // Only a question that came with a scope written for it can be answered
    // for the rest of the session — the key is not offered where there is
    // nothing narrow to say yes to.
    standing: asked?.standing != null,
    // Which way out of it there is, which is the only thing about it the keys
    // have any business knowing.
    trouble: scene.trouble && (scene.trouble.gone ? ('gone' as const) : ('stuck' as const)),
  }
  const showing = asked !== null && opened === asked.askId

  // Which key does what, and which of them count from here, is the keys table's
  // to say — including Ctrl-C, which is not answered here on purpose: the
  // renderer takes it, and it is the one that knows how to put the terminal
  // back. Killing the process first leaves her standing on the master's shell.
  useKeyboard((key) => {
    const does = pressed(key, where)
    // A key the window has taken is not the input's — or the open list's — to
    // act on as well. Ctrl-K is delete-to-end-of-line in there, so bringing
    // these up would take the half-written sentence with it; Ctrl-B moves the
    // cursor. Which keys are the window's own is the table's to say.
    if (does && takes(does)) key.preventDefault()
    switch (does) {
      case 'keys':
        return setOver('keys')
      case 'close':
        return setOver(null)
      case 'allow':
        return answer(asked!.askId, true)
      case 'always':
        return allowAlways(asked!.askId)
      case 'refuse':
        return answer(asked!.askId, false)
      case 'details':
        return setOpened(showing ? null : asked!.askId)
      case 'stop':
        return stop()
      // A line break rather than an Enter: the byte a terminal sends for one is
      // not the byte it sends for the other, and only Enter was ever meant to
      // send. It is written onto the line as a mark, which is what a break is
      // on a line that only has one row.
      case 'new-line':
        return line.current!.insertText(A_BREAK)
      case 'retry':
        return retry()
      case 'dismiss':
        return dismiss()
      case 'blocks':
        return setBlocks((was) => !was)
      case 'models':
        // Opened afresh: what was typed at it last time is not a question
        // anyone is still asking.
        if (standing !== 'models') setNarrowedTo('')
        return setOver('models')
      case 'talks':
        // Opened afresh, the same as the models are: what was typed at the last
        // list is not a question anyone is still asking, and the two lists
        // share the letters.
        if (standing !== 'talks') setNarrowedTo('')
        return setOver('talks')
      // Whatever is standing over the scene goes with the conversation it was
      // opened in front of — including the list this can also be taken off.
      case 'fresh':
        setOver(null)
        return startFresh()
      case 'who':
        return setOver('shift')
      case 'where':
        return setOver('folder')
      case 'report':
        return setOver('report')
      // Her words and only her words: the line as she said it, not as the box
      // wrapped it, and the page as she wrote it.
      case 'copy-line':
        return copy(scene.line, 'her line')
      case 'copy-page':
        return copy(scene.report!.body, 'the page')
      case 'clear':
        return setNarrowedTo('')
      // Nothing else happens: what she thinks with, who is standing there and
      // where she works are only ever changed by taking a row off the list — or,
      // for a folder she has never been in, by typing it out in full. Her own
      // question is the one list that is not simply put away: she is waiting
      // on it, and is told that nobody is going to pick — which is not the
      // same as being told nothing was picked.
      case 'cancel':
        if (!answering) return setOver(null)
        return nobodyWillPick()
    }
  })

  // A paste the terminal wrapped up as one, taken by the window rather than by
  // the line.
  //
  // The line would take it itself, and drop every newline in it on the way in:
  // three lines arrive as one run-on sentence. So it is written onto the line
  // here instead, with each break kept as a mark, and it goes off as the one
  // thing it was pasted as.
  //
  // What it does not fit is said. The line holds a great deal and a paste that
  // reaches the end of it is a page rather than a sentence — but the end is
  // silent, and a paste with its tail missing looks exactly like a paste that
  // arrived.
  usePaste((paste: PasteEvent) => {
    if (!spokenTo) return
    paste.preventDefault()
    // The escape sequences a terminal would otherwise be driven by are taken
    // out of it, the same as the line takes them out of what it pastes itself.
    const text = stripAnsiSequences(decodePasteBytes(paste.bytes)).replace(/\r\n|\r|\n/g, A_BREAK)
    const room = LINE_HOLDS - line.current!.value.length
    line.current!.insertText(text.slice(0, room))
    if (text.length > room) say(`the last ${text.length - room} characters would not fit`)
  })

  // What the list open right now is a list of, and nothing at all when none is
  // open.
  const list = useTheList({
    which: picking,
    scene,
    cast,
    nextShift,
    folder,
    been,
    narrowing: { typed: narrowedTo, onType: setNarrowedTo },
    use,
    swapTo,
    moveTo,
    resumeTo,
    startFresh,
    sayTrouble: setTrouble,
    typeAPath: () => setOver('path'),
  })

  // 760px of a 960px window, and never wider than the terminal has room for.
  const boxWidth = Math.min(90, width - 6)

  // The right end of the strip, shared out between the folder she is in and
  // what she is thinking with — what she is doing is kept a word of the line
  // in there too.
  const { folder: shownFolder, model: shownModel } = shareOut(boxWidth, folder, scene.models, scene.model)

  const send = () => {
    ask(line.current!.value.replaceAll(A_BREAK, '\n'))
    line.current!.value = ''
  }

  return (
    <box position="absolute" top={0} left={0} width={width} height={height}>
      {/* All the way down: she runs behind the dialogue box and out through
          the strip below it, the same as she runs off the bottom of the
          window. The box is drawn over her, not instead of her. */}
      <SpriteLayer
        who={onShift}
        expression={scene.expression}
        columns={spriteColumns(width)}
        rows={height}
        behind={behind}
        blocks={blocks}
      />

      <box
        position="absolute"
        bottom={UNDER_THE_BOX}
        left={Math.round((width - boxWidth) / 2)}
        zIndex={6}
      >
        {/* Above the box, growing up out of it: the box grows upwards too, and
            these are the ones that give way. Anything her line needs, her line
            takes — a whisper pushed off the top of the window was a moment of
            nothing to begin with. */}
        <Whispers theme={theme} whispers={scene.whispers} width={boxWidth} onGone={hush} />

        <DialogueBox
          theme={theme}
          name={onShift.name}
          folder={shownFolder}
          model={shownModel}
          width={boxWidth}
          line={scene.line}
          narration={above(scene, nextShift.id === onShift.id ? null : nextShift)}
          mood={scene.mood}
          isWorking={scene.isWorking}
          corner={cornerFor(where)}
          footer={
            // What is in the way comes first: a question she raised before it
            // has nobody left to answer it, and the line is not worth offering
            // while nothing said on it could arrive.
            scene.trouble ? (
              <TroubleNote theme={theme} trouble={scene.trouble} />
            ) : asked ? (
              <Asking
                theme={theme}
                permission={asked}
                open={showing}
                width={boxWidth}
                rows={roomToOpen(height, boxWidth, scene.line, asked.standing !== null)}
              />
            ) : (
              <box flexDirection="row" gap={1}>
                <text fg={theme.primary}>›</text>
                <input
                  ref={line}
                  focused={spokenTo}
                  maxLength={LINE_HOLDS}
                  value={typed}
                  placeholder={invitation(scene)}
                  flexGrow={1}
                  backgroundColor={theme.card}
                  onInput={setTyped}
                  onSubmit={send}
                />

              </box>
            )
          }
        />
      </box>

      {/* Over the box rather than beside it, and above her: a list is the thing
          being answered while it is open. */}
      {list && (
        <OverTheScene width={width} height={height}>
          <Picker
            // One list per thing being picked: the other key opens the other
            // list while this one is up, and a list that stayed put would keep
            // the row it was left on — over rows that are now somebody else's.
            key={picking}
            theme={theme}
            title={list.title}
            items={list.items}
            chosen={list.chosen}
            narrowing={list.narrowing}
            width={Math.min(60, width - 6)}
            room={height}
            // Off the list once the row has been taken — unless taking it
            // put something else there: the one row that is not a folder asks
            // for one instead, and it is the line to type it on that stays.
            onPick={([id]) => {
              list.take(id!)
              setOver((was) => (was === picking ? null : was))
            }}
          />
        </OverTheScene>
      )}

      {/* Her question, in the same list everything else is picked off — one
          of them at a time, when she asked several. The last one answered is
          what hands the whole of it back; until then they are kept here. */}
      {choosing && question && (
        <OverTheScene width={width} height={height} shown={answering}>
          <Picker
            // One list per question: the next one is a fresh list, with no
            // ticks carried over from the last and the highlight back at the
            // top.
            key={`${choosing.askId}/${answered}`}
            theme={theme}
            title={question.header}
            asks={question.question}
            items={question.options.map((one) => ({ id: one.label, label: one.label, description: one.description }))}
            chosen={null}
            multiple={question.multiple}
            focused={answering}
            width={Math.min(60, width - 6)}
            room={height}
            onPick={pick}
          />
        </OverTheScene>
      )}

      {/* Where the list was, because it is the same list one step further in:
          the rows have been put away and the folder is being written out. */}
      {standing === 'path' && (
        <OverTheScene width={width} height={height}>
          <PathBox
            theme={theme}
            from={shortened(folder)}
            trouble={trouble}
            width={Math.min(60, width - 6)}
            onGo={(typed) => {
              const going = asPath(typed, folder)
              // A path that is not a folder keeps the box on screen with the
              // reason under it. Closing on it would look exactly like a folder
              // that had been moved to and quietly was not.
              const why = troubleWith(going)
              setTrouble(why)
              if (why !== null) return
              moveTo(going)
              setOver(null)
            }}
          />
        </OverTheScene>
      )}

      {/* Nearly the whole window: a report is as long as it is, and the point
          of moving it off her line is to give it room. */}
      {standing === 'report' && scene.report && (
        <OverTheScene width={width} height={height}>
          <ReportReader
            theme={theme}
            report={scene.report}
            width={Math.min(90, width - 6)}
            height={Math.min(height, Math.max(9, height - 6))}
          />
        </OverTheScene>
      )}

      {/* A sheet of paper held up in front of everything: what is underneath is
          still waiting and still answerable, and these say so. */}
      {standing === 'keys' && (
        <OverTheScene width={width} height={height}>
          <KeysOverlay theme={theme} where={where} width={Math.min(46, width - 6)} />
        </OverTheScene>
      )}

      {/* A word about what the window just did, in the strip under the box
          and over everything: a copy can be made from under any of the things
          that stand over the scene — the keys list the key, a page is dragged
          over — and a word half hidden behind one of them reads as a word cut
          off. The strip is the one row none of them reach. */}
      {note !== null && (
        <box
          position="absolute"
          bottom={0}
          left={Math.round((width - boxWidth) / 2)}
          width={boxWidth}
          height={UNDER_THE_BOX}
          paddingX={2}
          zIndex={9}
        >
          <text fg={theme.muted}>{note}</text>
        </box>
      )}
    </box>
  )
}
