import { expect, test, type Locator, type Page } from "@playwright/test"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { createTwoFilesPatch } from "diff"
import { seed } from "../utils/app"
import {
  assistantMessage,
  directory,
  type EventPayload,
  partDelta,
  partUpdated,
  renderedPartID,
  sessionID,
  setupTimeline,
  stepStarted,
  shell,
  textPart,
  toolPart,
  userID,
  userMessage,
  userText,
  validateTimelineEvent,
  waitForVisualSettle,
} from "../utils/timeline"
import {
  analyzeVisualObservations,
  defineVisualRegions,
  startVisualProbe,
  stopVisualProbe,
  visualPlan,
} from "../utils/visual-stability"

const expanded = { editToolPartsExpanded: true, shellToolPartsExpanded: true, showReasoningSummaries: true }

async function openChatViewPicker(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 1400) < 768

  const navigation = mobile
    ? page.locator('[data-slot="session-mobile-view-navigation"]')
    : page.locator("[data-session-title]")

  if (mobile) await navigation.getByRole("button", { name: "More options", exact: true }).click()

  const button = mobile
    ? page.getByRole("menuitem", { name: "Chat view", exact: true })
    : navigation.getByRole("button", { name: "Chat view", exact: true })

  await expect(button).toBeVisible()
  await button.click()

  await expect(page.getByRole("menuitemradio")).toHaveCount(6)

  return page.getByRole("menuitemradio", { name: "Original", exact: true })
}

async function expectChatViewAfterSessionDetails(page: Page) {
  const header = page.locator("[data-session-title]")
  const details = header.getByRole("button", { name: "Session details", exact: true })
  const chatView = header.getByRole("button", { name: "Chat view", exact: true })

  await expect(details).toBeVisible()
  await expect(chatView).toBeVisible()
  await expect
    .poll(async () => {
      const [detailsBounds, chatViewBounds] = await Promise.all([details.boundingBox(), chatView.boundingBox()])

      return !!detailsBounds && !!chatViewBounds && chatViewBounds.x > detailsBounds.x + detailsBounds.width
    })
    .toBe(true)
}

async function selectChatView(
  page: Page,
  value: "original" | "stage" | "flow" | "companion" | "document" | "comms",
) {
  const picker = await openChatViewPicker(page)
  const label = value[0]!.toUpperCase() + value.slice(1)
  await page.getByRole("menuitemradio", { name: label, exact: true }).click()
  await expect(page.locator(`[data-session-layout="${value}"]`)).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()
}

type SessionExecutionEventType = Extract<
  EventPayload["type"],
  | "session.execution.started"
  | "session.execution.succeeded"
  | "session.execution.failed"
  | "session.execution.interrupted"
>

type SessionExecutionEvent<Type extends SessionExecutionEventType> = Extract<EventPayload, { type: Type }>

