import { FlowLayout } from "./flow"
import { StageLayout } from "./stage"
import { CompanionLayout } from "./companion"

// A build keeps one layout for its lifetime, including cached timelines and session switches.
export const SessionLayout = selectLayout(import.meta.env.VITE_OPENCODE_CHAT_LAYOUT)

function selectLayout(layout: string | undefined) {
  if (layout === "companion") return CompanionLayout

  if (layout === "flow") return FlowLayout

  return StageLayout
}
