import { createMemo, Show } from "solid-js"
import type { MountedSession } from "../sdk"
import { latestExchangeFace, latestSessionFace } from "@opencode/session-ui/message/face"

export function Portrait(props: {
  active: () => boolean
  session: () => MountedSession
  userMessageID?: () => string | undefined
}) {
  const face = createMemo(() => {
    const session = props.session()
    const messages = session.server.data.session.message.list(session.id)
    const revertMessageID = session.server.data.session.get(session.id)?.revert?.messageID
    const userMessageID = props.userMessageID?.()

    if (userMessageID !== undefined) return latestExchangeFace(messages, userMessageID, revertMessageID)

    return latestSessionFace(messages, revertMessageID)
  })

  return (
    <Show when={props.active()}>
      <img
        data-component="session-character-portrait"
        src={`/characters/kotone/portraits/${face()}.webp`}
        style={{ "--portrait-shape": `url("/characters/kotone/portraits/${face()}.webp")` }}
        alt=""
        draggable={false}
        width={540}
        height={720}
      />
    </Show>
  )
}
