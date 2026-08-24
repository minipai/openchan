import { useEffect, useRef, useState } from 'react'
import { CAST, remember, remembered, type Character } from '../her/cast'
import { folders, OPENED_IN, rememberFolder, troubleWith } from './folder'
import { MaidSession } from '../opencode/opencode'
import { handedOver, hold, hushed, next, OPENING, unspoken, type Scene } from './scene'
import type { Conversation, OpenConversation } from './protocol'

export type { Asked, Permission, Scene } from './scene'

/** The only agent there is today. Written once rather than inline in the
 * default: a fresh one each render would be a fresh conversation each render
 * to anything that watched it. */
const openMaid: OpenConversation = (say, who, folder) => new MaidSession(say, who, folder)

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
  /** The folder the open session can see. It cannot change under a session
   * either — opencode fixes it when the session is opened — so moving her is
   * the same closing and reopening that sending for one of the others is. */
  const [folder, setFolder] = useState(OPENED_IN)
  /** Wherever she has been, for the list to offer. Kept up here rather than
   * read at the moment the list opens, so that a folder just moved to is in it
   * without the note being read again mid-render. */
  const [been, setBeen] = useState(folders)
  const session = useRef<Conversation | null>(null)
  /**
   * What he has already said she may go on doing, by the scope each yes was
   * given against — `bash git`, or the one file she is editing.
   *
   * It lives here and nowhere else: not on disk, not on the server. So a
   * window opened tomorrow starts with nothing remembered, and neither the
   * agent's own permission settings nor anybody else's session is touched by
   * anything said here. Emptied whenever a session opens, below — a standing
   * yes was given to what she was doing then, and a new session is not that.
   */
  const allowed = useRef(new Set<string>())

  useEffect(() => {
    // Only while this is the session on screen. One being closed to make room
    // for another girl fails on its way down and says so — and by then the
    // scene it would be saying it into is hers, not its own.
    let mine = true
    allowed.current = new Set()
    const her = open(
      (event) => {
        if (!mine) return
        // Something he has already said yes to at this scope is answered where
        // it arrives, and never reaches the screen: being asked again is the
        // whole of what he was trying to stop. It goes back as the same yes any
        // other key sends — the server is never told to allow the tool from
        // here, because that would be every file rather than this one.
        if (event.kind === 'ask-permission' && event.standing && allowed.current.has(event.standing.scope)) {
          return her.answer(event.askId, true)
        }
        setScene((was) => next(was, event))
      },
      who,
      folder,
    )
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
  }, [open, who, folder])

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
    /** The folder she is working in, which the list marks and the screen says. */
    folder,
    /** The folders worth offering her, most recent first. */
    been,
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
    /**
     * Move her to another folder.
     *
     * Unlike sending for one of the others, this does not wait for the next
     * session: being asked to work somewhere else is a thing to do now, and a
     * pick that took effect the next time the window opened would be no answer
     * at all. So the conversation ends here — which is what changing the folder
     * means, because opencode fixes a session's folder when it opens it.
     *
     * Where she was is written down as well as where she is going, so the list
     * that took her away is also the list that brings her back. And whoever was
     * sent for mid-conversation walks into it: this is the next session, which
     * is the one she has been waiting for.
     */
    moveTo(where: string) {
      // A row for a folder that has been moved or deleted since it was written
      // down, or a path typed straight past the box that checks them. Neither is
      // worth opening a session onto nothing for.
      if (where === folder || troubleWith(where) !== null) return
      rememberFolder(folder)
      rememberFolder(where)
      setBeen(folders())
      // Back to nothing on the way in, the same as sending for one of the
      // others: what is on screen belongs to the session being closed.
      setScene(OPENING)
      setWho(asked)
      setFolder(where)
    },
    /**
     * Back into one of the conversations she has already had in this folder.
     *
     * Unlike moving her or sending for one of the others, nothing is closed:
     * every session the folder has ever had is on the same server, so this is
     * her turning to a different page rather than a new girl walking in. The
     * scene is not touched from here either — the session is the one that knows
     * where that conversation was left, and it says so.
     */
    resumeTo(id: string) {
      // What he let her go on doing was said in the conversation being turned
      // away from, and a page she had yesterday is not the one he was watching.
      // The server keeps them all on one session; this does not.
      allowed.current = new Set()
      session.current?.resume(id)
    },
    /**
     * A new conversation, in the same folder, with the same girl.
     *
     * Nothing is closed: it is one more session on the server she is already
     * on, the same as picking an earlier one up. It is also the only way back
     * out of an earlier one — the blank conversation a window opens with drops
     * off the list as soon as it is left, because nothing was ever said in it.
     *
     * The scene is not touched from here: the session is the one that knows
     * whether it got a new conversation to move into, and it says so.
     */
    startFresh() {
      // Not while there is nobody to open one on. She is either still waking
      // up, or whatever took her session is still in the way — and starting
      // over from there would clear the note saying so off the screen, taking
      // the one key that brings her back with it.
      if (!scene.isReady) return
      // What he let her go on doing was said in the conversation being left
      // behind, and a new one has nothing said in it at all.
      allowed.current = new Set()
      session.current?.begin()
    },
    /**
     * Open her again, after something took her session down.
     *
     * Nothing is set from here: the attempt is the one that knows how it went,
     * and it says so — the trouble comes off the screen as it starts and a new
     * one goes up if this one does not get through either. What was said to her
     * meanwhile is still held, and goes the moment she is up.
     */
    retry() {
      // Whatever he let her go on doing was let go of with the session it was
      // said in — and opening her again can come back as a conversation the
      // server has no record of, which is a new one in everything but the id.
      allowed.current = new Set()
      session.current?.retry()
    },
    /** Put what is in the way away. She is still standing there — this is only
     * for the troubles that left her that way — so the box goes back to being
     * hers to be spoken to on, and if it is still true the next thing said to
     * her raises it again. */
    dismiss() {
      // Never the ones that took her session with them, whatever the keys
      // thought when this was pressed: a key press is answered against the last
      // screen drawn, so one aimed at a note that had just been replaced would
      // otherwise leave a window with an input nothing can go out of and no key
      // that does anything.
      setScene((was) => (was.trouble?.gone ? was : { ...was, trouble: null }))
    },
    /** One of the words beside her, taken back off once its moment is up. The
     * row that put it there is the one that keeps the moment — it went up when
     * the row did, and there is one of them per row. */
    hush(id: number) {
      setScene((was) => hushed(was, id))
    },
    answer(askId: string, allow: boolean) {
      session.current?.answer(askId, allow)
      setScene((was) => ({ ...was, permission: null }))
    },
    /**
     * Yes, and yes to the same thing for the rest of this session.
     *
     * What "the same thing" is was settled when the question was raised and is
     * printed next to the key: the one program, the one file, the one host.
     * Nothing wider is remembered from here, because nothing wider was on
     * screen to be agreed to — and a question that came with no scope written
     * for it cannot be answered this way at all, which is why the key is not
     * offered for one.
     */
    allowAlways(askId: string) {
      const standing = scene.permission?.askId === askId ? scene.permission.standing : null
      if (standing) allowed.current.add(standing.scope)
      session.current?.answer(askId, true)
      setScene((was) => ({ ...was, permission: null }))
    },
    /** What was picked, handed back to her. The list comes off the screen here
     * rather than when she acknowledges it — pressing Enter has to look like
     * something happening. */
    choose(askId: string, answers: string[][]) {
      session.current?.choose(askId, answers)
      setScene((was) => ({ ...was, asked: null }))
    },
    /** Her question put down without an answer. She is told so, and goes on
     * without one: nothing picked is not the same as the first row picked. */
    decline(askId: string) {
      session.current?.decline(askId)
      setScene((was) => ({ ...was, asked: null }))
    },
    stop() {
      session.current?.interrupt()
      // Stopped here rather than waited for: the session gives up on the turn
      // before the abort has been round-tripped, so nothing comes back to say
      // it is over. Whatever she was in the middle of is not what she is doing
      // any more, and the 地の文 goes down with the rest of it.
      setScene((was) => ({ ...was, isWorking: false, narration: null, permission: null, asked: null }))
    },
  }
}