test("Flow collapses old paragraphs without splitting native Used groups", async ({ page }) => {
  const tools = Array.from({ length: 18 }, (_, index) =>
    toolPart(`prt_dense_read_${index}`, "read", "completed", { path: `src/flow-${index}.ts` }),
  )

  const timeline = await setupTimeline(page, {
    sessionMessages: [
      userMessage([userText("Keep the conversation compact.")]),
      { id: "msg_dense_notice", type: "system", text: "Prior instructions changed.", time: { created: 1700000000500 } },
      assistantMessage(
        [
          textPart("prt_dense_old_start", "Older multipart answer with a long introduction. ".repeat(12)),
          ...tools.slice(0, 6),
        ],
        { id: "msg_dense_old" },
      ),
      assistantMessage(tools.slice(6, 12), { id: "msg_dense_middle", created: 1700000002000 }),
      assistantMessage(
        [...tools.slice(12), textPart("prt_dense_old_end", "The last paragraph of the older multipart answer.")],
        { id: "msg_dense_end", created: 1700000002500 },
      ),
      assistantMessage(
        [textPart("prt_dense_latest", "Latest answer remains fully readable.\n\nA second paragraph stays visible.")],
        { completed: false, created: 1700000003000 },
      ),
    ],
    settings: { timelineDetail: timelinePresets[2].value },
    inbox: [
      {
        id: "inb_dense_pending",
        sessionID,
        time: { created: 1700000004000 },
        type: "user",
        payload: { text: "Pending steer must not hide the live response." },
        delivery: "steer",
      },
    ],
  })

  await selectChatView(page, "flow")
  const flow = page.locator('[data-session-layout="flow"]')
  await expect(flow).toBeVisible()
  await expect(flow.locator(".composer-companion")).toHaveCount(0)
  const older = flow.locator(".flow-summary").filter({ hasText: "Older multipart answer with a long introduction." })
  const user = flow.locator(".flow-summary").filter({ hasText: "Keep the conversation compact." })
  const oldEnd = page.locator(`[data-timeline-part-id="${renderedPartID("prt_dense_old_end")}"]`)
  const latest = page.locator(`[data-timeline-part-id="${renderedPartID("prt_dense_latest")}"]`)
  const group = page.locator(`[data-timeline-part-ids="${tools.map((tool) => tool.id).join(",")}"]`)
  const used = group.locator(':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]')
  const reply = flow.locator("[data-flow-message-divider]").filter({ has: used })

  await expect(used).toContainText(/Used\s*18\s*Read/)
  await expect(
    reply.locator(".flow-summary").filter({ hasText: "The last paragraph of the older multipart answer." }),
  ).toHaveCount(1)

  await expect(reply.getByRole("img", { name: "Assistant", exact: true })).toHaveCount(1)
  await expect(reply.getByRole("img", { name: "Assistant", exact: true })).toHaveCSS("width", "80px")
  await expect(reply.locator(".flow-avatar-circle")).toHaveCSS("height", "80px")
  await expect(reply.locator("[data-flow-message-divider]")).toHaveCount(0)
  await expect(used).toHaveAttribute("aria-expanded", "false")
  await expect(older).toHaveCount(1)
  await expect(flow.getByRole("button", { name: "Expand message", exact: true })).toHaveCount(4)
  await expect(older.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  await expect(user.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  const userEntry = flow.locator("[data-flow-message-divider]").filter({ hasText: "Keep the conversation compact." })
  await expect(userEntry.locator(".flow-avatar")).toHaveCount(0)
  await userEntry.getByRole("button", { name: "Expand You", exact: true }).click()
  await expect(userEntry.locator('[data-component="user-message"]')).toHaveCSS("align-items", "flex-start")
  await expect(userEntry.locator('[data-slot="user-message-body"]')).toHaveCSS("margin-inline-start", "0px")
  await expect(userEntry.getByRole("button", { name: "Collapse You", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  )
  await userEntry.getByRole("button", { name: "Collapse You", exact: true }).click()
  await expect(user.getByRole("button")).toHaveAttribute("aria-expanded", "false")

  const notice = flow
    .locator("[data-flow-message-divider]")
    .filter({ has: page.locator(".flow-label").filter({ hasText: "Event" }) })

  await expect(notice.locator(".flow-avatar")).toHaveCount(0)
  await notice.getByRole("button", { name: "Expand Event", exact: true }).click()
  await expect(notice).toContainText("Prior instructions changed.")
  await notice.getByRole("button", { name: "Collapse Event", exact: true }).click()

  const preview = older.locator('[dir="auto"]')
  await preview.scrollIntoViewIfNeeded()
  const bounds = await preview.boundingBox()

  if (!bounds) throw new Error("Missing collapsed preview")
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + Math.min(200, bounds.width - 2), bounds.y + bounds.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("Older")
  await expect(older.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  await expect(oldEnd).toHaveCount(0)
  await expect
    .poll(() =>
      older.evaluate((element) => getComputedStyle(element.closest("[data-flow-message-divider]")!).borderBottomWidth),
    )
    .toBe("1px")
  await expect(latest).toContainText("A second paragraph stays visible.")
  await expect(latest.getByText("A second paragraph stays visible.", { exact: true })).toBeVisible()
  await expect(
    flow
      .locator(".flow-summary")
      .filter({ hasText: "Pending steer must not hide the live response." })
      .getByRole("button"),
  ).toHaveAttribute("aria-expanded", "false")
  await expect
    .poll(() => older.evaluate((element) => element.parentElement!.getBoundingClientRect().width))
    .toBeLessThanOrEqual(1000)
  await used.click()
  await expect(group.getByText("flow-17.ts", { exact: true })).toBeVisible()
  await used.click()
  await expect(used).toHaveAttribute("aria-expanded", "false")

  await reply.getByRole("button", { name: "Expand Assistant", exact: true }).click()
  const collapse = reply.getByRole("button", { name: "Collapse message", exact: true })
  await expect(collapse).toHaveAttribute("aria-expanded", "true")
  await expect(oldEnd).toContainText("The last paragraph of the older multipart answer.")
  await expect(latest).toContainText("A second paragraph stays visible.")
  await reply.getByRole("button", { name: "Collapse Assistant", exact: true }).click()
  await expect(oldEnd).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(older.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  await expect.poll(() => older.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(40)
  await expect(older.locator('[dir="auto"]')).toHaveCSS("white-space", "nowrap")
  await expect.poll(() => flow.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  const nextMessage = assistantMessage([textPart("prt_dense_next", "")], {
    id: "msg_dense_next",
    completed: false,
    created: 1700000005000,
  })

  await timeline.send(stepStarted(nextMessage))
  await timeline.send({
    id: "evt_dense_text_started",
    type: "session.text.started",
    created: 1700000005001,
    location: { directory },
    durable: { aggregateID: sessionID, seq: 1, version: 1 },
    data: { sessionID, assistantMessageID: nextMessage.id, ordinal: 0 },
  })
  await timeline.send(partDelta("prt_dense_next", "The next streaming message.", nextMessage.id))
  await expect(
    flow.locator(".flow-summary").filter({ hasText: "Latest answer remains fully readable." }).getByRole("button"),
  ).toHaveAttribute("aria-expanded", "false")
  await expect(latest).toHaveCount(0)
  const next = page.locator(`[data-timeline-part-id="${renderedPartID("prt_dense_next")}"]`)
  await expect(next.getByText("The next streaming message.", { exact: true })).toBeVisible()
  await timeline.send(partDelta("prt_dense_next", "\n\nMore content arrived.", nextMessage.id))
  await expect(next.getByText("More content arrived.", { exact: true })).toBeVisible()
  await expect(used).toHaveAttribute("aria-expanded", "false")
  const latestEntry = flow.locator("[data-flow-message-divider]").filter({ hasText: "The next streaming message." })
  await latestEntry.getByRole("button", { name: "Collapse Assistant", exact: true }).click()
  await expect(next).toHaveCount(0)
  await latestEntry.getByRole("button", { name: "Expand Assistant", exact: true }).click()
  await expect(next).toContainText("More content arrived.")
  await timeline.send(partDelta("prt_dense_next", "\n\n【 開心 ＼(ˆ ᗜ ˆ)／ 】", nextMessage.id))

  await expect(latestEntry.locator(".flow-avatar img")).toHaveAttribute(
    "src",
    "/characters/kotone/portraits/happy.webp",
  )
  await timeline.send(partDelta("prt_dense_next", "\n\n【 專注 (๑•̀ ᴗ•́)૭✧ 】", nextMessage.id))

  await expect(latestEntry.locator(".flow-avatar img")).toHaveAttribute(
    "src",
    "/characters/kotone/portraits/focused.webp",
  )
  await expect(reply.locator(".flow-avatar img")).toHaveAttribute("src", "/characters/kotone/portraits/neutral.webp")
  await timeline.send(
    partUpdated({
      ...toolPart("prt_dense_tail", "read", "completed", { path: "src/tail.ts" }),
      messageID: nextMessage.id,
    }),
  )
  await expect(latestEntry.locator('[data-timeline-part-ids="prt_dense_tail"]')).toHaveCount(1)
  await expect(latestEntry.getByRole("img", { name: "Assistant", exact: true })).toHaveCount(1)
})

test("Companion preserves the native timeline and follows composer state", async ({ page }) => {
  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(undefined, { id: "msg_companion_older_user", created: 1700000000000 }),
      assistantMessage([textPart("prt_companion_older_text", "Older native assistant content stays unfolded.")], {
        id: "msg_companion_older_assistant",
        parentID: "msg_companion_older_user",
        created: 1700000001000,
      }),
      userMessage(undefined, { id: "msg_companion_latest_user", created: 1700000002000 }),
      assistantMessage([textPart("prt_companion_initial_text", "The initial native assistant response is visible.")], {
        id: "msg_companion_initial_assistant",
        parentID: "msg_companion_latest_user",
        created: 1700000003000,
      }),
    ],
    reducedMotion: true,
  })

  await selectChatView(page, "companion")
  const companionLayout = page.locator('[data-session-layout="companion"]')
  const row = companionLayout.locator(".companion-composer-row")
  const companion = row.locator("picture.composer-companion")
  const image = companion.locator("img")
  const composer = companionLayout.locator('[data-component="composer"]')
  const editor = composer.getByRole("textbox")

  await expect(
    companionLayout.getByText("Older native assistant content stays unfolded.", { exact: true }),
  ).toBeVisible()
  await expect(
    companionLayout.getByText("The initial native assistant response is visible.", { exact: true }),
  ).toBeVisible()
  await expect(companionLayout.locator(".flow-summary")).toHaveCount(0)
  await expect(companionLayout.locator(".flow-avatar")).toHaveCount(0)
  await expect(companionLayout.locator("[data-flow-message-divider]")).toHaveCount(0)

  const companionPaths = {
    idle: /^\/characters\/kotone\/companion\/idle-0[1-3]\.png$/,
    typing: /^\/characters\/kotone\/companion\/typing-0[3-5]\.png$/,
    working: /^\/characters\/kotone\/companion\/working-0[1-5]\.png$/,
    error: /^\/characters\/kotone\/companion\/error-0[3-5]\.png$/,
    success: /^\/characters\/kotone\/companion\/success-0[1-5]\.png$/,
    waiting: /^\/characters\/kotone\/companion\/waiting-0[2-5]\.png$/,
  }

  const currentPath = () =>
    image.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) throw new Error("Companion image is unavailable")
      const source = element.currentSrc

      return source ? new URL(source).pathname : ""
    })

  const executionEvent = <Type extends SessionExecutionEventType>(
    event: Pick<SessionExecutionEvent<Type>, "type" | "data">,
    seq: number,
  ) =>
    validateTimelineEvent({
      ...event,
      id: `evt_companion_execution_${seq}`,
      created: 1700000006000 + seq,
      location: { directory },
      durable: { aggregateID: sessionID, seq, version: 1 },
    })

  await expect(page.locator("html")).toHaveAttribute("dir", "ltr")
  await expect(companion).toBeVisible()
  await expect(companion).toHaveAttribute("aria-hidden", "true")
  await expect(image).toHaveAttribute("alt", "")
  await expect(image).toHaveAttribute("src", /^\/characters\/kotone\/companion\/idle-0[1-3]\.gif$/)
  await expect.poll(currentPath).toMatch(companionPaths.idle)
  await expect(companion).toHaveCSS("width", "112px")
  await expect(editor).toBeVisible()
  await expect(editor).toBeEditable()

  const companionBounds = await companion.boundingBox()
  const composerBounds = await composer.boundingBox()
  const rowBounds = await row.boundingBox()

  if (!companionBounds || !composerBounds || !rowBounds) throw new Error("Missing desktop composer geometry")
  expect(companionBounds.x + companionBounds.width).toBeLessThanOrEqual(composerBounds.x)
  expect(composerBounds.width).toBeLessThan(rowBounds.width)

  await page.evaluate(() => {
    document.documentElement.dir = "rtl"
  })
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect
    .poll(async () => {
      const companionBox = await companion.boundingBox()
      const composerBox = await composer.boundingBox()

      return !!companionBox && !!composerBox && companionBox.x > composerBox.x
    })
    .toBe(true)
  await page.evaluate(() => {
    document.documentElement.dir = "ltr"
  })

  await editor.fill("A draft makes Kotone type.")
  await expect.poll(currentPath).toMatch(companionPaths.typing)
  const typingPath = await currentPath()
  await page.evaluate(() => {
    // A deterministic sequence makes a per-keystroke reselection fail without relying on random odds.
    const values = [0, 0.5, 0.99]
    let index = 0
    Math.random = () => values[index++ % values.length]!
  })

  for (const character of " more") {
    await editor.pressSequentially(character)
    await expect.poll(currentPath).toBe(typingPath)
  }

  await expect(editor).toContainText("A draft makes Kotone type. more")
  await editor.clear()
  await expect.poll(currentPath).toMatch(companionPaths.idle)

  await editor.fill("Running takes priority over the draft.")
  await timeline.send(executionEvent({ type: "session.execution.started", data: { sessionID } }, 0))
  await expect.poll(currentPath).toMatch(companionPaths.working)
  await editor.clear()
  await expect.poll(currentPath).toMatch(companionPaths.working)
  await timeline.send(executionEvent({ type: "session.execution.succeeded", data: { sessionID } }, 1))
  await expect.poll(currentPath).toMatch(companionPaths.success)

  await editor.fill("A draft temporarily overrides the previous success.")
  await expect.poll(currentPath).toMatch(companionPaths.typing)
  await editor.clear()
  await expect.poll(currentPath).toMatch(companionPaths.success)

  await timeline.send(
    executionEvent(
      {
        type: "session.execution.failed",
        data: { sessionID, error: { type: "provider.error", message: "The request failed." } },
      },
      2,
    ),
  )
  await expect.poll(currentPath).toMatch(companionPaths.error)

  await editor.fill("A draft temporarily overrides the latest error.")
  await expect.poll(currentPath).toMatch(companionPaths.typing)
  await editor.clear()
  await expect.poll(currentPath).toMatch(companionPaths.error)

  await timeline.send(executionEvent({ type: "session.execution.interrupted", data: { sessionID, reason: "user" } }, 3))
  await expect.poll(currentPath).toMatch(companionPaths.idle)

  await editor.fill("A pending permission takes priority.")
  await timeline.send(executionEvent({ type: "session.execution.started", data: { sessionID } }, 4))
  await expect.poll(currentPath).toMatch(companionPaths.working)
  await timeline.send(
    validateTimelineEvent({
      id: "evt_companion_permission_asked",
      created: 1700000007000,
      type: "permission.asked",
      location: { directory },
      data: {
        id: "per_companion_waiting",
        sessionID,
        action: "shell",
        resources: ["git status"],
        metadata: {},
      },
    }),
  )
  await expect(page.locator('[data-component="dock-prompt"][data-kind="permission"]')).toBeVisible()
  await expect.poll(currentPath).toMatch(companionPaths.waiting)
  await expect(companion).toBeVisible()
  await expect(composer).toHaveCount(0)

  await timeline.send(
    validateTimelineEvent({
      id: "evt_companion_permission_replied",
      created: 1700000007001,
      type: "permission.replied",
      location: { directory },
      data: { sessionID, requestID: "per_companion_waiting", reply: "once" },
    }),
  )
  await expect(page.locator('[data-component="dock-prompt"][data-kind="permission"]')).toHaveCount(0)
  await expect(editor).toBeVisible()
  await editor.clear()
  await timeline.send(executionEvent({ type: "session.execution.interrupted", data: { sessionID, reason: "user" } }, 5))
  await expect.poll(currentPath).toMatch(companionPaths.idle)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(companion).toHaveCSS("width", "64px")
  await expect.poll(() => companionLayout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(editor).toBeEditable()
  await editor.fill("The mobile editor remains usable.")
  await expect(editor).toContainText("The mobile editor remains usable.")
  await expect.poll(currentPath).toMatch(companionPaths.typing)
  await selectChatView(page, "flow")
  await expect(page.locator('[data-session-layout="flow"]')).toBeVisible()
  await expect(
    page.locator('[data-session-layout="flow"] [data-component="composer"]').getByRole("textbox"),
  ).toContainText("The mobile editor remains usable.")
})

test("Chat view switches preserve streaming and the composer draft across tab layouts", async ({ page }) => {
  const oldPrompt = userMessage([userText("Review an earlier change.", { id: "prt_chat_view_old_prompt" })], {
    id: "msg_chat_view_old_user",
    created: 1690000200000,
  })

  const oldAssistant = {
    ...assistantMessage(
      [
        toolPart("prt_chat_view_old_read", "read", "completed", { path: "src/comms/history-only.ts" }),
        textPart("prt_chat_view_old_text", "This tool belongs to an earlier exchange."),
      ],
      { id: "msg_chat_view_old_assistant", parentID: oldPrompt.id, created: 1690000201000 },
    ),
    snapshot: { files: ["src/comms/history-only.ts"] },
  }

  const currentPrompt = userMessage()

  const priorStep = {
    ...assistantMessage(
      [
        toolPart("prt_chat_view_prior_patch", "patch", "completed", {
          patchText: "Update src/comms/current-change.ts",
        }),
        textPart("prt_chat_view_prior_text", "The latest exchange changed one file."),
      ],
      { id: "msg_chat_view_prior_step", parentID: currentPrompt.id, created: 1700000001000 },
    ),
    tokens: { input: 50_000, output: 4_000, reasoning: 0, cache: { read: 1_000, write: 0 } },
    snapshot: { files: ["src/comms/current-change.ts"] },
  }

  const timeline = await setupTimeline(page, {
    seedHistory: true,
    messages: [oldPrompt, oldAssistant, currentPrompt, priorStep],
    reducedMotion: true,
  })

  const stage = page.locator('[data-session-layout="stage"]')
  const flow = page.locator('[data-session-layout="flow"]')
  const companion = page.locator('[data-session-layout="companion"]')
  const original = page.locator('[data-session-layout="original"]')
  const comms = page.locator('[data-session-layout="comms"]')
  const portrait = page.locator('[data-component="session-character-portrait"]')
  const editor = page.locator('[data-session-layout] [data-component="composer"]').getByRole("textbox")
  const draft = "Keep this draft while the answer streams."
  const responseEnd = "The streamed response ending remains visible after switching."

  await expect(stage).toBeVisible()
  await expect(portrait).toBeVisible()
  await expect(page.locator('[data-slot="vertical-tabs-sidebar"]')).toHaveCount(0)
  await expectChatViewAfterSessionDetails(page)
  const header = page.locator("[data-session-title]")

  const composerRegion = stage.locator('[data-component="composer"]')

  const geometry = async () => ({
    header: await header.boundingBox(),
    composer: await composerRegion.boundingBox(),
  })

  const closedGeometry = await geometry()

  if (!closedGeometry.header || !closedGeometry.composer) throw new Error("Missing header or composer bounds")
  const picker = await openChatViewPicker(page)
  await expect.poll(geometry).toEqual(closedGeometry)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()
  await expect.poll(geometry).toEqual(closedGeometry)

  await editor.fill(draft)
  await expect(editor).toContainText(draft)

  const liveMessage = assistantMessage([textPart("prt_chat_view_stream", "")], {
    parentID: userID,
    completed: false,
  })

  await timeline.send(stepStarted(liveMessage))
  await timeline.send({
    id: "evt_chat_view_text_started",
    type: "session.text.started",
    created: 1700000005001,
    location: { directory },
    durable: { aggregateID: sessionID, seq: 1, version: 1 },
    data: { sessionID, assistantMessageID: liveMessage.id, ordinal: 0 },
  })
  await timeline.send(partDelta("prt_chat_view_stream", "The response starts in Stage. ", liveMessage.id))

  const livePart = page.locator(`[data-timeline-part-id="${renderedPartID("prt_chat_view_stream")}"]`)
  const liveRow = page.locator("[data-timeline-key]", { has: livePart })
  await expect(livePart).toContainText("The response starts in Stage.")

  await selectChatView(page, "flow")
  await expect(flow).toBeVisible()
  await expect(editor).toContainText(draft)
  const older = flow.locator(".flow-summary").filter({ hasText: "Historical response 17." })
  await expect(older.getByRole("button")).toHaveAttribute("aria-expanded", "false")
  const liveEntry = flow.locator("[data-flow-message-divider]").filter({ hasText: "The response starts in Stage." })
  await expect(liveEntry.getByRole("img", { name: "Assistant", exact: true })).toBeVisible()
  await timeline.send(partDelta("prt_chat_view_stream", "The response continues in Flow. ", liveMessage.id))
  await expect(livePart).toContainText("The response continues in Flow.")

  await selectChatView(page, "companion")
  await expect(companion).toBeVisible()
  await expect(editor).toContainText(draft)
  await expect(companion.getByText(/Historical response 17\./)).toBeVisible()
  await expect(companion.locator(".flow-summary, .flow-avatar, [data-flow-message-divider]")).toHaveCount(0)
  await expect(livePart).toContainText("The response continues in Flow.")
  const companionImage = companion.locator("picture.composer-companion img")
  await expect
    .poll(() =>
      companionImage.evaluate((element) => {
        if (!(element instanceof HTMLImageElement)) throw new Error("Companion image is unavailable")

        return element.currentSrc ? new URL(element.currentSrc).pathname : ""
      }),
    )
    .toMatch(/^\/characters\/kotone\/companion\/typing-0[3-5]\.png$/)
  await timeline.send(
    partDelta(
      "prt_chat_view_stream",
      `The response continues in Companion. ${"A tall streamed native response stays measurable. ".repeat(24)}\n\n${responseEnd}`,
      liveMessage.id,
    ),
  )
  await expect(livePart).toContainText("The response continues in Companion.")
  await expect(livePart).toContainText(responseEnd)

  await selectChatView(page, "comms")
  await expect(comms).toBeVisible()
  await expect(editor).toContainText(draft)
  await expect(comms.getByText(responseEnd, { exact: true })).toBeVisible()
  await expect(comms.locator(".document-paper")).toHaveCount(0)
  await expect(comms.getByRole("navigation", { name: "Document pages", exact: true })).toHaveCount(0)

  const commsPortraitWindow = comms.locator(".comms-portrait")
  const commsAvatar = comms.locator(".comms-portrait__avatar")
  const commsPortrait = comms.locator('[data-component="session-character-portrait"]')
  const commsTimeline = comms.locator(".comms-timeline")
  const commsTimelineViewport = comms.locator('[data-slot="session-timeline-scroll"] .scroll-view__viewport')
  const commsHistoryText = comms.getByText("This tool belongs to an earlier exchange.", { exact: true })

  const commsHistoryRow = page.locator("[data-timeline-key]", {
    has: page.getByText("This tool belongs to an earlier exchange.", { exact: true }),
  })

  const portraitFrame = commsAvatar.locator('[data-component="session-character-portrait-frame"]')
  const portraitCircle = commsAvatar.locator('[data-component="session-character-portrait-circle"]')
  const portraitHead = commsAvatar.locator('[data-component="session-character-portrait-top"]')

  await expect(commsPortraitWindow).toBeVisible()
  await expect(commsPortraitWindow.getByText("Current work", { exact: true })).toHaveCount(0)
  await expect(commsPortraitWindow.getByText(/^(Agent|Build|Model|Claude Opus 4\.6|Working)$/)).toHaveCount(0)
  await expect(commsPortraitWindow.getByRole("status")).toHaveCount(0)
  await expect(commsPortraitWindow.locator("details")).toHaveCount(0)
  await expect(commsAvatar).toBeVisible()
  await expect(commsAvatar).toHaveCSS("position", "absolute")
  await expect(commsAvatar).toHaveCSS("overflow", "visible")
  await expect(commsPortraitWindow).toHaveCSS("overflow", "visible")
  await expect(portraitFrame).toBeVisible()
  await expect(portraitFrame).toHaveCSS("overflow", "visible")
  await expect(portraitCircle).toBeVisible()
  await expect(portraitCircle).toHaveCSS("overflow", "hidden")
  await expect(portraitCircle).toHaveCSS("border-radius", "50%")
  await expect(portraitHead).toBeVisible()
  await expect(commsPortrait).toHaveCount(1)
  await expect(commsPortrait).toHaveAttribute("src", "/characters/kotone/portraits/neutral.webp")
  await expect(commsTimeline).toBeVisible()
  await expect(commsTimelineViewport).toBeVisible()
  await expect(commsHistoryText).toBeVisible()

  const titlebarTabs = page.locator('[data-slot="titlebar-tabs"]')
  await expect(titlebarTabs).toBeVisible()
  await expect(header).toBeVisible()

  const [commsPortraitBeforeScroll, commsViewportBeforeScroll, titleBounds, titlebarTabsBounds] = await Promise.all([
    commsPortraitWindow.boundingBox(),
    commsTimelineViewport.boundingBox(),
    header.boundingBox(),
    titlebarTabs.boundingBox(),
  ])

  if (!commsPortraitBeforeScroll || !commsViewportBeforeScroll || !titleBounds || !titlebarTabsBounds)
    throw new Error("Missing Comms layout bounds")
  expect(commsPortraitBeforeScroll.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height - 1)
  expect(commsPortraitBeforeScroll.y).toBeGreaterThanOrEqual(titlebarTabsBounds.y + titlebarTabsBounds.height - 1)
  expect(
    Math.min(
      commsPortraitBeforeScroll.x + commsPortraitBeforeScroll.width,
      commsViewportBeforeScroll.x + commsViewportBeforeScroll.width,
    ) - Math.max(commsPortraitBeforeScroll.x, commsViewportBeforeScroll.x),
  ).toBeGreaterThan(0)
  expect(
    Math.min(
      commsPortraitBeforeScroll.y + commsPortraitBeforeScroll.height,
      commsViewportBeforeScroll.y + commsViewportBeforeScroll.height,
    ) - Math.max(commsPortraitBeforeScroll.y, commsViewportBeforeScroll.y),
  ).toBeGreaterThan(0)

  const [circleBounds, headBounds, portraitBounds, historyRowBounds] = await Promise.all([
    portraitCircle.boundingBox(),
    portraitHead.boundingBox(),
    commsPortrait.boundingBox(),
    commsHistoryRow.boundingBox(),
  ])

  if (!circleBounds || !headBounds || !portraitBounds || !historyRowBounds)
    throw new Error("Missing Comms avatar or chat row geometry")
  expect(circleBounds.width).toBeCloseTo(160, 0)
  expect(circleBounds.height).toBeCloseTo(160, 0)
  expect(portraitBounds.width).toBeGreaterThan(circleBounds.width)
  expect(portraitBounds.x).toBeLessThan(circleBounds.x)
  expect(portraitBounds.x + portraitBounds.width).toBeGreaterThan(circleBounds.x + circleBounds.width)
  expect(portraitBounds.y).toBeLessThan(circleBounds.y)
  expect(circleBounds.width).toBeCloseTo(circleBounds.height, 1)
  expect(headBounds.y).toBeLessThan(circleBounds.y)
  expect(headBounds.y + headBounds.height).toBeGreaterThan(circleBounds.y)
  expect(headBounds.x).toBeCloseTo(circleBounds.x, 0)
  expect(headBounds.width).toBeCloseTo(circleBounds.width, 0)
  expect(headBounds.y + headBounds.height).toBeLessThanOrEqual(
    commsPortraitBeforeScroll.y + commsPortraitBeforeScroll.height + 1,
  )
  expect(historyRowBounds.x).toBeLessThan(circleBounds.x + circleBounds.width / 2)
  expect(historyRowBounds.x + historyRowBounds.width).toBeGreaterThan(circleBounds.x + circleBounds.width / 2)

  await expect
    .poll(() => commsTimelineViewport.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true)
  await expect
    .poll(() =>
      commsTimelineViewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
    )
    .toBeLessThanOrEqual(1)
  const scrollTopBeforeWheel = await commsTimelineViewport.evaluate((element) => element.scrollTop)
  expect(scrollTopBeforeWheel).toBeGreaterThan(0)
  const circleCenterX = circleBounds.x + circleBounds.width / 2
  const circleCenterY = circleBounds.y + circleBounds.height / 2
  const scrollDelta = Math.ceil(circleCenterY - (historyRowBounds.y + historyRowBounds.height / 2))
  expect(scrollDelta).toBeGreaterThan(0)
  expect(scrollTopBeforeWheel).toBeGreaterThan(scrollDelta)
  await page.mouse.move(circleCenterX, circleCenterY)
  await page.mouse.wheel(0, -scrollDelta)
  await expect
    .poll(() => commsTimelineViewport.evaluate((element) => element.scrollTop))
    .toBeLessThan(scrollTopBeforeWheel)
  await expect
    .poll(() => commsHistoryRow.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThan(historyRowBounds.y)
  await expect
    .poll(async () => {
      const row = await commsHistoryRow.boundingBox()

      return (
        !!row &&
        row.x < circleBounds.x + circleBounds.width &&
        row.x + row.width > circleBounds.x &&
        row.y < circleBounds.y + circleBounds.height &&
        row.y + row.height > circleBounds.y
      )
    })
    .toBe(true)

  const [commsPortraitAfterScroll, circleAfterScroll, historyRowAfterScroll] = await Promise.all([
    commsPortraitWindow.boundingBox(),
    portraitCircle.boundingBox(),
    commsHistoryRow.boundingBox(),
  ])

  if (!commsPortraitAfterScroll || !circleAfterScroll || !historyRowAfterScroll)
    throw new Error("Missing Comms portrait bounds after scrolling")
  expect(Math.abs(commsPortraitAfterScroll.y - commsPortraitBeforeScroll.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(circleAfterScroll.x - circleBounds.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(circleAfterScroll.y - circleBounds.y)).toBeLessThanOrEqual(1)
  expect(historyRowAfterScroll.y).toBeGreaterThan(historyRowBounds.y)

  await page.mouse.wheel(0, 10_000)
  await expect
    .poll(() =>
      commsTimelineViewport.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
    )
    .toBeLessThanOrEqual(1)

  const contextLabel = "Context usage: 28% (55,000 of 200,000 tokens)"
  await expect(comms.getByRole("img", { name: contextLabel, exact: true })).toBeVisible()
  await expect(commsPortraitWindow).not.toContainText("28%")
  await expect(commsPortraitWindow).not.toContainText("55,000")
  await expect(comms.locator(".comms-console__context-value")).toHaveCount(0)
  const contextUsage = page.getByRole("button", { name: "View context usage", exact: true })
  await expect(contextUsage).toBeVisible()
  const contextProgress = comms.locator(".comms-portrait__context-progress")

  const contextProgressMeasurement = await contextProgress.evaluate((element) => {
    if (!(element instanceof SVGCircleElement)) throw new Error("Comms context ring is unavailable")

    return {
      offset: Number.parseFloat(getComputedStyle(element).strokeDashoffset),
      circumference: 2 * Math.PI * element.r.baseVal.value,
    }
  })

  expect(contextProgressMeasurement.offset).toBeCloseTo(contextProgressMeasurement.circumference * (1 - 28 / 100), 1)

  await timeline.send(
    partUpdated(
      toolPart("prt_chat_view_expression", "character.set_expression", "completed", { expression: "focused" }),
    ),
  )
  await expect(commsPortrait).toHaveAttribute("src", "/characters/kotone/portraits/focused.webp")

  await selectChatView(page, "original")
  await expect(original).toBeVisible()
  await expect(editor).toContainText(draft)
  await expect(livePart).toContainText(responseEnd)
  await expect(original.getByText(/Historical response 17\./)).toBeVisible()
  await expect(original.locator(".flow-summary, .flow-avatar, [data-flow-message-divider]")).toHaveCount(0)
  await expect(portrait).toHaveCount(0)
  await expect(page.locator(".composer-companion")).toHaveCount(0)
  const responseEnding = original.getByText(responseEnd, { exact: true })
  await expect(responseEnding).toBeInViewport()
  const liveRowBounds = await liveRow.boundingBox()
  const responseEndingBounds = await responseEnding.boundingBox()

  if (!liveRowBounds || !responseEndingBounds) throw new Error("Missing streamed response bounds")

  expect(responseEndingBounds.y + responseEndingBounds.height).toBeLessThanOrEqual(
    liveRowBounds.y + liveRowBounds.height + 1,
  )
  await timeline.send(partDelta("prt_chat_view_stream", "The response continues in Original.", liveMessage.id))
  await expect(livePart).toContainText("The response continues in Original.")
  await expect(livePart).toBeVisible()

  await selectChatView(page, "stage")
  await expect(stage).toBeVisible()
  await expect(portrait).toBeVisible()
  await expect(editor).toContainText(draft)
  await timeline.send(partDelta("prt_chat_view_stream", "\n\nThe response returns to Stage.", liveMessage.id))
  await expect(livePart).toContainText("The response returns to Stage.")

  await selectChatView(page, "flow")
  await expect(flow).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem("settings.v3"))).toContain('"chatView":"flow"')
  await page.reload()
  await expect(page.locator('[data-session-layout="flow"]')).toBeVisible()
  const persistedPicker = await openChatViewPicker(page)
  await expect(page.getByRole("menuitemradio", { name: "Flow", exact: true })).toHaveAttribute("aria-checked", "true")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(persistedPicker).toBeHidden()

  await page.keyboard.press("Control+,")
  const settings = page.getByTestId("settings-screen")
  await expect(settings).toBeVisible()
  const tabLayout = settings.locator('[data-action="settings-tab-layout"]')
  await expect(tabLayout).toContainText("Horizontal")
  await tabLayout.click()
  await page.getByRole("option", { name: "Vertical", exact: true }).click()
  await expect(tabLayout).toContainText("Vertical")
  await settings.getByRole("button", { name: "Back to app", exact: true }).click()
  await expect(settings).toBeHidden()
  await expect(page.locator('[data-slot="vertical-tabs-sidebar"]')).toBeVisible()
  await expect(page.locator('[data-slot="titlebar-tabs"]')).toHaveCount(0)
  await expectChatViewAfterSessionDetails(page)

  const verticalPicker = await openChatViewPicker(page)
  await expect(page.getByRole("menuitemradio", { name: "Flow", exact: true })).toHaveAttribute("aria-checked", "true")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(verticalPicker).toBeHidden()
})

test("Document scrolls exchange papers, lazy-loads history, and follows live replies", async ({ page }) => {
  const oldestPromptText = "Open the oldest review."
  const oldestReplyText = "The lazy-loaded answer remains readable."
  const middlePromptText = "Compare the earlier timeline implementation."
  const middleReplyText = "The middle answer stays in its own paper."
  const latestPromptText = "Review the incoming response."
  const latestReplyText = "The latest answer stays in its own paper."
  const latestEndText = "The long answer continues below its opening."
  const newPromptText = "Good, let's check the new answer."
  const liveReplyText = "A short reply appears without reloading."
  const draft = "Keep this draft while switching chat views."
  const before = "export const documentPaper = false\n"
  const after = "export const documentPaper = true\n"

  const latestResponse = [
    latestReplyText,
    ...Array.from(
      { length: 36 },
      () => "This response stays readable as the continuous paper extends below the viewport. ".repeat(2),
    ),
    latestEndText,
  ].join("\n\n")

  const oldestPrompt = userMessage([userText(oldestPromptText, { id: "prt_document_oldest_prompt" })], {
    id: "msg_document_oldest_user",
    created: 1699999985000,
  })

  const oldestReply = assistantMessage(
    [
      textPart("prt_document_oldest_reply", oldestReplyText),
      toolPart("prt_document_oldest_expression", "character.set_expression", "completed", { expression: "sad" }),
    ],
    {
      id: "msg_document_oldest_assistant",
      parentID: oldestPrompt.id,
      created: 1699999986000,
    },
  )

  const middlePrompt = userMessage([userText(middlePromptText, { id: "prt_document_middle_prompt" })], {
    id: "msg_document_middle_user",
    created: 1699999988000,
  })

  const middleReply = assistantMessage(
    [
      textPart("prt_document_middle_reply", middleReplyText),
      toolPart("prt_document_middle_expression", "character.set_expression", "completed", { expression: "happy" }),
    ],
    {
      id: "msg_document_middle_assistant",
      parentID: middlePrompt.id,
      created: 1699999989000,
    },
  )

  const latestPrompt = userMessage([userText(latestPromptText, { id: "prt_document_latest_prompt" })], {
    id: "msg_document_latest_user",
    created: 1699999992000,
  })

  const latestAssistant = assistantMessage(
    [
      toolPart(
        "prt_document_patch",
        "patch",
        "completed",
        { patchText: "Update src/document.ts" },
        {
          metadata: {
            files: [
              {
                file: "src/document.ts",
                status: "modified",
                patch: createTwoFilesPatch("a/src/document.ts", "b/src/document.ts", before, after),
                additions: 1,
                deletions: 1,
              },
            ],
          },
        },
      ),
      textPart("prt_document_latest_reply", latestResponse),
    ],
    {
      id: "msg_document_latest_assistant",
      parentID: latestPrompt.id,
      created: 1699999993000,
    },
  )

  const olderRequest = Promise.withResolvers<void>()
  const releaseOlderRequest = Promise.withResolvers<void>()
  const pageStarts: (string | undefined)[] = []
  const pageEnds: (string | undefined)[] = []
  const messageRequests: URL[] = []

  page.on("request", (request) => {
    const url = new URL(request.url())

    if (url.pathname.endsWith(`/session/${sessionID}/message`)) messageRequests.push(url)
  })

  await seed(page, { settings: { general: { chatView: "document" } } })

  const timeline = await setupTimeline(page, {
    sessionMessages: [middlePrompt, middleReply, latestPrompt, latestAssistant],
    reducedMotion: true,
    viewport: { width: 1920, height: 1080 },
    beforeMessagesResponse: async ({ before: cursor }) => {
      if (cursor !== "document-older") return
      olderRequest.resolve()
      await releaseOlderRequest.promise
    },
    pageMessages: (_session, _limit, cursor) => {
      if (cursor === undefined) return { items: [middlePrompt, middleReply, latestPrompt, latestAssistant], cursor: "document-older" }

      if (cursor === "document-older") return { items: [oldestPrompt, oldestReply] }

      throw new Error(`Unexpected document history cursor: ${cursor}`)
    },
    onMessages: ({ before: cursor, phase }) => {
      if (phase === "start") pageStarts.push(cursor)

      if (phase === "end") pageEnds.push(cursor)
    },
  })

  const documentLayout = page.locator('[data-session-layout="document"]')
  const scroller = documentLayout.locator('[data-slot="session-timeline-scroll"] .scroll-view__viewport')
  const papers = documentLayout.locator(".document-paper")
  const latestPaper = papers.filter({ hasText: latestPromptText })
  const latestEnd = latestPaper.getByText(latestEndText, { exact: true })
  const patch = latestPaper.locator('[data-timeline-part-ids="prt_document_patch"]')

  await expect(documentLayout).toBeVisible()
  await expect(documentLayout.getByRole("navigation", { name: "Document pages" })).toHaveCount(0)
  await expect(papers).toHaveCount(2)
  await expect(latestPaper.locator('[data-timeline-row="UserMessage"]')).toHaveCount(1)
  await expect(latestPaper.getByText(latestReplyText, { exact: true })).toBeVisible()
  await expect(patch).toBeVisible()
  expect(pageStarts).toEqual([undefined])
  expect(messageRequests.filter((url) => url.searchParams.get("all") === "true")).toEqual([])

  await latestEnd.scrollIntoViewIfNeeded()
  await expect(latestEnd).toBeInViewport()
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await scroller.hover()
  await page.mouse.wheel(0, -10_000)
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0)
  await olderRequest.promise
  const oldestPaper = papers.filter({ hasText: oldestPromptText })
  await expect(oldestPaper).toHaveCount(0)
  expect(pageStarts).toEqual([undefined, "document-older"])

  releaseOlderRequest.resolve()
  await expect(oldestPaper).toHaveCount(1)
  await expect(oldestPaper.locator('[data-timeline-row="UserMessage"]')).toHaveCount(1)
  await expect(papers).toHaveCount(3)
  expect(pageEnds).toEqual([undefined, "document-older"])

  const editor = documentLayout.locator('[data-component="composer"]').getByRole("textbox")
  await editor.fill(newPromptText)

  const promptRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${sessionID}/prompt`,
  )

  await editor.press("Enter")

  const submittedID: unknown = (await promptRequest).postDataJSON().id
  expect(submittedID).toEqual(expect.any(String))

  // SAFETY: The request ID was asserted to be a string above.
  const promptID = submittedID as string
  const submittedPaper = papers.filter({ hasText: newPromptText })
  const submittedPrompt = submittedPaper.locator('[data-timeline-row="UserMessage"]')
  const submittedPortrait = submittedPaper.locator('[data-component="session-character-portrait"]')

  await timeline.send([
    {
      id: "evt_document_live_prompt_enqueued",
      type: "session.inbox.enqueued",
      created: 1700000005000,
      location: { directory },
      durable: { aggregateID: sessionID, seq: 0, version: 1 },
      data: { sessionID, inboxID: promptID, item: { type: "user", payload: { text: newPromptText }, delivery: "steer" } },
    },
    {
      id: "evt_document_live_prompt_delivered",
      type: "session.inbox.delivered",
      created: 1700000005001,
      location: { directory },
      durable: { aggregateID: sessionID, seq: 1, version: 1 },
      data: { sessionID, inboxID: promptID },
    },
  ])
  await expect(submittedPaper).toHaveCount(1)
  await expect(submittedPrompt).toBeInViewport()
  await expect(submittedPortrait).toHaveAttribute("src", "/characters/kotone/portraits/neutral.webp")

  const liveAssistant = assistantMessage([textPart("prt_document_live_reply", "")], {
    parentID: promptID,
    completed: false,
    created: 1700000005003,
  })

  await timeline.send([
    {
      id: "evt_document_live_execution_started",
      type: "session.execution.started",
      created: 1700000005002,
      location: { directory },
      durable: { aggregateID: sessionID, seq: 2, version: 1 },
      data: { sessionID },
    },
    {
      id: "evt_document_live_step_started",
      type: "session.step.started",
      created: 1700000005003,
      location: { directory },
      durable: { aggregateID: sessionID, seq: 3, version: 1 },
      data: {
        sessionID,
        assistantMessageID: liveAssistant.id,
        agent: liveAssistant.agent,
        model: liveAssistant.model,
        started: liveAssistant.time.created,
      },
    },
    {
      id: "evt_document_live_text_started",
      type: "session.text.started",
      created: 1700000005004,
      location: { directory },
      durable: { aggregateID: sessionID, seq: 4, version: 1 },
      data: { sessionID, assistantMessageID: liveAssistant.id, ordinal: 0 },
    },
  ])
  await timeline.send(partDelta("prt_document_live_reply", liveReplyText, liveAssistant.id))

  const liveReply = submittedPaper.getByText(liveReplyText, { exact: true })
  await expect(liveReply).toBeVisible()
  await expect(liveReply).toBeInViewport()
  await expect(submittedPrompt).toBeInViewport()
  await timeline.send(
    partUpdated(
      toolPart("prt_document_live_expression", "character.set_expression", "completed", { expression: "focused" }),
    ),
  )
  await expect(submittedPortrait).toHaveAttribute("src", "/characters/kotone/portraits/focused.webp")

  const exchanges = [
    [oldestPromptText, oldestReplyText, "sad"],
    [middlePromptText, middleReplyText, "happy"],
    [latestPromptText, latestReplyText, "neutral"],
    [newPromptText, liveReplyText, "focused"],
  ] as const

  await scroller.hover()
  await page.mouse.wheel(0, -10_000)
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0)

  for (const [promptText, replyText, face] of exchanges) {
    if (promptText === newPromptText) {
      await scroller.hover()
      await page.mouse.wheel(0, 10_000)
      await expect
        .poll(() =>
          scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop),
        )
        .toBe(0)
    }

    const paper = papers.filter({ hasText: promptText })
    await expect(paper).toHaveCount(1)
    const promptRow = paper.locator('[data-timeline-row="UserMessage"]')
    const portrait = paper.locator('[data-component="session-character-portrait"]')
    const reply = paper.getByText(replyText, { exact: true })

    await reply.scrollIntoViewIfNeeded()
    await expect(promptRow).toHaveCount(1)
    await expect(reply).toBeVisible()
    await expect(reply).toBeInViewport()
    await expect(portrait).toBeVisible()
    await expect(portrait).toHaveAttribute("src", `/characters/kotone/portraits/${face}.webp`)

    const [paperBounds, promptBounds, portraitBounds] = await Promise.all([
      paper.boundingBox(),
      promptRow.boundingBox(),
      portrait.boundingBox(),
    ])

    if (!paperBounds || !promptBounds || !portraitBounds) throw new Error("Missing document paper geometry")
    expect(portraitBounds.width).toBeCloseTo(480, 0)
    expect(portraitBounds.x + portraitBounds.width / 2).toBeGreaterThan(paperBounds.x + paperBounds.width / 2)
    expect(portraitBounds.x + portraitBounds.width).toBeLessThanOrEqual(paperBounds.x + paperBounds.width + 1)
    expect(portraitBounds.y).toBeGreaterThanOrEqual(promptBounds.y + promptBounds.height - 1)
  }

  await expect(submittedPortrait).toHaveAttribute("src", "/characters/kotone/portraits/focused.webp")
  expect(messageRequests.filter((url) => url.searchParams.get("all") === "true")).toEqual([])
  expect(pageStarts).toEqual([undefined, "document-older"])

  await editor.fill(draft)
  await expect(editor).toContainText(draft)
  await selectChatView(page, "flow")

  const flowEditor = page.locator('[data-session-layout="flow"] [data-component="composer"]').getByRole("textbox")
  await expect(flowEditor).toContainText(draft)
  await selectChatView(page, "document")
  await expect(
    page.locator('[data-session-layout="document"] [data-component="composer"]').getByRole("textbox"),
  ).toContainText(draft)
})

const contextTools = [
  { id: "ctx_0100_read", tool: "read", input: { path: "src/recent-a.ts", offset: 0, limit: 120 } },
  { id: "ctx_0101_glob", tool: "glob", input: { path: "C:/OpenCode/TimelineStability", pattern: "**/*.ts" } },
  {
    id: "ctx_0102_grep",
    tool: "grep",
    input: { path: "C:/OpenCode/TimelineStability", pattern: "Explored", include: "*.ts" },
  },
  { id: "ctx_0103_list", tool: "list", input: { path: "src" } },
]

const contextSelector = `[data-timeline-part-ids="${contextTools.map((tool) => tool.id).join(",")}"]`

const output = (tool: string) => `Completed ${tool}.\n${"detail line\n".repeat(8)}`

function contextTurn(status: "running" | "completed") {
  return [
    userMessage(),
    assistantMessage([
      ...contextTools.map((tool) =>
        status === "running"
          ? toolPart(tool.id, tool.tool, "running", tool.input)
          : toolPart(tool.id, tool.tool, "completed", tool.input, { output: output(tool.tool) }),
      ),
      textPart("prt_after_context", "This assistant text is immediately after the explored context group."),
    ]),
  ]
}

test("remeasures a recent explored context group before the next paint", async ({ page }) => {
  await setupTimeline(page, { seedHistory: true, settings: expanded, messages: contextTurn("completed") })
  const following = `[data-timeline-part-id="${renderedPartID("prt_after_context")}"]`
  await expect(page.locator(contextSelector)).toBeVisible()
  await expect(page.locator(following)).toBeVisible()
  await waitForVisualSettle(page, [contextSelector, following])

  // Samples every painted frame after the click until the open group's row holds its measured content, so a
  // stale row height shows up as overlap before the virtualizer catches up.
  const samples = await page.evaluate(
    ({ contextSelector, following }) =>
      new Promise<{ frame: number; overlap: number; expanded: string | null; measured: boolean }[]>((resolve) => {
        const context = document.querySelector<HTMLElement>(contextSelector)
        const text = document.querySelector<HTMLElement>(following)
        const scroller = context?.closest<HTMLElement>(".scroll-view__viewport")
        const trigger = context?.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]')
        const contextRow = context?.closest<HTMLElement>('[data-timeline-row="AssistantPart"]')
        const virtualRow = context?.closest<HTMLElement>("[data-timeline-key]")
        const textRow = text?.closest<HTMLElement>('[data-timeline-row="AssistantPart"]')

        if (!scroller || !trigger || !contextRow || !virtualRow || !textRow) throw new Error("missing regression nodes")
        scroller.scrollTop = scroller.scrollHeight
        const samples: { frame: number; overlap: number; expanded: string | null; measured: boolean }[] = []

        const capture = (frame: number) => {
          const content = context!.querySelector<HTMLElement>('[data-slot="collapsible-content"]')
          const allocated = virtualRow.getBoundingClientRect().height
          const inner = virtualRow.firstElementChild?.getBoundingClientRect().height ?? Infinity
          samples.push({
            frame,
            overlap: Math.max(
              0,
              Math.round((contextRow.getBoundingClientRect().bottom - textRow.getBoundingClientRect().top) * 10) / 10,
            ),
            expanded: trigger.getAttribute("aria-expanded"),
            measured:
              !!content &&
              Math.abs(content.getBoundingClientRect().height - content.scrollHeight) <= 1 &&
              Math.abs(allocated - inner) <= 1,
          })
        }

        capture(-1)
        trigger.click()
        capture(0)

        const tick = (frame: number) =>
          setTimeout(() => {
            capture(frame)
            const last = samples.at(-1)!

            if (last.expanded === "true" && last.measured) return resolve(samples)
            requestAnimationFrame(() => tick(frame + 1))
          }, 0)

        requestAnimationFrame(() => tick(1))
      }),
    { contextSelector, following },
  )

  expect(samples[0]?.overlap).toBe(0)
  expect(samples.filter((sample) => sample.frame >= 1 && sample.overlap > 0.5)).toEqual([])
  expect(samples.at(-1)).toMatchObject({ expanded: "true", measured: true })
})

test("keeps a grouped tool summary stable as its calls complete", async ({ page }) => {
  const timeline = await setupTimeline(page, {
    seedHistory: true,
    settings: expanded,
    messages: contextTurn("running"),
    cpuRate: 4,
  })

  const context = page.locator(contextSelector)
  const label = "Used 4 Read, Glob, Grep, List"
  const trigger = context.locator(':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]')
  await expect(trigger).toHaveAccessibleName(label)
  // Open the group so each call shows whether it is still running.
  await trigger.click()

  const status = (tool: string) =>
    context.locator(
      `[data-slot="context-tool-group-item"] [data-component="text-shimmer"][aria-label="${tool[0]!.toUpperCase()}${tool.slice(1)}"]`,
    )

  for (const tool of contextTools) await expect(status(tool.tool)).toHaveAttribute("data-active", "true")
  const following = `[data-timeline-part-id="${renderedPartID("prt_after_context")}"]`
  await waitForVisualSettle(page, [contextSelector, following])

  const regions = defineVisualRegions({
    status: { selector: `${contextSelector} [data-component="context-tool-group-trigger"]` },
    context: { selector: contextSelector, closest: '[data-timeline-row="AssistantPart"]' },
    following: { selector: following, closest: '[data-timeline-row="AssistantPart"]' },
  })

  await startVisualProbe(page, regions)

  // Each completion lands in its own settled frame so the probe sees every intermediate state.
  for (const tool of contextTools) {
    await timeline.send(
      partUpdated(toolPart(tool.id, tool.tool, "completed", tool.input, { output: output(tool.tool) })),
    )
    await expect(status(tool.tool)).toHaveAttribute("data-active", "false")
    await waitForVisualSettle(page, [contextSelector, following])
  }

  for (const tool of contextTools) await expect(status(tool.tool)).toHaveAttribute("data-active", "false")
  await expect(trigger).toHaveAccessibleName(label)
  const trace = await stopVisualProbe<keyof typeof regions>(page)

  const labels = trace.samples
    .map((sample) => sample.regions.status?.label)
    .filter((value): value is string => !!value)
    .filter((value, index, all) => value !== all[index - 1])

  const issues = analyzeVisualObservations(
    trace.samples,
    visualPlan(regions, [
      { type: "required", regions: ["context", "following"] },
      { type: "opacity", regions: "all" },
      { type: "continuity", regions: "all" },
      { type: "motion", regions: "all" },
      { type: "label-stability", regions: "all" },
      { type: "flow", regions: ["context", "following"] },
    ]),
  )

  expect(labels).toEqual([label])
  expect(issues, JSON.stringify(trace.samples, null, 2)).toEqual([])
})

test("keeps a file diff anchored while it expands and collapses", async ({ page }) => {
  const id = "prt_file_projection_anchored_patch"
  const before = Array.from({ length: 80 }, (_, index) => `export const value${index} = ${index}\n`).join("")
  const after = before.replaceAll(" = ", " = compute(").replaceAll("\n", ")\n")
  await setupTimeline(page, {
    settings: {
      timelineDetail: { ...timelinePresets[2].value, edit: { placement: "separate", details: "collapsed" } },
    },
    messages: [
      userMessage([userText("Preceding context ".repeat(120))]),
      assistantMessage([
        toolPart(
          id,
          "patch",
          "completed",
          { patchText: "Update src/anchored.ts" },
          {
            metadata: {
              files: [
                {
                  file: "src/anchored.ts",
                  status: "modified",
                  patch: createTwoFilesPatch("a/src/anchored.ts", "b/src/anchored.ts", before, after),
                  additions: 80,
                  deletions: 80,
                },
              ],
            },
          },
        ),
      ]),
    ],
    viewport: { width: 1200, height: 600 },
  })

  const scroller = page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-row]") })
  const wrapper = page.locator(`[data-timeline-part-id="${id}"]`)
  const diff = wrapper.locator('[data-component="apply-patch-file-diff"]')
  const row = page.locator("[data-timeline-key]", { has: wrapper })
  const trigger = wrapper.getByRole("button")

  const bottom = () =>
    scroller.evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))

  const measured = () =>
    row.evaluate((element) => {
      const content = element.querySelector<HTMLElement>("[data-index]")

      return content
        ? Math.abs(element.getBoundingClientRect().height - content.getBoundingClientRect().height)
        : Number.POSITIVE_INFINITY
    })

  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect.poll(measured).toBeLessThanOrEqual(1)

  // Pinned to the tail, toggling the diff keeps the view at the bottom.
  for (const visible of [true, false]) {
    await trigger.click()
    await expect(diff).toHaveCount(visible ? 1 : 0)
    await expect.poll(bottom).toBeLessThanOrEqual(1)
  }

  // Scrolled away from the tail, the header keeps its viewport position.
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(1)
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight - 0.25
  })
  await expect(trigger).toBeInViewport()
  await expect.poll(bottom).toBeLessThanOrEqual(0.5)
  const bottomScrollTop = await scroller.evaluate((element) => element.scrollTop)
  await scroller.hover()
  await page.mouse.wheel(0, -20)
  await expect
    .poll(() => scroller.evaluate((element, bottom) => bottom - element.scrollTop, bottomScrollTop))
    .toBeGreaterThan(0)
  const y = await trigger.evaluate((element) => element.getBoundingClientRect().y)
  const collapsedHeight = await row.evaluate((element) => element.getBoundingClientRect().height)
  await trigger.click()
  await expect(diff).toBeVisible()
  await expect
    .poll(() =>
      row.evaluate((element, collapsed) => {
        const content = element.querySelector<HTMLElement>("[data-index]")
        const allocated = element.getBoundingClientRect().height

        return {
          grew: allocated > collapsed + 1,
          measured: content ? Math.abs(allocated - content.getBoundingClientRect().height) <= 1 : false,
        }
      }, collapsedHeight),
    )
    .toEqual({ grew: true, measured: true })
  await expect
    .poll(() => trigger.evaluate((element, initialY) => Math.abs(element.getBoundingClientRect().y - initialY), y))
    .toBeLessThanOrEqual(5)

  const scrollTop = await scroller.evaluate((element) => element.scrollTop)
  await scroller.hover()
  await page.mouse.wheel(0, 200)
  await expect
    .poll(() => scroller.evaluate((element, initial) => element.scrollTop - initial, scrollTop))
    .toBeGreaterThan(50)
  expect(await scroller.evaluate((element, initial) => element.scrollTop - initial, scrollTop)).toBeLessThan(400)

  const expandedY = await trigger.evaluate((element) => element.getBoundingClientRect().y)
  await trigger.click()
  await expect(diff).toHaveCount(0)
  await expect.poll(bottom).toBeLessThanOrEqual(1)
  await expect.poll(() => trigger.evaluate((element) => element.getBoundingClientRect().y)).toBeGreaterThan(expandedY)

  await trigger.click()
  await expect(diff).toBeVisible()
  await expect.poll(measured).toBeLessThanOrEqual(1)
  await expect.poll(bottom).toBeLessThanOrEqual(1)
})

for (const outline of [
  { name: "shell outline at 1.25x", kind: "shell", deviceScaleFactor: 1.25 },
  { name: "shell outline at 1.5x", kind: "shell", deviceScaleFactor: 1.5 },
  { name: "patch card", kind: "patch", deviceScaleFactor: undefined },
] as const) {
  test(`keeps the ${outline.name} inside a fractionally short virtual row`, async ({ page }) => {
    const partID = outline.kind === "shell" ? "prt_shell_outline" : "prt_patch_outline"
    const secondUserID = "msg_outline_second_user"

    const tool =
      outline.kind === "shell"
        ? shell(partID, "completed", "shell output")
        : toolPart(
            partID,
            "patch",
            "completed",
            { patchText: "Update src/outline.ts" },
            {
              metadata: {
                files: [
                  {
                    file: "src/outline.ts",
                    status: "modified",
                    patch:
                      "diff --git a/src/outline.ts b/src/outline.ts\n--- a/src/outline.ts\n+++ b/src/outline.ts\n@@ -1 +1 @@\n-const outline = false\n+const outline = true\n",
                    additions: 1,
                    deletions: 1,
                  },
                ],
              },
            },
          )

    // A second turn adds the fixed turn gap, which must not get the paint-rounding margin.
    await setupTimeline(page, {
      messages: [
        userMessage(undefined, {
          summary: {
            diffs: [
              {
                file: "src/summary.ts",
                additions: 1,
                deletions: 1,
                status: "modified",
                patch: "@@ -1 +1 @@\n-export const value = 1\n+export const value = 2",
              },
            ],
          },
        }),
        assistantMessage([tool]),
        userMessage(undefined, { id: secondUserID, created: 1700000010000 }),
        assistantMessage([], { id: "msg_outline_second_assistant", parentID: secondUserID, created: 1700000011000 }),
      ],
      settings:
        outline.kind === "shell"
          ? { shellToolPartsExpanded: true }
          : { timelineDetail: { ...timelinePresets[2].value, edit: { placement: "separate", details: "collapsed" } } },
      reducedMotion: true,
      deviceScaleFactor: outline.deviceScaleFactor,
    })
    await expect(page.locator('[data-timeline-row="TurnGap"]')).toBeVisible()

    const rows = await page.locator("[data-timeline-key]").evaluateAll((elements) =>
      elements.map((element) => ({
        tag: element.querySelector<HTMLElement>("[data-timeline-row]")?.dataset.timelineRow,
        clipMargin: getComputedStyle(element).overflowClipMargin,
      })),
    )

    // Stage also reserves paint space for reply bubbles; every content row must cover fractional rounding.
    expect(rows.filter((row) => row.tag !== "TurnGap").every((row) => Number.parseFloat(row.clipMargin) >= 0.5)).toBe(
      true,
    )
    expect(rows.filter((row) => row.tag === "TurnGap")).toEqual([{ tag: "TurnGap", clipMargin: "0px" }])

    const part = page.locator(`[data-timeline-part-id="${partID}"]`)
    const row = page.locator("[data-timeline-key]", { has: part })

    if (outline.kind === "patch") {
      const card = part.locator('[data-component="accordion"][data-scope="apply-patch"]')
      await expect(card.getByRole("button")).toHaveAttribute("aria-expanded", "false")

      const geometry = await row.evaluate((element) => {
        const card = element.querySelector<HTMLElement>('[data-component="accordion"][data-scope="apply-patch"]')

        if (!card) throw new Error("Patch card is unavailable")
        const cardRect = card.getBoundingClientRect()
        element.style.height = `${cardRect.bottom - element.getBoundingClientRect().top - 0.49}px`
        const clipMargin = getComputedStyle(element).overflowClipMargin
        const bottom = element.getBoundingClientRect().bottom

        return {
          overflow: card.getBoundingClientRect().bottom - bottom,
          paintOverflow: card.getBoundingClientRect().bottom - bottom - Number.parseFloat(clipMargin),
          cardWidth: cardRect.width,
          cardHeight: cardRect.height,
        }
      })

      expect(geometry.overflow).toBeCloseTo(0.49, 1)
      expect(geometry.paintOverflow).toBeLessThanOrEqual(0)
      const edges = await captureCardEdges(page, card)
      expect(edges.box.width).toBeCloseTo(geometry.cardWidth, 2)
      expect(edges.box.height).toBeCloseTo(geometry.cardHeight, 2)
      expect(edges.luminance.top).toBeLessThan(245)
      expect(edges.luminance.bottom).toBeLessThan(245)
      expect(Math.abs(edges.luminance.bottom - edges.luminance.top)).toBeLessThan(10)

      return
    }

    const bash = part.locator('[data-component="bash-output"]')
    await expect(bash).toBeVisible()
    await waitForVisualSettle(page, [`[data-timeline-part-id="${partID}"] [data-component="bash-output"]`])

    const geometry = await row.evaluate((element) => {
      const output = element.querySelector<HTMLElement>('[data-component="bash-output"]')

      if (!output) throw new Error("Shell output is unavailable")
      const outputRect = output.getBoundingClientRect()
      // Match a rounded-down measurement at a fractional device-pixel phase.
      element.style.height = `${outputRect.bottom - element.getBoundingClientRect().top - 0.49}px`
      element.style.transform = "translateY(0.25px)"
      output.style.setProperty("--v2-border-border-base", "rgb(255, 0, 255)")
      output.style.setProperty("background", "rgb(0, 0, 0)", "important")
      const style = getComputedStyle(output)

      return {
        outputWidth: outputRect.width,
        outputHeight: outputRect.height,
        borderColor: style.borderTopColor,
        boxShadow: style.boxShadow,
      }
    })

    await expect
      .poll(() =>
        row.evaluate(
          (element) =>
            element.querySelector<HTMLElement>('[data-component="bash-output"]')!.getBoundingClientRect().bottom -
            element.getBoundingClientRect().bottom,
        ),
      )
      .toBeCloseTo(0.49, 1)
    expect(await page.evaluate(() => devicePixelRatio)).toBe(outline.deviceScaleFactor)
    const edges = await captureCardEdges(page, bash)
    expect(edges.box.width).toBeCloseTo(geometry.outputWidth, 2)
    expect(edges.box.height).toBeCloseTo(geometry.outputHeight, 2)
    expect(geometry.borderColor).toBe("rgb(255, 0, 255)")
    expect(geometry.boxShadow).toBe("none")
    expect(edges.magenta.top).toBeGreaterThan(0.75)
    expect(edges.magenta.bottom).toBeGreaterThan(0.75)
    expect(edges.magenta.vertical).toBeGreaterThanOrEqual(2)
  })
}

for (const failed of [false, true]) {
  test(`keeps a submitted prompt in place until Working shows${failed ? " after an error" : ""}`, async ({ page }) => {
    await setupTimeline(page, {
      seedHistory: true,
      messages: [
        userMessage(),
        ...(failed
          ? [{ ...assistantMessage([]), error: { type: "provider.error", message: "Previous request failed" } }]
          : []),
      ],
    })
    const working = page.locator('[data-component="session-working"]')
    await expect(working).toHaveCount(0)
    const release = Promise.withResolvers<void>()
    await page.route(`**/api/session/${sessionID}/prompt`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      await release.promise

      return route.fallback()
    })

    const text = "Observe optimistic prompt spacing."
    const editor = page.locator('[data-component="composer"]').getByRole("textbox")
    await expect(editor).toBeEditable()
    await editor.fill(text)
    await expect(page.locator('[data-action="composer-submit"]')).toBeEnabled()

    const bottom = () =>
      page.locator("[data-timeline-virtual-content]").evaluate((element) => {
        const root = element.parentElement!

        return root.scrollHeight - root.clientHeight - root.scrollTop
      })

    await expect.poll(bottom).toBe(0)

    // Records the prompt row in every frame from submission until Working has shown.
    const observation = await page.evaluateHandle((text) => {
      const frames: { prompt?: number; working: boolean }[] = []
      let frame = 0

      const sample = () => {
        const prompt = [...document.querySelectorAll<HTMLElement>('[data-timeline-row="UserMessage"]')].find((row) =>
          row.textContent?.includes(text),
        )

        frames.push({
          prompt: prompt?.getBoundingClientRect().y,
          working: !!document.querySelector('[data-component="session-working"]'),
        })
        frame = requestAnimationFrame(sample)
      }

      frame = requestAnimationFrame(sample)

      return {
        stop: () => {
          cancelAnimationFrame(frame)

          return frames
        },
      }
    }, text)

    const requested = page.waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${sessionID}/prompt`,
    )

    try {
      await editor.press("Enter")
      expect((await requested).postDataJSON()).toMatchObject({ text })
      await expect(page.locator('[data-timeline-row="UserMessage"]').filter({ hasText: text })).toBeInViewport()
      await expect(working).toHaveRole("status")
      await expect(working.locator('[data-component="text-shimmer"]')).toHaveAttribute("aria-label", "Working")
      await expect(working).toBeInViewport()
      await expect(page.locator('[data-timeline-row="Thinking"]')).toHaveCount(0)
      await expect.poll(bottom).toBe(0)
      const frames = await observation.evaluate((value) => value.stop())
      expect(frames.some((frame) => frame.working && frame.prompt === undefined)).toBe(false)
      const positions = frames.flatMap((frame) => (frame.prompt === undefined ? [] : [frame.prompt]))
      expect(positions.length).toBeGreaterThan(0)
      expect(new Set(positions).size).toBe(1)
    } finally {
      release.resolve()
      await observation.dispose()
    }
  })
}

async function captureCardEdges(page: Page, card: Locator) {
  const box = await card.boundingBox()

  if (!box) throw new Error("Tool card bounds are unavailable")
  const viewport = page.viewportSize()

  if (!viewport) throw new Error("Viewport bounds are unavailable")
  const screenshot = await page.screenshot()

  return page.evaluate(
    async ({ source, box, viewport }) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")

      if (!context) throw new Error("2D canvas is unavailable")
      context.drawImage(image, 0, 0)
      const scale = { x: image.naturalWidth / viewport.width, y: image.naturalHeight / viewport.height }

      const rows = (candidates: number[]) => {
        const left = Math.floor((box.x + 8) * scale.x)
        const width = Math.floor((box.width - 16) * scale.x)

        return candidates.map((row) => {
          const pixels = context.getImageData(left, row, width, 1).data
          const indexes = Array.from({ length: width }, (_, index) => index * 4)

          return {
            luminance:
              indexes
                .map((index) => (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3)
                .reduce((sum, value) => sum + value, 0) / width,
            magenta:
              indexes.filter((index) => pixels[index]! > 200 && pixels[index + 1]! < 180 && pixels[index + 2]! > 200)
                .length / width,
          }
        })
      }

      const pixels = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data
      const columns = new Uint32Array(image.naturalWidth)

      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index]! <= 200 || pixels[index + 1]! >= 180 || pixels[index + 2]! <= 200) continue
        columns[(index / 4) % image.naturalWidth] = columns[(index / 4) % image.naturalWidth]! + 1
      }

      const top = box.y * scale.y
      const bottom = (box.y + box.height) * scale.y
      const topRows = rows([Math.floor(top) - 1, Math.floor(top), Math.ceil(top)])
      const bottomRows = rows([Math.floor(bottom) - 2, Math.floor(bottom) - 1, Math.ceil(bottom) - 1])

      return {
        box,
        luminance: {
          top: Math.min(...topRows.map((row) => row.luminance)),
          bottom: rows([Math.ceil(bottom) - 1])[0]!.luminance,
        },
        magenta: {
          top: Math.max(...topRows.map((row) => row.magenta)),
          bottom: Math.max(...bottomRows.map((row) => row.magenta)),
          vertical: Array.from(columns).filter((count) => count > box.height * scale.y * 0.75).length,
        },
      }
    },
    { source: `data:image/png;base64,${screenshot.toString("base64")}`, viewport, box },
  )
}
