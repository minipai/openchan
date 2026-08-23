import { useEffect, useRef, useState } from 'react'
import { MaidSession } from './opencode'
import { handedOver, hold, next, OPENING, type Scene } from './scene'
import type { Conversation, OpenConversation } from './protocol'

export type { Permission, Scene } from './scene'

/** The only agent there is today. Written once rather than inline in the
 * default: a fresh one each render would be a fresh conversation each render
 * to anything that watched it. */
const openMaid: OpenConversation = (say) => new MaidSession(say)

/**
 * Her, for as long as the window is open.
 *
 * Which agent answers is an argument rather than an import so that the window
 * can be driven by something that is not a running opencode server.
 */
export function useMaid(open: OpenConversation = openMaid) {
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
  }, [open])

  // Nothing is sent from where it was typed. It waits on the scene until there
  // is a session to take it, and goes the moment there is — the window is up
  // and taking sentences for the several seconds the server takes to boot, and
  // a prompt handed over in that gap is dropped on the floor.
  useEffect(() => {
    if (!scene.isReady || scene.held === null) return
    const waiting = scene.held
    setScene((was) => handedOver(was, waiting))
    session.current?.ask(waiting)
  }, [scene.isReady, scene.held])

  return {
    scene,
    ask(prompt: string) {
      setScene((was) => hold(was, prompt))
    },
    /** What she thinks with from here on. The scene is not touched from here —
     * she is the one who says which model is hers, and the list marks that. */
    use(model: string) {
      session.current?.use(model)
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
