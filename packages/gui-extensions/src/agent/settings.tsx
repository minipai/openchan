import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useExtension } from "../sdk"
import type definition from "./index"

export default function SettingsPage() {
  const ctx = useExtension<typeof definition>()

  const [state, setState] = createStore({
    responseLanguage: ctx.stores.preferences.value.responseLanguage,
    saveFailed: false,
  })

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{ctx.t("title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{ctx.t("description")}</span>
          </div>
        </div>
      </div>
      <div class="settings-tab-body">
        <div data-component="settings-list">
          <div data-component="settings-row">
            <div data-slot="settings-row-copy">
              <div data-slot="settings-row-title">{ctx.t("responseLanguage.title")}</div>
              <div data-slot="settings-row-description">{ctx.t("responseLanguage.description")}</div>
            </div>
            <div data-slot="settings-row-control">
              <div class="flex w-full min-w-0 max-w-full flex-col gap-2 sm:w-[360px]">
                <form
                  class="flex w-full items-center gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setState("saveFailed", false)

                    try {
                      await ctx.stores.preferences.update((draft) => {
                        draft.responseLanguage = state.responseLanguage.trim()
                      })
                    } catch {
                      if (ctx.signal.aborted) return

                      setState("saveFailed", true)
                    }
                  }}
                >
                  <div class="min-w-0 flex-1">
                    <TextInput
                      data-action="settings-agent-response-language"
                      type="text"
                      appearance="base"
                      value={state.responseLanguage}
                      onInput={(event) => setState("responseLanguage", event.currentTarget.value)}
                      placeholder={ctx.t("responseLanguage.placeholder")}
                      aria-label={ctx.t("responseLanguage.title")}
                      spellcheck={false}
                      autocorrect="off"
                      autocomplete="off"
                      autocapitalize="off"
                    />
                  </div>
                  <Button type="submit" variant="contrast" class="shrink-0">
                    {ctx.t("responseLanguage.save")}
                  </Button>
                </form>
                <Show when={state.saveFailed}>
                  <p class="text-text-danger-base" role="alert">
                    {ctx.t("common.requestFailed")}
                  </p>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
