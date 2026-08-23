import { useEffect, useRef, useState } from 'react'
import { MaidSession } from './opencode'
import { next, OPENING, type Scene } from './scene'
import type { Conversation, OpenConversation } from './protocol'

export type { Permission, Scene } from './scene'

/**
 * Her, for as long as the window is open.
 *
 * Which agent answers is an argument rather than an import so that the window
 * can be driven by something that is not a running opencode server — the
 * default is the only one there is today.
 */
export function useMaid(open: OpenConversation = (say) => new MaidSession(say)) {
  const [scene, setScene] = useState<Scene>(OPENING)
  const session = useRef<Conversation | null>(null)

  useEffect(() => {
    const her = open((event) => setScene((was) => next(was, event)))
    session.current = her
    void her.start()
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
