import { useEffect, useEffectEvent, useState } from 'react'
import { CliRenderEvents, type Selection } from '@opentui/core'
import { useRenderer } from '@opentui/react'

/** How long a word about what just happened stays under the box. */
const SAID_FOR = 2000

/**
 * What the window says when a clipboard write comes to nothing. The renderer
 * asks the terminal what it can take and the terminal answered that it cannot
 * take this — it is said, because a copy that quietly did nothing looks exactly
 * like one that worked until it is pasted.
 */
const WILL_NOT_TAKE = 'this terminal will not take a clipboard write'

/**
 * A word about what the window just did, and the copies that are most of what
 * there is to say a word about.
 *
 * The two are one thing because a copy is the one kind of doing that leaves
 * nothing on screen: what was copied looks exactly the same afterwards, and
 * whether the terminal took it is only found out by pasting somewhere else. So
 * every way out through the clipboard says what happened, and the saying is
 * here rather than at each of them.
 */
export function useNote() {
  const renderer = useRenderer()
  // A word about what the window just did, for a moment. Wrapped rather than
  // bare so that the same word twice running is two words, each with its own
  // moment — the second copy would otherwise inherit what was left of the
  // first's.
  const [note, setNote] = useState<{ text: string } | null>(null)
  useEffect(() => {
    if (note === null) return
    const gone = setTimeout(() => setNote(null), SAID_FOR)
    return () => clearTimeout(gone)
  }, [note])
  const say = (text: string) => setNote({ text })
  // Out through the terminal's own clipboard escape (OSC 52): the window has
  // no hands of its own and the terminal is the one thing between it and the
  // master's clipboard. Either way it says what happened — the renderer knows
  // when the terminal has said no, and a copy that did nothing and said
  // nothing looks like one that worked.
  const copy = (text: string, what: string) => {
    const taken = renderer.copyToClipboardOSC52(text)
    say(taken ? `copied ${what}` : WILL_NOT_TAKE)
  }
  // The renderer tracks a drag over any text on screen and draws it, and says
  // so when it is let go of — and that was the whole of it: what was selected
  // was then dropped. This is the other half. A click is let go of too, and
  // selects nothing; nothing is said about nothing.
  //
  // An event rather than a closure: the listener is hung on the renderer once
  // and stays, and what it calls has to be what this render would have called.
  const letGo = useEffectEvent((selection: Selection) => {
    const text = selection.getSelectedText()
    if (text) copy(text, 'the selection')
  })
  useEffect(() => {
    renderer.on(CliRenderEvents.SELECTION, letGo)
    return () => void renderer.off(CliRenderEvents.SELECTION, letGo)
  }, [renderer])

  return { note: note?.text ?? null, say, copy }
}
