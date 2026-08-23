import { useMemo, useState } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { SpriteLayer, spriteColumns } from './SpriteLayer'
import { DialogueBox } from './DialogueBox'
import { KeysOverlay } from './KeysOverlay'
import { Picker, type Choice } from './Picker'
import { ReportReader } from './ReportReader'
import { cornerFor, keyFor, pressed, shownAs, takes } from './keys'
import { useMaid, type Scene } from './brain'
import type { Character } from './cast'
import { paletteOver } from './theme'

/** The strip the window leaves under the dialogue box. */
const UNDER_THE_BOX = 1

/**
 * What the empty input says. An input that looks ready to be spoken to is what
 * made the first sentence anyone typed look like it had vanished, so it says
 * she is not up yet for as long as she is not.
 */
function invitation(scene: Scene): string {
  if (scene.lost !== null) return 'She cannot be reached — start her again…'
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

export function App({ behind }: { behind: string | undefined }) {
  const { width, height } = useTerminalDimensions()
  // Her box is coloured against the terminal, the same answer that keeps her
  // out of a black slab.
  const theme = paletteOver(behind)
  const { scene, cast, onShift, nextShift, ask, answer, stop, use, swapTo } = useMaid()
  const [typed, setTyped] = useState('')
  // Ctrl-B: draw her out of half-block characters even where the terminal
  // could take real pixels. It is the rougher picture, and it is a look.
  const [blocks, setBlocks] = useState(false)
  const [keysUp, setKeysUp] = useState(false)
  // Ctrl-P and Ctrl-G: what she could think with, and which of them is standing
  // there. What each list is picked from is held elsewhere, so all the window
  // keeps is which of them is open.
  const [picking, setPicking] = useState<'models' | 'shift' | null>(null)
  // Ctrl-R: what she wrote this turn, open over the scene. What is in it is the
  // scene's — this is only whether it is being looked at.
  const [reading, setReading] = useState(false)
  // Only ever open over something: the next thing she is asked takes the report
  // with it, and a reader left standing over nothing would go on swallowing ESC
  // with no page on screen to explain why.
  const open = reading && scene.report !== null

  const where = {
    up: keysUp,
    picking: picking !== null,
    reading: open,
    hasReport: scene.report !== null,
    isWorking: scene.isWorking,
    asked: scene.permission !== null,
  }

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
        // One thing over the scene at a time: a list left open underneath would
        // go on taking Enter behind these keys, and swap what she thinks with
        // while the master is reading about it.
        setPicking(null)
        setReading(false)
        return setKeysUp(true)
      case 'close':
        setReading(false)
        return setKeysUp(false)
      case 'allow':
        return answer(scene.permission!.askId, true)
      case 'refuse':
        return answer(scene.permission!.askId, false)
      case 'stop':
        return stop()
      case 'blocks':
        return setBlocks((was) => !was)
      case 'models':
        setKeysUp(false)
        setReading(false)
        return setPicking('models')
      case 'who':
        setKeysUp(false)
        setReading(false)
        return setPicking('shift')
      // The same one-thing-at-a-time rule, and nothing is lost by it: what she
      // wrote waits on the scene whether or not it is being looked at.
      case 'report':
        setKeysUp(false)
        setPicking(null)
        return setReading(true)
      // Nothing else happens: what she thinks with and who is standing there
      // are only ever changed by picking something off the list.
      case 'cancel':
        return setPicking(null)
    }
  })

  // Everyone who could be standing there, as rows. The list knows nothing about
  // what is in it, so the id it hands back is hers and the label is her name.
  const shifts: Choice[] = useMemo(
    () => cast.map((one) => ({ id: one.id, label: one.name })),
    [cast],
  )

  // What the list open right now is a list of, and nothing at all when none is
  // open. The frame, the keys and putting it away are the same either way —
  // only the rows and where a chosen one goes differ.
  const list =
    picking === null
      ? null
      : picking === 'models'
        ? { title: 'What she thinks with', items: scene.models, chosen: scene.model, take: use }
        : { title: 'Who is on shift', items: shifts, chosen: nextShift.id, take: swapTo }

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
          width={boxWidth}
          line={scene.line}
          narration={above(scene, nextShift.id === onShift.id ? null : nextShift)}
          mood={scene.mood}
          isWorking={scene.isWorking}
          corner={cornerFor(where)}
          footer={
            scene.permission ? (
              <box flexDirection="row" gap={2}>
                <text fg={theme.foreground}>{`She wants to use ${scene.permission.toolName}`}</text>
                <text fg={theme.primary}>{`${shownAs(keyFor('allow').press)} ${keyFor('allow').says}`}</text>
                <text fg={theme.muted}>{`${shownAs(keyFor('refuse').press)} ${keyFor('refuse').says}`}</text>
              </box>
            ) : (
              <box flexDirection="row" gap={1}>
                <text fg={theme.primary}>›</text>
                <input
                  focused={!keysUp && picking === null && !open}
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
            onPick={(id) => {
              list.take(id)
              setPicking(null)
            }}
          />
        </box>
      )}

      {/* Nearly the whole window: a report is as long as it is, and the point
          of moving it off her line is to give it room. Under the keys overlay
          rather than over it — that one is the sheet of paper held up in front
          of everything. */}
      {open && scene.report && (
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
          <ReportReader
            theme={theme}
            report={scene.report}
            width={Math.min(90, width - 6)}
            height={Math.min(height, Math.max(9, height - 6))}
          />
        </box>
      )}

      {/* Middle of the screen, and let the terminal work out where that is:
          the list is a different height depending on what she is in the middle
          of, and a guessed offset put it over the question it was opened to
          explain. */}
      {keysUp && (
        <box
          position="absolute"
          top={0}
          left={0}
          width={width}
          height={height}
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <KeysOverlay theme={theme} where={where} width={Math.min(46, width - 6)} />
        </box>
      )}
    </box>
  )
}
