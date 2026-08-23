import { useEffect, useRef, useState } from 'react'
import { CAST, remember, remembered, type Character } from './cast'
import { MaidSession } from './opencode'
import { handedOver, hold, next, OPENING, unspoken, type Scene } from './scene'
import type { Conversation, OpenConversation } from './protocol'

export type { Permission, Scene } from './scene'

/** The only agent there is today. Written once rather than inline in the
 * default: a fresh one each render would be a fresh conversation each render
 * to anything that watched it. */
const openMaid: OpenConversation = (say, who) => new MaidSession(say, who)

/**
 * Her, for as long as the window is open.
 *
 * Which agent answers is an argument rather than an import so that the window
 * can be driven by something that is not a running opencode server.
 */
export function useMaid(open: OpenConversation = openMaid) {
  const [scene, setScene] = useState<Scene>(OPENING)
  /** Who the open session is: her artwork on screen, her words in the agent's
   * instructions. It cannot change under a session — only with one. */
  const [who, setWho] = useState<Character>(remembered)
  /** Who the master has asked for. The same one, unless he asked for another
   * while there was a conversation going: then she is waiting for the next
   * session rather than walking into this one. */
  const [asked, setAsked] = useState<Character>(who)
  const session = useRef<Conversation | null>(null)

  useEffect(() => {
    // Only while this is the session on screen. One being closed to make room
    // for another girl fails on its way down and says so — and by then the
    // scene it would be saying it into is hers, not its own.
    let mine = true
    const her = open((event) => {
      if (mine) setScene((was) => next(was, event))
    }, who)
    session.current = her
    void her.start()
    // React never unmounts on the way out — the renderer exits the process
    // itself — so the session is closed off the process's own way out too, or
    // the server is left running behind a terminal nobody is looking at.
    const leaving = () => her.close()
    process.on('exit', leaving)
    return () => {
      mine = false
      process.off('exit', leaving)
      her.close()
      session.current = null
    }
  }, [open, who])

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
    /** Everyone who could be standing there. */
    cast: CAST,
    /** Who is standing there. */
    onShift: who,
    /** Who the picker marks: whoever was asked for, whether or not she has been
     * able to come out yet. */
    nextShift: asked,
    ask(prompt: string) {
      setScene((was) => hold(was, prompt))
    },
    /** What she thinks with from here on. The scene is not touched from here —
     * she is the one who says which model is hers, and the list marks that. */
    use(model: string) {
      session.current?.use(model)
    },
    /**
     * Send for one of the others.
     *
     * Who is on shift is settled when a session opens and not after: the
     * persona goes into the agent when it is started, so swapping mid-sentence
     * would leave her wearing one girl's face over another girl's instructions.
     * So she comes out now if nothing has been said yet — an untouched session
     * is nobody's conversation to interrupt — and otherwise takes the next one,
     * which the screen says out loud rather than leaving her to be a surprise.
     *
     * The pick is written down either way, so the next window opens as whoever
     * was asked for last rather than back at the start of the list.
     */
    swapTo(id: string) {
      const her = CAST.find((one) => one.id === id)
      if (!her) return
      setAsked(her)
      remember(her)
      // Asking for whoever is already standing there is not a swap — and asking
      // again for one who is waiting is, once there is nothing left to
      // interrupt.
      if (her.id === who.id || !unspoken(scene)) return
      // Back to nothing on the way in: the scene on screen belongs to the
      // session being closed, down to whether there is anyone to speak to.
      setScene(OPENING)
      setWho(her)
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
