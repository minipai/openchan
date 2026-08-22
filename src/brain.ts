import { useEffect, useRef, useState } from 'react'
import { MaidSession } from './opencode'
import type { BridgeEvent } from './protocol'
import type { Expression } from './cast'

export type Permission = { askId: string; toolName: string }

/** What is on the scene right now. */
export type Scene = {
  /** What she is saying this turn, as it arrives. */
  line: string
  expression: Expression
  /** The 【…】 she signed with, as she wrote it. */
  mood: string | null
  /** 地の文 — what she is doing, in the words the session gives it. */
  narration: string | null
  isWorking: boolean
  permission: Permission | null
}

const OPENING: Scene = {
  line: '',
  expression: 'neutral',
  mood: null,
  narration: null,
  isWorking: false,
  permission: null,
}

/**
 * Nothing here decides anything — the session already turns opencode's stream
 * into her line, the face she signed it with and what she is doing; this only
 * keeps the latest of each.
 */
export function useMaid() {
  const [scene, setScene] = useState<Scene>(OPENING)
  const session = useRef<MaidSession | null>(null)

  useEffect(() => {
    const her = new MaidSession((event: BridgeEvent) => setScene((was) => next(was, event)))
    session.current = her
    her.start()
    // React never unmounts on the way out — the renderer exits the process
    // itself — so the session is closed off the process's own way out too, or
    // the server is left running behind a terminal nobody is looking at.
    const leaving = () => her.close()
    process.on('exit', leaving)
    return () => {
      process.off('exit', leaving)
      her.close()
      session.current = null
    }
  }, [])

  return {
    scene,
    ask(prompt: string) {
      if (!prompt.trim()) return
      setScene((was) => ({ ...was, line: '', mood: null, narration: null, isWorking: true }))
      session.current?.ask(prompt)
    },
    answer(askId: string, allow: boolean) {
      session.current?.answer(askId, allow)
      setScene((was) => ({ ...was, permission: null }))
    },
    stop() {
      session.current?.interrupt()
      setScene((was) => ({ ...was, isWorking: false, permission: null }))
    },
  }
}

function next(was: Scene, event: BridgeEvent): Scene {
  switch (event.kind) {
    case 'says':
      return {
        ...was,
        line: event.line,
        expression: event.expression ?? was.expression,
        mood: event.mood ?? was.mood,
        narration: null,
      }
    // Everything she picks up gets narrated: there is one line of 地の文 and
    // nothing else on this screen, so nothing is hidden.
    case 'doing':
      return { ...was, narration: event.label }
    case 'ask-permission':
      return { ...was, permission: { askId: event.askId, toolName: event.toolName } }
    case 'done':
      return { ...was, isWorking: false, permission: null, line: event.error ?? was.line }
  }
}
