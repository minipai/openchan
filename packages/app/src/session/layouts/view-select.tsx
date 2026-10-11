import { For } from "solid-js"
import { useSettings } from "@/settings/model"
import { useLanguage } from "@/runtime/i18n/language"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"

export function ChatViewButton() {
  const language = useLanguage()

  return (
    <Menu placement="bottom-end" gutter={4}>
      <Tooltip value={language.t("session.view.label")} placement="bottom">
        <Menu.Trigger
          as={IconButton}
          variant="ghost-muted"
          size="large"
          class="shrink-0"
          aria-label={language.t("session.view.label")}
          icon={<Icon name="window-cursor" />}
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Content>
          <ChatViewOptions />
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}

export function ChatViewMenu() {
  const language = useLanguage()

  return (
    <Menu.Sub>
      <Menu.SubTrigger>{language.t("session.view.label")}</Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent>
          <ChatViewOptions />
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  )
}

function ChatViewOptions() {
  const settings = useSettings()
  const language = useLanguage()
  let input!: HTMLInputElement

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const view = new FormData(event.currentTarget).get("view")

        if (
          view !== "original" &&
          view !== "stage" &&
          view !== "flow" &&
          view !== "companion" &&
          view !== "document" &&
          view !== "comms"
        )
          return
        settings.general.setChatView(view)
      }}
    >
      <input ref={input} type="hidden" name="view" value={settings.general.chatView()} />
      <Menu.RadioGroup
        value={settings.general.chatView()}
        onChange={(view) => {
          input.value = view
          input.form?.requestSubmit()
        }}
      >
        <For each={["original", "stage", "flow", "companion", "document", "comms"] as const}>
          {(view) => <Menu.RadioItem value={view}>{language.t(`session.view.${view}`)}</Menu.RadioItem>}
        </For>
      </Menu.RadioGroup>
    </form>
  )
}
