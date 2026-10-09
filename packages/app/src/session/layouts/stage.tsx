import type { SessionLayoutProps } from "./types"

export function StageLayout(props: SessionLayoutProps) {
  return (
    <div data-session-layout="stage" class="relative flex-1 min-h-0 flex flex-col">
      <div
        data-session-stage=""
        data-reading-history={props.readingHistory ? "" : undefined}
        class="relative flex-1 min-h-0 overflow-hidden"
      >
        {props.overlay}
        {props.content}
      </div>
      <div data-session-composer="">{props.composer}</div>
    </div>
  )
}
