import { createMemo, Show } from "solid-js"
import type { MountedSession } from "../sdk"
import { latestSessionFace } from "./face"

export function Portrait(props: { active: () => boolean; session: () => MountedSession }) {
  const face = createMemo(() => {
    const session = props.session()

    return latestSessionFace(
      session.server.data.session.message.list(session.id),
      session.server.data.session.get(session.id)?.revert?.messageID,
    )
  })

  return (
    <Show when={props.active()}>
      <img
        data-component="session-character-portrait"
        src={`/characters/kotone/portraits/${face()}.webp`}
        alt=""
        draggable={false}
        width={540}
        height={720}
      />
    </Show>
  )
}
