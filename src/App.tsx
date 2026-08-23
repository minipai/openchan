import { useMemo, useState, type ReactNode } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { SpriteLayer, spriteColumns } from './SpriteLayer'
import { DialogueBox } from './DialogueBox'
import { KeysOverlay } from './KeysOverlay'
import { PathBox } from './PathBox'
import { Picker, type Choice } from './Picker'
import { ReportReader } from './ReportReader'
import { TroubleNote } from './TroubleNote'
import { Asking, columns } from './Asking'
import { cornerFor, pressed, takes } from './keys'
import { useMaid, type Scene } from './brain'
import type { Character } from './cast'
import { asPath, fitted, folderRows, shortened, troubleWith, TYPE_A_PATH } from './folder'
import type { OpenConversation } from './protocol'
import { paletteOver } from './theme'

/** The strip the window leaves under the dialogue box. */
const UNDER_THE_BOX = 1

/**
 * What can stand over the scene: the keyboard help, one of the three lists, the
 * line a folder is typed out on, or what she wrote this turn.
 *
 * One value rather than a flag each, because only ever one of them is up. Held
 * apart, that rule had to be spelled out by every key that opened one — and
 * forgetting a single line left two of them on screen, both answering Enter.
 */
type Over = 'keys' | 'models' | 'shift' | 'folder' | 'path' | 'report' | null

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
  children,
}: {
  width: number
  height: number
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
    >
      {children}
    </box>
  )
}

/**
 * Everything the box is besides her line and the command she is asking to run:
 * the strip under it, its frame, the mood under her line, the divider, and the
 * two rows of the question itself.
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
function roomToOpen(height: number, box: number, line: string): number {
  const wrapped = line
    .split('\n')
    .reduce((rows, paragraph) => rows + Math.max(1, Math.ceil(columns(paragraph) / (box - 6))), 0)
  const spoken = Math.max(2, wrapped + 1)
  return Math.max(2, height - BESIDES_THE_DETAIL - spoken)
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
  const { scene, cast, onShift, nextShift, folder, been, ask, answer, stop, use, swapTo, moveTo, retry, dismiss } =
    useMaid(openMaid)
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
  // Which question has been opened up, rather than whether one is: the next
  // thing she asks for is a fresh question and starts shut, however the last
  // one was left.
  const [opened, setOpened] = useState<string | null>(null)
  // What she wrote is the one of them that can be taken out from under itself:
  // the next thing she is asked takes the report with it, and a reader left
  // standing over nothing would go on swallowing ESC with no page on screen to
  // explain why. So what is standing there is not quite what was opened.
  const standing: Over = over === 'report' && scene.report === null ? null : over
  // Which list it is, when it is one of them. The frame, the keys and putting
  // it away are the same for all three — only the rows and where a chosen one
  // goes differ.
  const picking =
    standing === 'models' || standing === 'shift' || standing === 'folder' ? standing : null

  const asked = scene.permission
  const where = {
    up: standing === 'keys',
    picking: picking !== null,
    path: standing === 'path',
    reading: standing === 'report',
    hasReport: scene.report !== null,
    isWorking: scene.isWorking,
    asked: asked !== null,
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
      case 'refuse':
        return answer(asked!.askId, false)
      case 'details':
        return setOpened(showing ? null : asked!.askId)
      case 'stop':
        return stop()
      case 'retry':
        return retry()
      case 'dismiss':
        return dismiss()
      case 'blocks':
        return setBlocks((was) => !was)
      case 'models':
        return setOver('models')
      case 'who':
        return setOver('shift')
      case 'where':
        return setOver('folder')
      case 'report':
        return setOver('report')
      // Nothing else happens: what she thinks with, who is standing there and
      // where she works are only ever changed by taking a row off the list — or,
      // for a folder she has never been in, by typing it out in full.
      case 'cancel':
        return setOver(null)
    }
  })

  // Everyone who could be standing there, as rows. The list knows nothing about
  // what is in it, so the id it hands back is hers and the label is her name.
  const shifts: Choice[] = useMemo(
    () => cast.map((one) => ({ id: one.id, label: one.name })),
    [cast],
  )

  // What the list open right now is a list of, and nothing at all when none is
  // open.
  const list =
    picking === null
      ? null
      : picking === 'models'
        ? { title: 'What she thinks with', items: scene.models, chosen: scene.model, take: use }
        : picking === 'shift'
          ? { title: 'Who is on shift', items: shifts, chosen: nextShift.id, take: swapTo }
          : {
              title: 'Where she works',
              items: folderRows(folder, been),
              chosen: folder,
              // The one row that is not a folder asks for one instead: the
              // folder wanted is very often one she has never been in, and the
              // list can only offer the ones she has.
              take: (id: string) => {
                if (id === TYPE_A_PATH) {
                  setTrouble(null)
                  return setOver('path')
                }
                // A row written down for a folder that has been moved or
                // deleted since. Closing the list on it would look exactly
                // like the move having worked, so it says what happened and
                // leaves a line to type somewhere else on.
                const why = troubleWith(id)
                setTrouble(why)
                if (why === null) moveTo(id)
                else setOver('path')
              },
            }

  // 760px of a 960px window, and never wider than the terminal has room for.
  const boxWidth = Math.min(90, width - 6)

  const send = () => {
    ask(typed)
    setTyped('')
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
        <DialogueBox
          theme={theme}
          name={onShift.name}
          // Half the strip at most: what she is doing is written on the other
          // half of the same line.
          folder={fitted(shortened(folder), Math.floor(boxWidth / 2))}
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
                rows={roomToOpen(height, boxWidth, scene.line)}
              />
            ) : (
              <box flexDirection="row" gap={1}>
                <text fg={theme.primary}>›</text>
                <input
                  focused={standing === null}
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
            width={Math.min(60, width - 6)}
            // Off the list once the row has been taken — unless taking it
            // put something else there: the one row that is not a folder asks
            // for one instead, and it is the line to type it on that stays.
            onPick={(id) => {
              list.take(id)
              setOver((was) => (was === picking ? null : was))
            }}
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
    </box>
  )
}
