import type { JSX } from "solid-js"

/** Presentation slots owned by the shared session screen, not by an individual layout. */
export type SessionLayoutProps = {
  content: JSX.Element
  overlay: JSX.Element
  composer: JSX.Element
  readingHistory: boolean
}
