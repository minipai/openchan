import { Avatar } from "@opencode/ui/avatar"
import { messageFace } from "@opencode/session-ui/message/face"
import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

export function FlowAvatar(props: { text: string }) {
  const language = useLanguage()
  const label = () => language.t("session.flow.message.role.assistant")
  const face = createMemo(() => messageFace(props.text) ?? "neutral")

  return (
    <Show when={face()} keyed>
      {(face) => (
        <Avatar
          class="flow-avatar"
          data-role="assistant"
          role="img"
          aria-label={label()}
          title={label()}
          fallback={label()}
          src={`/characters/kotone/portraits/${face}.webp`}
          size="normal"
        />
      )}
    </Show>
  )
}
