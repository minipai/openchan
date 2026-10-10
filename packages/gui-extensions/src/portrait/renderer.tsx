import { Slot, Style, type Setup } from "../sdk"
import type definition from "./index"
import css from "./portrait.css?inline"
import { Portrait } from "./view"

const setup: Setup<typeof definition> = (ctx) => {
  if (ctx.desktop) return

  ctx.add(Style, css)
  ctx.add(Slot, {
    at: "session.overlay",
    render: (input) => (
      <Portrait
        active={() => input.active}
        session={() => input.session}
        userMessageID={() => input.userMessageID}
      />
    ),
  })
}

export default setup
