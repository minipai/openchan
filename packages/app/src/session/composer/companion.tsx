import { createMemo, on } from "solid-js"
import type { SessionModel } from "../model"
import type { SessionComposerController } from "./controller"

/** Choose on state entry, so draft edits and streamed output never restart the animation. */
export function ComposerCompanion(props: { session: SessionModel; model: SessionComposerController }) {
  const state = createMemo(() => {
    if (props.model.region.state.blocked()) return "waiting"

    if (props.session.data.working()) return "working"

    if (props.model.composer.value().trim()) return "typing"

    const last = props.session.history.messages().at(-1)

    if (last?.type === "idle" && last.outcome === "failed") return "error"

    if (last?.type === "idle" && last.outcome === "succeeded") return "success"

    return "idle"
  })

  const animation = createMemo(
    on(state, (value) => {
      const choices = variants[value]

      return choices[Math.floor(Math.random() * choices.length)]
    }),
  )

  return (
    <picture class="composer-companion" aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcset={`/characters/kotone/companion/${animation()}.png`} />
      <img src={`/characters/kotone/companion/${animation()}.gif`} alt="" width="160" height="300" draggable={false} />
    </picture>
  )
}

const variants = {
  idle: ["idle-01", "idle-02", "idle-03"],
  typing: ["typing-03", "typing-04", "typing-05"],
  working: ["working-01", "working-02", "working-03", "working-04", "working-05"],
  error: ["error-03", "error-04", "error-05"],
  success: ["success-01", "success-02", "success-03", "success-04", "success-05"],
  waiting: ["waiting-02", "waiting-03", "waiting-04", "waiting-05"],
}
