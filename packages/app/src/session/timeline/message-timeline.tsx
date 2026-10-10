import { createEffect, createMemo, createSignal, on, onCleanup, Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Key } from "@solid-primitives/keyed"
import { Predicate } from "effect"
import { createAnimatedPresence } from "@/runtime/animated-presence"
import type { SessionUserActions } from "@opencode/session-ui/actions"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { InlineInput } from "@opencode/ui/inline-input"
import { Keybind } from "@opencode/ui/keybind"
import { Menu } from "@opencode/ui/menu"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import type { BackgroundTask, MountedSession, SessionScreen } from "@opencode/gui-extensions/sdk"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { ExtensionSlot } from "@/runtime/extension/render"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import { useWorkspaceLocation } from "@/workspaces/location"
import { Timeline, TimelineRow } from "@opencode/session-ui/timeline/projection"
import { createSessionTimelineRowRenderer } from "@opencode/session-ui/timeline/row"
import { getReadyMarkdown, preloadMarkdown } from "@opencode/session-ui/markdown-cache"
import { createTimelineController, type TimelineController, type TimelineSessionSource } from "./controller"
import { createTimelineVirtualizer } from "./virtualizer"
import { createFlowTimelineDensity, flowMessageSummary } from "./flow-density"
import { useSettings } from "@/settings/model"
import { FlowAvatar } from "../layouts/flow-avatar"
import { ChatViewButton } from "../layouts/view-select"
import { containsDirectory } from "@opencode/util/path"
import { isWorkspaceDirectory } from "@/workspaces/paths"
import { parseCommentNote, readPromptPresentation } from "@/composer/comment-note"
import { useCommand } from "@/shell/commands/command"
import { SessionAncestorTrail, SessionProjectMenu, SessionTitleHeader } from "../session-identity-header"
import { SessionHeaderSpacer } from "@/session/header/session-header"
import { SessionRunningMenu } from "@/session/header/session-running-menu"

type BlockingTask = { type: "shell" | "subagent"; partID: string; id?: string; label?: string }

type SessionBackground = {
  blocking: Accessor<BlockingTask[]>
  tasks: Accessor<readonly BackgroundTask[]>
  running: {
    sessionID: Accessor<string | undefined>
    blocking: Accessor<BlockingTask[]>
    tasks: Accessor<readonly BackgroundTask[]>
  }
  move: () => Promise<void>
}

export function BackgroundMoveHint(props: { keybind?: string[]; onMove?: () => void }) {
  const language = useLanguage()
  const command = useCommand()
  const keys = () => props.keybind ?? command.keybindParts("session.background")
  const keybind = () => props.keybind?.join("+") ?? command.keybind("session.background")

  return (
    <Button
      data-component="session-background-hint"
      type="button"
      variant="ghost-faint"
      size="small"
      class="max-w-full"
      aria-label={language.t("session.background.moveInline", { keybind: keybind() })}
      onClick={() => props.onMove?.()}
    >
      <span class="min-w-0 truncate">{language.t("session.background.moveRunning")}</span>
      <Keybind keys={keys()} variant="neutral" />
    </Button>
  )
}

type MessageTimelineProps = {
  hideHeader?: boolean
  active?: boolean
  session: TimelineSessionSource
  view: MountedSession
  screen: SessionScreen
  background: SessionBackground
  actions?: SessionUserActions
  scroll: { overflow: boolean; jump: boolean }
  onResumeScroll: () => void
  setScrollRef: (el: HTMLDivElement | undefined) => void
  onScheduleScrollState: (el: HTMLDivElement) => void
  onPin: () => void
  onUnpin: () => void
  onUserScroll: (target?: EventTarget | null) => void
  onHistoryScroll: () => void
  onSelectionInteraction: (event: MouseEvent) => void
  pinned: boolean
  centered: boolean
  reserveReviewToggle: boolean
  setContentRef: (el: HTMLDivElement) => void
  anchor: (id: string) => string
  setRevealMessage?: (fn: (id: string, partID?: string) => void) => void
  setScrollToEnd?: (fn: () => void) => void
  reveal?: { target: () => string | undefined; done: () => void }
  search?: JSX.Element
}

