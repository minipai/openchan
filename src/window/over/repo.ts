import { useEffect, useState } from 'react'
import { howItStands, type Work } from '../../between/repo'

/**
 * How the work stands, once the panel is open and not before.
 *
 * Read at the moment it is opened rather than kept on the scene, because the
 * scene is what she says and this is not hers to say — nothing on it changes
 * when git does, and something read once and left there would be answering with
 * whatever was true the last time anybody looked. Reading it on the way in
 * costs one `git status` per glance, and it is right every time.
 *
 * `undefined` while git is still being asked: it is one command and it is
 * usually over before the frame is drawn, but a folder with a great deal in it
 * takes its time, and a panel that said "no repository here" for half a second
 * first would be saying the one thing this must never say wrongly.
 */
export function useHowItStands(folder: string, open: boolean): Work | null | undefined {
  const [work, setWork] = useState<Work | null | undefined>(undefined)

  useEffect(() => {
    // Nothing carried over from the last time it was opened, and let go of on
    // the way out rather than on the way back in: the answer to the last
    // question would otherwise be on screen for the frame between opening the
    // panel and this running, under a folder she may since have left.
    setWork(undefined)
    if (!open) return
    let stale = false
    void howItStands(folder).then((said) => {
      if (!stale) setWork(said)
    })
    // Put away before git answered, or moved while it was answering: the answer
    // that arrives is to a question nobody is asking any more.
    return () => {
      stale = true
    }
  }, [folder, open])

  return work
}
