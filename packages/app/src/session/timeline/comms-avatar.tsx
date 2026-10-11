import type { Accessor, JSX } from "solid-js"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

type ContextUsage = { used: number; limit: number; percentage: number }

type CommsAvatarProps = {
  contextUsage: Accessor<ContextUsage | undefined>
  portrait: JSX.Element
}

export function CommsAvatar(props: CommsAvatarProps) {
  const language = useLanguage()
  const ringRadius = 82
  const circumference = 2 * Math.PI * ringRadius

  const contextLabel = () => {
    const usage = props.contextUsage()

    if (!usage) return language.t("session.comms.context.unavailable")

    return language.t("session.comms.context.usage", {
      percentage: usage.percentage.toLocaleString(language.intl()),
      used: usage.used.toLocaleString(language.intl()),
      limit: usage.limit.toLocaleString(language.intl()),
    })
  }

  return (
    <section class="comms-portrait" aria-label={language.t("session.comms.header")}>
      <div class="comms-portrait__avatar" role="img" aria-label={contextLabel()}>
        {props.portrait}
        <svg class="comms-portrait__context-ring" viewBox="0 0 180 200" aria-hidden="true">
          <circle class="comms-portrait__context-track" cx="90" cy="100" r={ringRadius} />
          <Show when={props.contextUsage()}>
            {(usage) => (
              <circle
                class="comms-portrait__context-progress"
                cx="90"
                cy="100"
                r={ringRadius}
                stroke-dasharray={`${circumference}`}
                stroke-dashoffset={`${circumference * (1 - Math.min(100, Math.max(0, usage().percentage)) / 100)}`}
              />
            )}
          </Show>
        </svg>
      </div>
    </section>
  )
}
