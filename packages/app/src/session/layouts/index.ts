import { FlowLayout } from "./flow"
import { StageLayout } from "./stage"

// A build keeps one layout for its lifetime, including cached timelines and session switches.
export const SessionLayout = import.meta.env.VITE_OPENCODE_CHAT_LAYOUT === "flow" ? FlowLayout : StageLayout
