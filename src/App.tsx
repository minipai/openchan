import { useState } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { SpriteLayer, spriteColumns } from './SpriteLayer'
import { DialogueBox } from './DialogueBox'
import { KeysOverlay } from './KeysOverlay'
import { cornerFor, keyFor, pressed, shownAs } from './keys'
import { useMaid, type Scene } from './brain'
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
 */
function above(scene: Scene): string | null {
  if (!scene.isReady && scene.held !== null) return 'waiting for her to wake up'
  return scene.narration
}

export function App({ behind }: { behind: string | undefined }) {
  const { width, height } = useTerminalDimensions()
  // Her box is coloured against the terminal, the same answer that keeps her
  // out of a black slab.
  const theme = paletteOver(behind)
  const { scene, ask, answer, stop } = useMaid()
  const [typed, setTyped] = useState('')
  // Ctrl-B: draw her out of half-block characters even where the terminal
  // could take real pixels. It is the rougher picture, and it is a look.
  const [blocks, setBlocks] = useState(false)
  const [keysUp, setKeysUp] = useState(false)

  const where = { up: keysUp, isWorking: scene.isWorking, asked: scene.permission !== null }

  // Which key does what, and which of them count from here, is the keys table's
  // to say — including Ctrl-C, which is not answered here on purpose: the
  // renderer takes it, and it is the one that knows how to put the terminal
  // back. Killing the process first leaves her standing on the master's shell.
  useKeyboard((key) => {
    const does = pressed(key, where)
    // A key the window has taken is not the input's to act on as well. Ctrl-K
    // is delete-to-end-of-line in there, so bringing these up would take the
    // half-written sentence with it; Ctrl-B moves the cursor. Leaving is left
    // alone — that one is the renderer's, and it is the one that knows how to
    // put the terminal back.
    if (does && does !== 'send' && does !== 'leave') key.preventDefault()
    switch (does) {
      case 'keys':
        return setKeysUp(true)
      case 'close':
        return setKeysUp(false)
      case 'allow':
        return answer(scene.permission!.askId, true)
      case 'refuse':
        return answer(scene.permission!.askId, false)
      case 'stop':
        return stop()
      case 'blocks':
        return setBlocks((was) => !was)
    }
  })

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
          width={boxWidth}
          line={scene.line}
          narration={above(scene)}
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
                  focused={!keysUp}
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
