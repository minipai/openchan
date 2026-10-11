import { lazy, onCleanup, Suspense } from "solid-js"
import { onIdle, SessionPrepare, SettingsPage, type Setup } from "../sdk"
import type definition from "./index"
import { prepareInstructions } from "./instructions"

const setup: Setup<typeof definition> = (ctx) => {
  const Page = lazy(() => import("./settings"))
  onCleanup(onIdle(() => void Page.preload()))

  ctx.add(SettingsPage, {
    id: "agent",
    icon: "globe",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [
        { id: "agent", title: ctx.t("title") },
        {
          id: "settings-agent-response-language",
          title: ctx.t("responseLanguage.title"),
          description: ctx.t("responseLanguage.description"),
        },
      ]
    },
    render: () => (
      <Suspense>
        <Page />
      </Suspense>
    ),
  })

  ctx.add(SessionPrepare, {
    prepare: (input) =>
      prepareInstructions(
        input.client,
        input.sessionID,
        input.directory,
        ctx.stores.preferences.value.responseLanguage,
        input.signal,
      ),
  })
}

export default setup
