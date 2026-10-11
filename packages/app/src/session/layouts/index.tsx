import { Show } from "solid-js"
import { useSettings } from "@/settings/model"
import type { SessionLayoutProps } from "./types"
import "./flow.css"
import "./companion.css"
import "./comms.css"
import "./document.css"

export function SessionLayout(props: SessionLayoutProps) {
  const settings = useSettings()

  // Keep the timeline and composer slots mounted while only their presentation changes.
  return (
    <div data-session-layout={settings.general.chatView()} class="relative flex-1 min-h-0 min-w-0 flex flex-col">
      <div
        data-session-stage=""
        data-reading-history={props.readingHistory ? "" : undefined}
        class="relative flex-1 min-h-0 overflow-hidden"
      >
        <Show when={settings.general.chatView() === "stage"}>{props.overlay}</Show>
        {props.content}
      </div>
      <div data-session-composer="">{props.composer}</div>
    </div>
  )
}