export function MessageTimeline(props: MessageTimelineProps) {
  const controller = createTimelineController({ session: props.session })
  const tail = props.pinned ? controller.data.projection.rows().at(-1) : undefined

  if (tail?._tag === "AssistantPart" && tail.group.type === "part") {
    const message = controller.data.projection.messageByID().get(tail.group.ref.messageID)

    if (message?.type === "assistant" && message.time.completed !== undefined) {
      const content = Timeline.resolveContent(message, tail.group.ref.partID)

      // Start the required worker job while the rest of the selected view is constructed.
      if (content?.type === "text" && content.text.trim()) {
        const preload = new AbortController()
        onCleanup(() => preload.abort())
        void preloadMarkdown(content.text, tail.group.ref.partID, preload.signal).catch(() => undefined)
      }
    }
  }

  return (
    <MessageTimelineView {...props} data={controller.data} action={controller.action} pending={controller.pending} />
  )
}

function MessageTimelineView(
  props: MessageTimelineProps & {
    data: TimelineController["data"]
    action: TimelineController["action"]
    pending: TimelineController["pending"]
  },
) {
  const language = useLanguage()
  const settings = useSettings()
  const server = useServer()
  const data = server.ctx.data
  const sdk = useWorkspaceLocation()
  const sessionID = props.data.sessionID
  const sessionStatus = props.data.status
  const titleLabel = props.data.titleLabel
  const parentID = props.data.parentID
  const parentTitle = props.data.parentTitle
  const childTitle = props.data.childTitle
  const projection = props.data.projection

  const flowDensity = createFlowTimelineDensity({ projection })
  const isFlow = () => settings.general.chatView() === "flow"

  const sessionDirectory = createMemo(() => props.session.data.info()?.location.directory ?? sdk().directory)

  const project = createMemo(() => {
    const session = props.session.data.info()
    const projects = server.ctx.sync.data.project

    return session
      ? server.ctx.projects.detailsForSession(session)
      : projects.find((item) => containsDirectory(item.worktree, sessionDirectory()))
  })

  const workspaceSession = createMemo(() => isWorkspaceDirectory(project(), sessionDirectory()))

  const headerProject = createMemo(() => {
    const session = props.session.data.info()

    if (!session) return

    return server.ctx.projects.forSession(session)
  })

  createEffect(() => {
    const directory = project()?.worktree

    if (!directory) return
    void data.location.vcs.sync({ directory }).catch(() => undefined)
  })
  const turnPadding = () => (isFlow() ? "" : "px-4 md:px-5")
  const showHeader = createMemo(() => !props.hideHeader && (props.data.showHeader() || workspaceSession()))
  const pinned = createMemo(() => props.pinned)
  const messageByID = projection.messageByID

  const timelineProjection = {
    activeMessageID: projection.activeMessageID,
    messageByID,
    messageLastRowIndex: () =>
      isFlow() ? flowDensity.projection.messageLastRowIndex() : projection.messageLastRowIndex(),
    messageRowIndex: () => (isFlow() ? flowDensity.projection.messageRowIndex() : projection.messageRowIndex()),
    rowByKey: () => (isFlow() ? flowDensity.projection.rowByKey() : projection.rowByKey()),
    rows: () => (isFlow() ? flowDensity.projection.rows() : projection.rows()),
  }

  const userPresentation = (message: Extract<SessionMessageInfo, { type: "user" }>) => {
    const value = readPromptPresentation(message.metadata)
    const parsed = value ? undefined : parseCommentNote(message.text)

    return {
      displayText: value?.displayText,
      comments: value?.comments ?? (parsed ? [parsed] : []),
      references: value?.attachments,
    }
  }

  const virtualized = createTimelineVirtualizer({
    active: () => props.active !== false,
    sessionKey: () => `${server.key}/${props.data.sessionID()}`,
    presentationKey: () => JSON.stringify(props.data.timelineDetail()),
    layoutKey: settings.general.chatView,
    projection: timelineProjection,
    rowMembers: (row) => (isFlow() ? flowDensity.members(row) : undefined),
    showHeader,
    pinned,
    scroll: () => props.scroll,
    onResumeScroll: props.onResumeScroll,
    setScrollRef: props.setScrollRef,
    setContentRef: props.setContentRef,
    onScheduleScrollState: props.onScheduleScrollState,
    onPin: props.onPin,
    onUnpin: props.onUnpin,
    onSelectionInteraction: props.onSelectionInteraction,
    onUserScroll: props.onUserScroll,
    onHistoryScroll: props.onHistoryScroll,
    canRenderImmediately: (row, disclosure) => {
      if (
        Predicate.isTagged(row, "TurnGap") ||
        Predicate.isTagged(row, "TurnDivider") ||
        Predicate.isTagged(row, "CompactionQueued")
      )
        return true

      if (Predicate.isTagged(row, "Notice")) {
        const message = messageByID().get(row.messageID)

        return (
          (message?.type === "system" || message?.type === "synthetic") &&
          (message.description ?? message.text).length <= 1024
        )
      }

      if (Predicate.isTagged(row, "UserMessage")) {
        const message = messageByID().get(row.userMessageID)

        if (message?.type !== "user" || message.text.length > 1024 || message.files?.length || message.agents?.length)
          return false
        const presentation = readPromptPresentation(message.metadata)

        return (
          (presentation?.displayText ?? message.text).length <= 1024 &&
          !presentation?.comments?.length &&
          !presentation?.attachments.length &&
          !parseCommentNote(message.text)
        )
      }

      if (!Predicate.isTagged(row, "AssistantPart") || row.group.type !== "part") return false
      const message = messageByID().get(row.group.ref.messageID)

      if (message?.type !== "assistant" || message.time.completed === undefined) return false
      const content = Timeline.resolveContent(message, row.group.ref.partID)

      if (content?.type === "reasoning")
        return !(disclosure[row.group.ref.partID] ?? props.data.reasoningMode() === "full")

      return (
        content?.type === "text" &&
        content.text.length <= 1024 &&
        !!getReadyMarkdown({ raw: content.text, src: content.text }, `${row.group.ref.partID}:0:full`)
      )
    },
    setRevealMessage: props.setRevealMessage,
    setScrollToEnd: props.setScrollToEnd,
    beforeRevealMessage: (id, partID) => {
      if (isFlow()) flowDensity.prepareRevealMessage(id, partID)
    },
    reveal: props.reveal,
  })

  const VirtualizedTimeline = virtualized.View

  const [title, setTitle] = createStore({
    draft: "",
    editing: false,
    menuOpen: false,
    pendingRename: false,
  })

  let titleRef: HTMLInputElement | undefined

  createEffect(
    on(
      props.data.sessionKey,
      () =>
        setTitle({
          draft: "",
          editing: false,
          menuOpen: false,
          pendingRename: false,
        }),
      { defer: true },
    ),
  )

  const openTitleEditor = () => {
    if (!sessionID() || parentID()) return
    setTitle({ editing: true, draft: titleLabel() ?? "" })
    requestAnimationFrame(() => {
      if (!titleRef) return
      titleRef.focus()
      titleRef.select()
    })
  }

  const closeTitleEditor = () => {
    if (props.pending.rename()) return
    setTitle("editing", false)
  }

  const saveTitleEditor = async () => {
    if (!title.editing || props.pending.rename()) return

    if (await props.action.rename(title.draft)) setTitle("editing", false)
  }

  createEffect(() => {
    if (props.active !== false) return
    setTitle({ draft: "", editing: false, menuOpen: false, pendingRename: false })
  })

  const rowRenderer = createSessionTimelineRowRenderer({
    sessionID: () => sessionID()!,
    status: sessionStatus,
    projection,
    presentation: userPresentation,
    actions: props.actions,
    reasoningMode: props.data.reasoningMode,
    shellToolDefaultOpen: props.data.shellToolPartsExpanded,
    editToolDefaultOpen: props.data.editToolPartsExpanded,
    timelineDetail: props.data.timelineDetail,
    disclosure: virtualized.disclosure,
    centered: () => props.centered,
    padding: turnPadding,
    anchor: props.anchor,
  })

  const backgroundHintPartID = createMemo(() => {
    const blocking = new Set(props.background.blocking().map((task) => task.partID))

    if (blocking.size === 0) return

    return projection
      .rows()
      .flatMap((row) =>
        Predicate.isTagged(row, "AssistantPart") ? (row.group.type === "part" ? [row.group.ref] : row.group.refs) : [],
      )
      .findLast((ref) => blocking.has(ref.partID))?.partID
  })

  const [backgroundHintRef, setBackgroundHintRef] = createSignal<HTMLDivElement>()

  const backgroundHintPresence = createAnimatedPresence(
    backgroundHintPartID,
    () => backgroundHintRef() ?? null,
    sessionID,
    1000,
  )

  const showWorking = createMemo(() => {
    const id = sessionID()

    if (!id || sessionStatus().type !== "busy") return false

    if (data.session.permission.list(id)?.length || data.session.form.list(id)?.length) return false
    const active = projection.activeMessageID()

    if (!active) return false
    const assistant = projection.assistantMessagesByParent().get(active)?.at(-1)

    if (assistant?.retry) return false

    // Pending steers still project under the previous response until delivery.
    // Its error must not hide feedback for a newly submitted prompt.
    if (
      assistant?.error &&
      !data.session.pending.list(id).some((item) => item.type === "user" && item.delivery === "steer")
    )
      return false
    const content = assistant?.content.at(-1)

    if (
      assistant?.time.completed === undefined &&
      assistant?.time.streamed === undefined &&
      content?.type === "text" &&
      content.text.trim()
    )
      return false
    const background = new Set(props.background.tasks().map((task) => task.id))

    return !projection.rows().some((row) => {
      if (row.userMessageID !== active) return false

      if (Predicate.isTagged(row, "Thinking")) return true

      if (Predicate.isTagged(row, "Notice")) {
        const message = messageByID().get(row.messageID)

        return message?.type === "compaction" && message.status === "running"
      }

      // Used and read groups keep the fallback, so each new read does not swap Working out for its short call.
      if (!Predicate.isTagged(row, "AssistantPart") || row.group.type === "context" || row.group.type === "read")
        return false

      return (row.group.type === "part" ? [row.group.ref] : row.group.refs).some((ref) => {
        const content = Timeline.resolveContent(messageByID().get(ref.messageID), ref.partID)

        if (content?.type !== "tool") return false

        if (content.state.status === "streaming" || content.state.status === "running") return true
        const taskID = content.state.metadata?.[content.name === "subagent" ? "sessionID" : "shellID"]

        return background.has(content.id) || (Predicate.isString(taskID) && background.has(taskID))
      })
    })
  })

  const renderRow = (row: Accessor<TimelineRow.TimelineRow>, onSizeChange?: () => void) => {
    const density = isFlow() ? flowDensity : undefined

    if (!density || Predicate.isTagged(row(), "TurnDivider"))
      return <rowRenderer.Row row={row} onSizeChange={onSizeChange} />

    const role = () => density.role(row())

    const members = createMemo(() =>
      (density.members(row()) ?? [row()]).map((member) => density.summarySource(member) ?? member),
    )

    const messages = createMemo(() => members().filter(density.canCollapse))

    const text = createMemo(() =>
      messages()
        .flatMap((message) => {
          if (!Predicate.isTagged(message, "AssistantPart") || message.group.type !== "part") return []

          const content = Timeline.resolveContent(
            messageByID().get(message.group.ref.messageID),
            message.group.ref.partID,
          )

          return content?.type === "text" ? [content.text] : []
        })
        .join("\n\n"),
    )

    const targets = createMemo(() => {
      if (messages().length)
        return messages().map((message) => ({
          open: density.isExpanded(message),
          set: (open: boolean) => (open ? density.expand(message) : density.collapse(message)),
        }))

      return members().flatMap((member) => {
        if (!Predicate.isTagged(member, "AssistantPart")) return []
        const key = member.group.type === "context" ? `context:${member.group.key}` : member.group.key

        return [
          {
            open: virtualized.disclosure.value(key) === true,
            set: (open: boolean) => virtualized.disclosure.set(key, open),
          },
        ]
      })
    })

    const open = () => targets().some((target) => target.open)

    return (
      <div
        data-flow-message-divider=""
        class="flow-entry min-w-0 w-full max-w-full"
        classList={{ "md:max-w-[1000px] md:mx-auto": props.centered }}
      >
        <Show when={role() !== "assistant" || messages().length > 0}>
          <button
            type="button"
            class="flow-identity"
            aria-label={language.t(open() ? "session.flow.message.collapseRole" : "session.flow.message.expandRole", {
              role: language.t(`session.flow.message.role.${role()}`),
            })}
            aria-expanded={open()}
            disabled={!targets().length}
            onClick={() => {
              const next = !open()
              targets().forEach((target) => target.set(next))
            }}
          >
            <Show
              when={role() === "assistant"}
              fallback={<span class="flow-label">{language.t(`session.flow.message.role.${role()}`)}</span>}
            >
              <FlowAvatar text={text()} />
            </Show>
          </button>
        </Show>
        <div class="flow-content min-w-0">
          <Show when={density.members(row())} fallback={renderContent(row, onSizeChange)}>
            <Key each={density.members(row())} by={TimelineRow.key}>
              {(member) => renderContent(member, onSizeChange)}
            </Key>
          </Show>
        </div>
      </div>
    )
  }

  const renderContent = (row: Accessor<TimelineRow.TimelineRow>, onSizeChange?: () => void) => {
    const density = isFlow() ? flowDensity : undefined

    if (!density) return <rowRenderer.Row row={row} onSizeChange={onSizeChange} />
    const current = row()
    const source = density.summarySource(current)

    if (source) {
      const messageID = density.summaryMessageID(current)
      const message = messageID ? messageByID().get(messageID) : undefined

      if (!messageID || !message) return <></>

      const preview = createMemo(() => {
        const current = messageByID().get(messageID)

        if (!current) return ""

        const value = flowMessageSummary(
          current,
          current.type === "assistant" ? density.summaryContent(row()) : undefined,
        )

        const displayValue = current.type === "user" ? (userPresentation(current).displayText ?? value) : value

        return displayValue.replace(/\s+/g, " ").trim()
      })

      return (
        <div
          data-message-id={current.userMessageID}
          class="flow-summary min-w-0 w-full max-w-full flex h-7 items-center gap-2"
        >
          <span
            dir="auto"
            title={preview() || undefined}
            class="flow-summary-text min-w-0 flex-1 truncate text-[13px] leading-text-compact text-v2-text-text-base"
          >
            {preview() || language.t("session.flow.message.empty")}
          </span>
          <button
            type="button"
            aria-label={language.t("session.flow.message.expand")}
            aria-expanded={false}
            class="flex h-7 w-7 shrink-0 items-center justify-center"
            onClick={(event) => {
              event.stopPropagation()
              density.expand(source)
            }}
          >
            <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          </button>
        </div>
      )
    }

    return (
      <div class="min-w-0 w-full max-w-full" classList={{ "flow-expanded": density.canCollapse(row()) }}>
        <rowRenderer.Row row={row} onSizeChange={onSizeChange} />
        <Show when={density.canCollapse(row()) && density.isExpanded(row())}>
          <IconButton
            icon={<Icon name="chevron-down" size="small" class="rotate-180" />}
            variant="ghost-muted"
            size="small"
            aria-label={language.t("session.flow.message.collapse")}
            aria-expanded={true}
            onClick={(event) => {
              event.stopPropagation()
              density.collapse(current)
            }}
          />
        </Show>
      </div>
    )
  }

  return (
    <VirtualizedTimeline
      workspaceSession={workspaceSession}
      bottomSpacer={
        <Show when={showWorking() || backgroundHintPresence.present()}>
          <div
            classList={{
              "min-w-0 w-full max-w-full": true,
              "md:max-w-[1000px] md:mx-auto": props.centered,
            }}
          >
            <div
              class={`flex h-9 items-center gap-2 pt-3 text-[13px] font-[530] leading-text-compact ${turnPadding()}`}
            >
              <Show when={showWorking()}>
                <div data-component="session-working" role="status">
                  <TextShimmer text={language.t("session.timeline.working")} active />
                </div>
              </Show>
              <Show when={backgroundHintPresence.present()}>
                <div
                  ref={setBackgroundHintRef}
                  data-component="session-background-hint-row"
                  class="duration-150 motion-reduce:animate-none"
                  classList={{
                    "animate-in fade-in": backgroundHintPresence.animate() && backgroundHintPresence.show(),
                    "animate-out fade-out fill-mode-forwards":
                      backgroundHintPresence.animate() && !backgroundHintPresence.show(),
                  }}
                >
                  <BackgroundMoveHint onMove={props.background.move} />
                </div>
              </Show>
            </div>
          </div>
        </Show>
      }
      deferred={(row) =>
        ((isFlow() ? flowDensity.members(row) : undefined) ?? [row]).some((member) => {
          if (!Predicate.isTagged(member, "AssistantPart") || member.group.type !== "part") return false

          const content = Timeline.resolveContent(
            messageByID().get(member.group.ref.messageID),
            member.group.ref.partID,
          )

          return content?.type === "tool" && ["edit", "write"].includes(content.name)
        })
      }
      renderRow={renderRow}
      header={
        <Show when={!props.hideHeader}>
          <SessionTitleHeader>
            <div class="h-12 w-full flex items-center justify-between gap-2">
              <div class="flex items-center gap-1 min-w-0 flex-1">
                <div class="flex items-center gap-0.5 min-w-0 flex-1 w-full">
                  <SessionProjectMenu
                    project={headerProject()}
                    directory={sessionDirectory()}
                    workspace={workspaceSession()}
                  />
                  <Show when={parentID()}>
                    {(id) => (
                      <SessionAncestorTrail
                        sessionID={sessionID() ?? ""}
                        parentID={id()}
                        parentTitle={parentTitle()}
                        trailing={!!(childTitle() || title.editing)}
                      />
                    )}
                  </Show>
                  <Show when={childTitle() || title.editing}>
                    <Show
                      when={title.editing}
                      fallback={
                        <h1
                          data-slot="session-title-child"
                          class="truncate text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base w-fit rounded-[6px] px-1 py-1 hover:bg-v2-overlay-simple-overlay-hover"
                          classList={{ "max-w-[45%] shrink-0": !!parentID() }}
                          onClick={openTitleEditor}
                        >
                          {childTitle()}
                        </h1>
                      }
                    >
                      <InlineInput
                        ref={(el) => {
                          titleRef = el
                        }}
                        data-slot="session-title-child"
                        dir="auto"
                        value={title.draft}
                        disabled={props.pending.rename()}
                        class="block text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base field-sizing-content rounded-[6px] px-1 py-1"
                        classList={{ "max-w-[45%] shrink-0": !!parentID() }}
                        style={{
                          "--inline-input-shadow": "none",
                          "text-align": "start",
                        }}
                        onInput={(event) => setTitle("draft", event.currentTarget.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation()

                          if (event.isComposing || event.keyCode === 229) return

                          if (event.key === "Enter") {
                            event.preventDefault()
                            void saveTitleEditor()

                            return
                          }

                          if (event.key === "Escape") {
                            event.preventDefault()
                            closeTitleEditor()
                          }
                        }}
                        onBlur={() => void saveTitleEditor()}
                      />
                    </Show>
                  </Show>
                  <Show when={!parentID() && sessionID()} keyed>
                    {(id) => (
                      <Menu
                        gutter={6}
                        placement="bottom-start"
                        open={title.menuOpen}
                        onOpenChange={(open) => setTitle("menuOpen", open)}
                      >
                        <Menu.Trigger
                          as={IconButton}
                          icon={<Icon name="outline-dots" />}
                          variant="ghost-muted"
                          size="large"
                          class="shrink-0"
                          aria-label={language.t("common.moreOptions")}
                          aria-expanded={title.menuOpen}
                        />
                        <Menu.Portal>
                          <Menu.Content
                            class="session-options-menu w-max"
                            style={{ "min-width": "0" }}
                            onCloseAutoFocus={(event) => {
                              if (!title.pendingRename) return
                              event.preventDefault()
                              setTitle("pendingRename", false)
                              openTitleEditor()
                            }}
                          >
                            <Show when={!parentID()}>
                              <Menu.Item
                                onSelect={() => {
                                  setTitle("pendingRename", true)
                                  setTitle("menuOpen", false)
                                }}
                              >
                                {language.t("common.rename")}
                              </Menu.Item>
                              <Menu.Item onSelect={() => void props.action.export(id)}>
                                {language.t("common.export")}…
                              </Menu.Item>
                            </Show>
                            <Show when={!parentID()}>
                              {/* TODO: Need a session archive API. */}
                              <Menu.Separator />
                              <Menu.Item onSelect={() => props.action.showDelete(id)}>
                                {language.t("common.delete")}…
                              </Menu.Item>
                            </Show>
                          </Menu.Content>
                        </Menu.Portal>
                      </Menu>
                    )}
                  </Show>
                  <SessionRunningMenu
                    sessionID={sessionID()}
                    owner={props.background.running.sessionID()}
                    blocking={props.background.running.blocking()}
                    tasks={props.background.running.tasks()}
                    onReveal={virtualized.revealPart}
                  />
                </div>
              </div>
              <Show when={sessionID()} keyed>
                {(_id) => (
                  <div class="shrink-0 flex items-center gap-2">
                    {props.search}
                    <ExtensionSlot
                      at="session.header"
                      input={{
                        get session() {
                          return props.view
                        },
                        get screen() {
                          return props.screen
                        },
                        get active() {
                          return props.active !== false
                        },
                      }}
                    />
                    <ChatViewButton />
                    <SessionHeaderSpacer visible={props.reserveReviewToggle} />
                  </div>
                )}
              </Show>
            </div>
          </SessionTitleHeader>
        </Show>
      }
    />
  )
}
