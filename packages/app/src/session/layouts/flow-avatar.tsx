import { messageFace } from "@opencode/session-ui/message/face"
import { createMemo } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

export function FlowAvatar(props: { text: string }) {
  const language = useLanguage()
  const label = () => language.t("session.flow.message.role.assistant")
  const face = createMemo(() => messageFace(props.text) ?? "neutral")
  const source = () => `/characters/kotone/portraits/${face()}.webp`

  return (
    <div class="flow-avatar" role="img" aria-label={label()} title={label()}>
      <div class="flow-avatar-circle">
        <img src={source()} alt="" draggable={false} />
      </div>
      <div class="flow-avatar-top" aria-hidden="true" style={{ "background-image": `url("${source()}")` }} />
    </div>
  )
}
