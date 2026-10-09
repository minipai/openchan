import type { SessionLayoutProps } from "./types"
import "./flow.css"

export function FlowLayout(props: SessionLayoutProps) {
  return (
    <div data-session-layout="flow">
      <div
        data-session-stage=""
        data-reading-history={props.readingHistory ? "" : undefined}
        class="relative min-h-0 overflow-hidden"
      >
        {props.content}
      </div>
      <div data-session-composer="">{props.composer}</div>
    </div>
  )
}
