import { useState } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { SpriteLayer, spriteColumns } from './SpriteLayer'
import { DialogueBox } from './DialogueBox'
import { useMaid } from './brain'
import { paletteOver } from './theme'

/** The strip the window leaves under the dialogue box. */
const UNDER_THE_BOX = 1

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

  // Ctrl-C is not handled here on purpose: the renderer takes it, and it is
  // the one that knows how to put the terminal back — leave the alternate
  // screen, and tell it to forget the pictures of her it was given. Killing
  // the process first skips all of that and leaves her on the screen.
  useKeyboard((key) => {
    if (scene.permission) {
      if (key.name === 'y') answer(scene.permission.askId, true)
      if (key.name === 'n' || key.name === 'escape') answer(scene.permission.askId, false)
      return
    }
    if (key.ctrl && key.name === 'b') setBlocks((was) => !was)
    if (key.name === 'escape' && scene.isWorking) stop()
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
          narration={scene.narration}
          mood={scene.mood}
          isWorking={scene.isWorking}
          footer={
            scene.permission ? (
              <box flexDirection="row" gap={2}>
                <text fg={theme.foreground}>{`She wants to use ${scene.permission.toolName}`}</text>
                <text fg={theme.primary}>y allow</text>
                <text fg={theme.muted}>n refuse</text>
              </box>
            ) : (
              <box flexDirection="row" gap={1}>
                <text fg={theme.primary}>›</text>
                <input
                  focused
                  value={typed}
                  placeholder={scene.isWorking ? 'ESC to stop her…' : 'Say something to her…'}
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
    </box>
  )
}
