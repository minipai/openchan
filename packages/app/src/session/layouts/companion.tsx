import type { SessionLayoutProps } from "./types"
import "./companion.css"

export function CompanionLayout(props: SessionLayoutProps) {
  return (
    <div data-session-layout="companion" class="relative flex-1 min-h-0 min-w-0 flex flex-col">
      <div class="relative flex-1 min-h-0 overflow-hidden">{props.content}</div>
      <div data-session-composer="">{props.composer}</div>
    </div>
  )
}
