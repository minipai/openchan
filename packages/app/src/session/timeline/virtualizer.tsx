import {
  createVirtualizer,
  defaultRangeExtractor,
  elementScroll,
  observeElementRect,
  type Range,
  type VirtualItem,
} from "@tanstack/solid-virtual"
import { isScrollKeyTarget, scrollKey, scrollKeyOwner, ScrollView } from "@opencode/ui/scroll-view"
import { Predicate } from "effect"
import { Timeline, TimelineRow } from "@opencode/session-ui/timeline/projection"
import { useLanguage } from "@/runtime/i18n/language"
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type JSX,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import type { createTimelineProjection } from "./projection"
import { observeElementOffsetReconnectAware } from "./observe-element-offset"
import { filterVirtualIndexes } from "./virtual-items"

const fallbackItemSize = 60

const pendingMarkdown = '[data-component="markdown"]:not([data-markdown-ready])'

// Distance from the bottom that counts as "at the end". Deliberately tight: a collapse clamps
// exactly to the end, while a one-pixel nudge upward is a deliberate move away from it.
const endEpsilon = 0.5

const upwardKeys = new Set(["up", "page-up", "home"])

const cache = new Map<
  string,
  {
    measurements: VirtualItem[]
    toolOpen: Record<string, boolean | undefined>
    patchGroupKeys: Map<string, string>
    presentationKey?: string
    layoutKey?: string
  }
>()

type Projection = Pick<
  ReturnType<typeof createTimelineProjection>,
  "activeMessageID" | "messageByID" | "messageLastRowIndex" | "messageRowIndex" | "rowByKey" | "rows"
>

type DocumentGroup = { id: string; rows: TimelineRow.TimelineRow[] }

type TimelineVirtualItem = { key: string; rows: readonly TimelineRow.TimelineRow[] }

type Input = {
  active?: Accessor<boolean>
  sessionKey: Accessor<string>
  presentationKey?: Accessor<string>
  layoutKey?: Accessor<string>
  projection: Projection
  documentGroups?: Accessor<readonly DocumentGroup[] | undefined>
  showHeader: Accessor<boolean>
  fixedHeader?: Accessor<boolean>
  /** True while the timeline follows the newest content. Drives every anchoring decision. */
  pinned: Accessor<boolean>
  scroll: Accessor<{ overflow: boolean; jump: boolean }>
  onResumeScroll: () => void
  setScrollRef: (element: HTMLDivElement | undefined) => void
  setContentRef: (element: HTMLDivElement) => void
  onScheduleScrollState: (element: HTMLDivElement) => void
  onPin: () => void
  onUnpin: () => void
  onHistoryLayoutReady?: (ready: boolean) => void
  onSelectionInteraction: (event: MouseEvent) => void
  onUserScroll: (target?: EventTarget | null) => void
  onHistoryScroll: () => void
  rowMembers?: (row: TimelineRow.TimelineRow) => readonly TimelineRow.TimelineRow[] | undefined
  canRenderImmediately?: (
    row: TimelineRow.TimelineRow,
    disclosure: Readonly<Record<string, boolean | undefined>>,
  ) => boolean
  setRevealMessage?: (fn: (id: string, partID?: string) => void) => void
  setScrollToEnd?: (fn: () => void) => void
  beforeRevealMessage?: (id: string, partID?: string) => void
  /** A tool call the route asks this timeline to open on; `done` clears it once revealed. */
  reveal?: { target: () => string | undefined; done: () => void }
}

type ViewProps = {
  header: JSX.Element
  afterHeader?: JSX.Element
  frameClass?: string
  frameOverlay?: (userMessageID?: string) => JSX.Element
  bottomSpacer?: JSX.Element
  workspaceSession: Accessor<boolean>
  deferred: (row: TimelineRow.TimelineRow) => boolean
  renderRow: (row: Accessor<TimelineRow.TimelineRow>, onSizeChange?: () => void) => JSX.Element
}

export function createTimelineVirtualizer(input: Input) {
  const language = useLanguage()
  const active = () => input.active?.() !== false
  const isDesktop = createMediaQuery("(min-width: 768px)")
  const topOffset = () => (input.fixedHeader?.() ? 0 : input.showHeader() ? 64 : isDesktop() ? 0 : 16)
  const ownerSessionKey = input.sessionKey()
  const entry = cache.get(ownerSessionKey)
  const cached = entry?.presentationKey === input.presentationKey?.() ? entry : undefined
  const initialMeasurements = cached?.layoutKey === input.layoutKey?.() ? cached?.measurements : undefined
  const coldBottomMount = !initialMeasurements?.length && input.pinned()
  const [listRoot, setListRoot] = createSignal<HTMLDivElement>()
  const [toolOpen, setToolOpen] = createStore<Record<string, boolean | undefined>>(cached?.toolOpen ?? {})
  const patchGroupKeys = cached?.patchGroupKeys ?? new Map<string, string>()
  const [rendering, setRendering] = createStore({ initialTail: coldBottomMount, scrollAdjustment: 0 })
  const rows = input.projection.rows
  const rowByKey = input.projection.rowByKey

  const grouped = () => input.documentGroups?.() !== undefined

  const items = createMemo<TimelineVirtualItem[]>(() => {
    const groups = input.documentGroups?.()

    if (groups) return groups.map((group) => ({ key: `document:${group.id}`, rows: group.rows }))

    return rows().map((row) => ({ key: TimelineRow.key(row), rows: [row] }))
  })

  const itemByKey = createMemo(() => new Map(items().map((item) => [item.key, item] as const)))

  const itemKeys = createMemo(() => items().map((item) => item.key), undefined, {
    equals: (previous, next) => previous.length === next.length && previous.every((key, index) => key === next[index]),
  })

  const itemIndexByMessageID = createMemo(() => {
    const result = new Map<string, number>()

    items().forEach((item, index) => {
      item.rows.forEach((row) => {
        if (!result.has(row.userMessageID)) result.set(row.userMessageID, index)
      })
    })

    return result
  })

  const latestActiveItemIndex = createMemo(() => {
    const id = input.projection.activeMessageID()

    if (!id) return -1

    return grouped() ? (itemIndexByMessageID().get(id) ?? -1) : (input.projection.messageLastRowIndex().get(id) ?? -1)
  })

  const knownKeys = new Set(itemKeys())
  const addedKeys = new Set<string>()

  const getItemKey = createMemo(() => {
    const keys = itemKeys()
    keys
      .filter((key) => !knownKeys.has(key))
      .forEach((key) => {
        knownKeys.add(key)
        addedKeys.add(key)
      })

    return (index: number) => keys[index] ?? `removed:${index}`
  })

  const rangeExtractor = createMemo(() => {
    const active = latestActiveItemIndex()
    const initialTail = rendering.initialTail && input.pinned()

    return (range: Range) => {
      // Batch a bounded cheap suffix, but stop before unknown/large content.
      // A large tail still mounts alone before estimates expose earlier history.
      const start = Math.max(0, range.startIndex - 2)

      const boundary = initialTail
        ? items()
            .slice(start, range.count)
            .findLastIndex((item) =>
              item.rows.some((row) =>
                (input.rowMembers?.(row) ?? [row]).some(
                  (member) =>
                    !(
                      (Predicate.isTagged(member, "AssistantPart") &&
                        member.group.type === "context" &&
                        member.group.refs.length <= 64 &&
                        !toolOpen[`context:${member.group.key}`]) ||
                      input.canRenderImmediately?.(member, toolOpen)
                    ),
                ),
              ),
            )
        : -1

      const first = Math.min(range.count - 1, start + boundary + 1)

      const indexes = initialTail
        ? Array.from({ length: range.count - first }, (_, index) => first + index)
        : defaultRangeExtractor({ ...range, overscan: 2 })

      return filterVirtualIndexes(
        [...new Set([...indexes, ...(active < 0 ? [] : [active])])].sort((a, b) => a - b),
        range.count,
      )
    }
  })

  const measuredElements = new WeakSet<Element>()
  let touchStart: number | undefined
  let touchTarget: EventTarget | null = null
  let touchNested = false
  let touchScrolling = false
  let touchAdjustment = 0
  let pointerHeld = false
  let maxScroll = 0
  let virtualContent: HTMLDivElement | undefined
  let scrollTop = 0
  let reportOffset: ((offset: number, scrolling: boolean) => void) | undefined
  let reportRect: ((rect: { width: number; height: number }) => void) | undefined
  let batchingColdSizes = false

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return items().length
    },
    getScrollElement: () => listRoot() ?? null,
    observeElementRect: (instance, callback) => {
      reportRect = callback

      return observeElementRect(instance, (rect) => {
        if (active()) callback(rect)
      })
    },
    // Route navigation detaches and reattaches the scroll element, which drops its offset.
    observeElementOffset: (instance, callback) => {
      reportOffset = (offset, scrolling) => {
        if (!active()) return
        // Rows and the sizer use the opposite translation while native touch
        // scrolling keeps its own offset. Range selection uses the logical offset.
        batch(() => {
          const logicalOffset = offset + rendering.scrollAdjustment
          callback(rendering.scrollAdjustment ? Math.max(0, logicalOffset) : offset, scrolling)
          // Reconcile both start boundaries in one native write. Gradually
          // clamping row translations lets the compositor paint between
          // corrections and makes the content oscillate at the top.
          const root = listRoot()

          if (
            rendering.scrollAdjustment !== 0 &&
            root &&
            (logicalOffset <= 0 || offset <= 0 || (touchStart !== undefined && offset <= root.clientHeight))
          )
            flushTouchAdjustment()

          if (!scrolling && touchStart === undefined) finishTouchScroll()
        })
        settleColdBottom()
      }

      return observeElementOffsetReconnectAware(instance, reportOffset, () => {
        if (!active()) return
        virtualContent?.querySelectorAll<HTMLDivElement>("[data-index]").forEach(virtualizer.measureElement)

        if (input.pinned()) scrollToEnd()
        settleColdBottom()
      })
    },
    initialOffset: () => (input.pinned() ? Number.MAX_SAFE_INTEGER : 0),
    initialMeasurementsCache: initialMeasurements,
    estimateSize: () => fallbackItemSize,
    // A newly observed element gets a real ResizeObserver box before paint. Reuse
    // its snapshot on attachment, but later explicit measurements must read layout
    // so deferred/rewrapped content cannot keep stale, clipped heights (TanStack/virtual#1183).
    measureElement: (element, entry, instance) => {
      if (!active() || !element.isConnected)
        return (
          instance.itemSizeCache.get(instance.options.getItemKey(instance.indexFromElement(element))) ??
          fallbackItemSize
        )
      const initial = !measuredElements.has(element)
      measuredElements.add(element)
      const box = entry?.borderBoxSize[0]

      if (box) return Math.round(box.blockSize)

      if (initial) {
        const size = instance.itemSizeCache.get(instance.options.getItemKey(instance.indexFromElement(element)))

        if (size !== undefined || coldPending) return size ?? fallbackItemSize
      }

      return element.offsetHeight
    },
    scrollToFn: (offset, options, instance) => {
      if (!active()) return

      if (batchingColdSizes && input.pinned()) return
      setRendering("scrollAdjustment", 0)

      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`
      elementScroll(offset, options, instance)
    },
    get getItemKey() {
      return getItemKey()
    },
    get anchorTo() {
      return input.pinned() ? "end" : "start"
    },
    get followOnAppend() {
      return input.pinned()
    },
    scrollEndThreshold: 80,
    get scrollMargin() {
      // Empty projections still need the bottom spacer for running status.
      return items().length > 0 ? topOffset() : 0
    },
    paddingEnd: 64,
    get rangeExtractor() {
      return rangeExtractor()
    },
  })

  createEffect(
    on(
      () => input.presentationKey?.(),
      () => {
        setToolOpen(reconcile({}))
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => input.layoutKey?.(),
      () => {
        virtualizer.measure()
        // Native views can retain the same rows and sizes, so ResizeObserver may not fire.
        queueMicrotask(() => {
          if (!active()) return

          virtualizer.elementsCache.forEach((element) => {
            if (element.isConnected) virtualizer.resizeItem(virtualizer.indexFromElement(element), element.offsetHeight)
          })
        })
      },
      { defer: true },
    ),
  )

  const resizeItem = virtualizer.resizeItem
  const pendingSizes = new Map<number, { key: string; size: number }>()
  let resizeScheduled = false
  // Read the whole measurement delivery before committing reactive row sizes.
  // Otherwise each row can render and force layout before the next is measured.
  virtualizer.resizeItem = (index, size) => {
    if (!active()) return
    const item = items()[index]

    if (!item) return
    const key = item.key

    if ((virtualizer.itemSizeCache.get(key) ?? fallbackItemSize) === size) {
      pendingSizes.delete(index)

      return
    }

    pendingSizes.set(index, { key, size })

    if (resizeScheduled) return
    resizeScheduled = true
    queueMicrotask(() => {
      resizeScheduled = false

      if (!pendingSizes.size) return
      const sizes = [...pendingSizes]
      pendingSizes.clear()

      if (!active()) return
      // The hidden pinned mount needs one bottom write after the whole batch,
      // not a layout-forcing scroll adjustment for every measured row.
      batchingColdSizes = coldPending && input.pinned()
      batch(() => {
        sizes.forEach(([index, value]) => {
          const item = items()[index]

          if (!item || item.key !== value.key) return
          resizeItem(index, value.size)

          // TanStack recalculates its range after each resize. Advance the
          // logical fold before deciding whether the next row needs anchoring.
          if (!touchAdjustment) return
          setRendering("scrollAdjustment", (value) => value + touchAdjustment)
          touchAdjustment = 0
          const root = listRoot()

          if (root) reportOffset?.(root.scrollTop, virtualizer.isScrolling)
        })
      })
      batchingColdSizes = false

      if (coldPending) pinColdBottom()
      settleColdBottom()

      if (coldPending) return

      if (!input.pinned()) return
      const root = listRoot()

      // Reopening a settled scroll-to-end operation can fight subsequent keyboard scrolling.
      if (root && Math.abs(root.scrollHeight - root.clientHeight - root.scrollTop) > endEpsilon) scrollToEnd()
    })
  }

  onCleanup(() => pendingSizes.clear())
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) => {
    // Prepended rows can resize more than once as deferred content mounts. Keep
    // compensating while they remain entirely above the visible content fold.
    const first = instance.range?.startIndex

    const adjust = addedKeys.has(String(item.key))
      ? item.end <= (instance.scrollOffset ?? 0) + instance.scrollAdjustments + instance.options.scrollMargin
      : first !== undefined && item.index < first

    if (!touchScrolling || input.pinned()) return adjust

    // iOS defers native scroll writes until momentum ends. Keep the same visual
    // anchor now, rather than moving rows now and snapping the viewport back later.
    if (adjust) touchAdjustment += delta

    return false
  }

  function finishTouchScroll() {
    touchScrolling = false
    flushTouchAdjustment()
  }

  // Scrolls to a tool call, named by its ID or by the shell ID a backgrounded shell call reports, and expands it and
  // the collapsed context group that hides it. Returns whether the call is in the list.
  function revealPart(target: string) {
    if (!active()) return false

    const matches = (ref: { messageID: string; partID: string }) => {
      const content = Timeline.resolveContent(input.projection.messageByID().get(ref.messageID), ref.partID)

      return (
        content?.type === "tool" &&
        (content.id === target || (content.state.status !== "streaming" && content.state.metadata?.shellID === target))
      )
    }

    const found = items().flatMap((item, index) =>
      item.rows.flatMap((row) =>
        (input.rowMembers?.(row) ?? [row]).flatMap((member) =>
          Predicate.isTagged(member, "AssistantPart")
            ? (member.group.type === "part" ? [member.group.ref] : member.group.refs).flatMap((ref) =>
                matches(ref) ? [{ group: member.group, index, partID: ref.partID }] : [],
              )
            : [],
        ),
      ),
    )
      .at(-1)

    if (!found) return false

    const key = found.group.key

    setToolOpen(
      found.group.type === "context"
        ? { [`context:${key}`]: true, [`${key}:tool:${found.partID}`]: true }
        : { [key]: true },
    )
    input.onUnpin()
    prepareNavigation()
    scrollToIndex(found.index, "center")

    return true
  }

  function prepareNavigation() {
    if (touchStart === undefined) touchScrolling = false
    flushTouchAdjustment()
  }

  function flushTouchAdjustment() {
    const adjustment = rendering.scrollAdjustment
    const root = listRoot()

    if (!adjustment || !root) return
    // Transfer the translation into the native offset in the same paint.
    batch(() => {
      setRendering("scrollAdjustment", 0)

      if (virtualContent) virtualContent.style.height = `${virtualizer.getTotalSize()}px`
      elementScroll(Math.max(0, root.scrollTop + adjustment), {}, virtualizer)
    })
  }

  const virtualItemByKey = createMemo(
    () => new Map(virtualizer.getVirtualItems().map((item) => [item.key, item] as const)),
  )

  const virtualRowKeys = createMemo(() => virtualizer.getVirtualItems().map((item) => String(item.key)))

  createEffect(() => {
    if (!active()) return
    const root = listRoot()

    if (root) input.setScrollRef(root)

    if (virtualContent) input.setContentRef(virtualContent)
    queueMicrotask(() => {
      if (!active() || !root?.isConnected) return
      // A detached view can miss its nonzero ResizeObserver delivery. Publish
      // its real viewport before restoring the offset and admitting rows.
      reportRect?.({ width: root.offsetWidth, height: root.offsetHeight })

      // A route can open this timeline on a tool call, e.g. a shell picked from inside a subagent, instead of its end.
      const target = input.reveal?.target()

      if (target && revealPart(target)) input.reveal?.done()
      else if (input.pinned()) scrollToEnd()

      reportOffset?.(root.scrollTop, false)
      settleColdBottom()
    })
    input.setRevealMessage?.((id, partID) => {
      if (!active()) return
      input.beforeRevealMessage?.(id, partID)

      const partIndex = partID
        ? items().findIndex((item) =>
            item.rows.some((row) =>
              (input.rowMembers?.(row) ?? [row]).some((member) => {
                if (Predicate.isTagged(member, "Thinking")) return member.ref.partID === partID

                if (!Predicate.isTagged(member, "AssistantPart")) return false

                const refs = member.group.type === "part" ? [member.group.ref] : member.group.refs

                return refs.some((ref) => ref.partID === partID)
              }),
            ),
          )
        : -1

      const index =
        partIndex >= 0
          ? partIndex
          : grouped()
            ? itemIndexByMessageID().get(id)
            : input.projection.messageRowIndex().get(id)

      if (index === undefined) return
      prepareNavigation()
      scrollToIndex(index, "center")
    })
    input.setScrollToEnd?.(() => {
      if (!active() || !listRoot()?.isConnected) return
      prepareNavigation()
      input.onPin()
      scrollToEnd()
    })
  })

  function scrollToEnd() {
    virtualizer.scrollToEnd()
  }

  function scrollToIndex(index: number, align: "center") {
    virtualizer.scrollToIndex(index, { align })
  }

  let coldPending = !initialMeasurements?.length
  let settleQueued = false
  let contentObserver: MutationObserver | undefined
  let viewportObserver: ResizeObserver | undefined

  const pinColdBottom = () => {
    if (!active()) return
    const root = listRoot()

    if (!input.pinned() || !virtualContent || !root) return

    // scrollToEnd computes its target from the DOM, not the new size cache.
    virtualContent.style.height = `${virtualizer.getTotalSize()}px`

    if (Math.abs(root.scrollHeight - root.clientHeight - root.scrollTop) > endEpsilon) scrollToEnd()

    // Report after core size adjustments finish so they cannot apply a delta
    // twice. This avoids waiting a frame for the native scroll event.
    if (virtualizer.scrollOffset !== root.scrollTop) reportOffset?.(root.scrollTop, false)
  }

  const pendingMeasurements = () => {
    const mounted = virtualizer.getVirtualItems()

    return (
      (items().length > 0 && mounted.length === 0) ||
      mounted.some((item) => !virtualizer.elementsCache.get(item.key)?.isConnected)
    )
  }

  const settleColdBottom = () => {
    if (!active() || !coldPending || settleQueued) return
    settleQueued = true
    queueMicrotask(() => {
      settleQueued = false
      const root = listRoot()

      if (!coldPending || !virtualContent?.isConnected || !root) return

      if (virtualContent.querySelector(pendingMarkdown)) return

      if (!root.clientHeight) return
      // Markdown can finish before ResizeObserver delivers its new box. The
      // normal measureElement path skips reads while scrolling; this gate needs
      // current boxes before expanding the estimated range or revealing it.
      virtualizer.elementsCache.forEach((element) => {
        if (element.isConnected) virtualizer.resizeItem(virtualizer.indexFromElement(element), element.offsetHeight)
      })

      if (pendingSizes.size || pendingMeasurements()) return
      pinColdBottom()

      if (input.pinned() && Math.abs(root.scrollHeight - root.clientHeight - root.scrollTop) > 1) return

      // The scroll event must update the range before newly exposed rows can reveal.
      if (root.scrollHeight > root.clientHeight && Math.abs((virtualizer.scrollOffset ?? 0) - root.scrollTop) > 1)
        return

      if (rendering.initialTail) {
        setRendering("initialTail", false)
        settleColdBottom()

        return
      }

      if (pendingSizes.size || pendingMeasurements() || virtualContent.querySelector(pendingMarkdown)) return
      coldPending = false
      contentObserver?.disconnect()
      viewportObserver?.disconnect()
      virtualContent.style.removeProperty("visibility")
      input.onHistoryLayoutReady?.(true)
    })
  }

  onMount(() => {
    if (!coldPending || !virtualContent) return
    contentObserver = new MutationObserver(settleColdBottom)
    contentObserver.observe(virtualContent, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-markdown-ready"],
    })
    viewportObserver = new ResizeObserver(settleColdBottom)
    const root = listRoot()

    if (root) viewportObserver.observe(root)
    settleColdBottom()
  })

  let measuredSessionKey = input.sessionKey()
  createEffect(() => {
    const key = input.sessionKey()

    if (measuredSessionKey !== key) {
      measuredSessionKey = key
      virtualizer.measure()
    }
  })

  const bindListRoot = (root: HTMLDivElement) => {
    if (root === listRoot()) return
    // TanStack owns anchoring; browser scroll anchoring would fight its adjustments.
    root.style.overflowAnchor = "none"
    setListRoot(root)
    scrollTop = root.scrollTop
    maxScroll = root.scrollHeight - root.clientHeight

    if (active()) {
      input.onHistoryLayoutReady?.(!coldPending)
      input.setScrollRef(root)
    }

    viewportObserver?.observe(root)
    settleColdBottom()
  }

  // Upward input is the one intent geometry cannot recover: nudging up while still a pixel from
  // the end must stop following, even though the resulting position still looks like the end.
  const handleListWheel = (event: WheelEvent & { currentTarget: HTMLDivElement }) => {
    input.onUserScroll(event.target)

    if (event.deltaY < 0) input.onUnpin()
  }

  const handleListTouchStart = (event: TouchEvent) => {
    clearTouchTarget()
    input.onUserScroll(event.target)
    touchScrolling = true
    touchStart = event.touches[0]?.clientY
    const root = listRoot()
    const nested = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-scrollable]") : null
    touchNested = !!nested && nested !== root && nested.scrollHeight > nested.clientHeight
    // Native touch events keep their original target, even when streaming or
    // virtualization detaches it. Listen there instead of relying on bubbling.
    touchTarget = event.target
    touchTarget?.addEventListener("touchmove", handleListTouchMove, { passive: true })
    touchTarget?.addEventListener("touchend", handleListTouchEnd, { passive: true })
    touchTarget?.addEventListener("touchcancel", handleListTouchEnd, { passive: true })

    if (root) reportOffset?.(root.scrollTop, virtualizer.isScrolling)
  }

  const handleListTouchMove = (event: Event) => {
    if (!(event instanceof TouchEvent)) return
    const current = event.touches[0]?.clientY

    if (current === undefined || touchStart === undefined) return
    const previous = touchStart
    touchStart = current

    // A retained target can outlive its whole session view. Only the active
    // timeline may change the shared follow state; release still cleans up below.
    if (!active()) return

    // Dragging the content downward reveals earlier messages.
    if (current <= previous) return

    // A nested scrollport owns the intent. If it chains into the timeline at a
    // boundary, the resulting native timeline scroll below will unpin instead.
    if (touchNested) return
    input.onUnpin()
  }

  const handleListTouchEnd = () => {
    clearTouchTarget()
    touchStart = undefined

    if (!virtualizer.isScrolling) finishTouchScroll()
  }

  function clearTouchTarget() {
    touchTarget?.removeEventListener("touchmove", handleListTouchMove)
    touchTarget?.removeEventListener("touchend", handleListTouchEnd)
    touchTarget?.removeEventListener("touchcancel", handleListTouchEnd)
    touchTarget = null
  }

  onCleanup(clearTouchTarget)

  // Drag-selecting past the edge and dragging the scrollbar both scroll without a wheel or key,
  // so a held pointer is what separates those from the virtualizer's own measurement adjustments.
  const handleListPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    input.onUserScroll(event.target)
    pointerHeld = true
  }

  const releasePointer = () => {
    pointerHeld = false
  }

  onMount(() => {
    window.addEventListener("pointerup", releasePointer)
    window.addEventListener("pointercancel", releasePointer)
  })
  onCleanup(() => {
    window.removeEventListener("pointerup", releasePointer)
    window.removeEventListener("pointercancel", releasePointer)
  })

  const handleListKeyDown = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    const key = scrollKey(event)

    if (!key) return

    if (!isScrollKeyTarget(event.target, key)) return

    if (scrollKeyOwner(event.currentTarget, event.target, key) !== event.currentTarget) return
    input.onUserScroll(event.currentTarget)

    if (upwardKeys.has(key)) input.onUnpin()
  }

  // Following resumes by arriving at the end, either by scrolling there or by content shrinking
  // under a viewport that was already there. Merely resting near the end is not enough, otherwise
  // a later scroll would overwrite an upward intent expressed a pixel short of the bottom.
  const handleListScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (!active()) return
    const root = event.currentTarget

    const previousTop = scrollTop
    const previousMaxScroll = maxScroll
    scrollTop = root.scrollTop
    maxScroll = root.scrollHeight - root.clientHeight
    const atEnd = maxScroll - scrollTop <= endEpsilon
    const arrived = scrollTop > previousTop + endEpsilon || maxScroll < previousMaxScroll

    if (maxScroll <= 1 || (atEnd && arrived)) input.onPin()
    else if ((pointerHeld || touchScrolling) && scrollTop < previousTop - endEpsilon) input.onUnpin()
    settleColdBottom()
    input.onScheduleScrollState(root)
    input.onHistoryScroll()
  }

  function View(props: ViewProps) {
    function VirtualRow(rowProps: { rowKey: string }) {
      let element: HTMLDivElement
      const initialItem = virtualItemByKey().get(rowProps.rowKey)
      const initialRow = itemByKey().get(rowProps.rowKey)!.rows[0]!
      const initialSize = initialItem?.size ?? virtualizer.itemSizeCache.get(rowProps.rowKey) ?? fallbackItemSize
      const item = createMemo(() => virtualItemByKey().get(rowProps.rowKey))
      const index = () => item()?.index ?? itemKeys().indexOf(rowProps.rowKey)
      const row = createMemo(() => itemByKey().get(rowProps.rowKey)?.rows[0] ?? initialRow)
      const [ready, setReady] = createSignal(initialSize <= fallbackItemSize || !props.deferred(initialRow))
      let contentMeasureFrame: number | undefined

      const latestTurn = () => index() > latestActiveItemIndex()

      onMount(() => virtualizer.measureElement(element))
      // Prepending history changes data-index, not the keyed element's identity.
      // Its observer reads the current index and delivers any actual size change.
      onCleanup(() => {
        if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
        queueMicrotask(() => virtualizer.measureElement(null))
      })

      return (
        <div
          data-timeline-key={rowProps.rowKey}
          data-latest-turn={latestTurn() ? "" : undefined}
          style={{
            position: "absolute",
            top: `${(item()?.start ?? 0) - topOffset() - rendering.scrollAdjustment}px`,
            left: "0",
            width: "100%",
            height: `${item()?.size ?? fallbackItemSize}px`,
            overflow: "clip",
            // History highlights and active bubbles extend beyond the measured row box.
            "overflow-clip-margin": Predicate.isTagged(row(), "TurnGap")
              ? undefined
              : latestTurn() || !input.pinned()
                ? "13px"
                : "0.5px",
          }}
        >
          <div
            ref={(value) => {
              element = value

              if (
                !Predicate.isTagged(row(), "UserMessage") ||
                !addedKeys.has(rowProps.rowKey) ||
                !input.pinned() ||
                coldPending
              )
                return
              // The optimistic row can paint before ResizeObserver corrects the tail estimates.
              // Measure the mounted tail and pin it in this render's microtask instead.
              queueMicrotask(() => {
                if (!input.pinned() || !virtualContent?.isConnected) return
                virtualizer.elementsCache.forEach((item) => {
                  if (item.isConnected) virtualizer.resizeItem(virtualizer.indexFromElement(item), item.offsetHeight)
                })
                virtualizer.resizeItem(index(), element.offsetHeight)

                virtualContent.style.height = `${virtualizer.getTotalSize()}px`

                scrollToEnd()
              })
            }}
            data-index={index()}
            style={{ "min-height": ready() ? undefined : `${initialSize}px` }}
          >
            {props.renderRow(row, () => {
              setReady(true)

              if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
              contentMeasureFrame = requestAnimationFrame(() => {
                contentMeasureFrame = undefined

                if (active() && element.isConnected) virtualizer.measureElement(element)
              })
            })}
          </div>
        </div>
      )
    }

    function VirtualGroup(groupProps: { itemKey: string }) {
      let element: HTMLDivElement
      const initialItem = virtualItemByKey().get(groupProps.itemKey)
      const initialGroup = itemByKey().get(groupProps.itemKey)!
      const initialSize = initialItem?.size ?? virtualizer.itemSizeCache.get(groupProps.itemKey) ?? fallbackItemSize
      const item = createMemo(() => virtualItemByKey().get(groupProps.itemKey))
      const group = createMemo(() => itemByKey().get(groupProps.itemKey) ?? initialGroup)
      const rowsByKey = createMemo(() => new Map(group().rows.map((row) => [TimelineRow.key(row), row] as const)))

      const overlayAfterKey = createMemo(() => {
        const prompt = group().rows.find((row) => Predicate.isTagged(row, "UserMessage"))
        const anchor = prompt ?? group().rows.at(-1)

        return anchor ? TimelineRow.key(anchor) : undefined
      })

      const index = () => item()?.index ?? itemKeys().indexOf(groupProps.itemKey)
      const [ready, setReady] = createSignal(initialSize <= fallbackItemSize || group().rows.every((row) => !props.deferred(row)))
      let contentMeasureFrame: number | undefined

      const measure = () => {
        setReady(true)

        if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
        contentMeasureFrame = requestAnimationFrame(() => {
          contentMeasureFrame = undefined

          if (active() && element.isConnected) virtualizer.measureElement(element)
        })
      }

      onMount(() => virtualizer.measureElement(element))
      onCleanup(() => {
        if (contentMeasureFrame !== undefined) cancelAnimationFrame(contentMeasureFrame)
        queueMicrotask(() => virtualizer.measureElement(null))
      })

      return (
        <div
          ref={(value) => {
            element = value

            if (
              !group().rows.some((row) => Predicate.isTagged(row, "UserMessage")) ||
              !addedKeys.has(groupProps.itemKey) ||
              !input.pinned() ||
              coldPending
            )
              return
            queueMicrotask(() => {
              if (!input.pinned() || !virtualContent?.isConnected) return
              virtualizer.elementsCache.forEach((item) => {
                if (item.isConnected) virtualizer.resizeItem(virtualizer.indexFromElement(item), item.offsetHeight)
              })
              virtualizer.resizeItem(index(), element.offsetHeight)
              virtualContent.style.height = `${virtualizer.getTotalSize()}px`
              scrollToEnd()
            })
          }}
          data-index={index()}
          data-document-exchange=""
          class="document-exchange"
          style={{
            position: "absolute",
            top: `${(item()?.start ?? 0) - topOffset() - rendering.scrollAdjustment}px`,
            left: "0",
            width: "100%",
            "min-height": ready() ? undefined : `${initialSize}px`,
          }}
        >
          <div data-document-paper="" class="document-paper">
            <For each={group().rows.map(TimelineRow.key)}>
              {(rowKey) => {
                const initialRow = rowsByKey().get(rowKey)!

                const row = createMemo(() => rowByKey().get(rowKey) ?? initialRow)

                return (
                  <>
                    <div
                      data-timeline-key={rowKey}
                      data-latest-turn={index() >= latestActiveItemIndex() ? "" : undefined}
                    >
                      {props.renderRow(row, measure)}
                    </div>
                    <Show when={props.frameOverlay && overlayAfterKey() === rowKey}>
                      {props.frameOverlay?.(group().rows[0]?.userMessageID)}
                    </Show>
                  </>
                )
              }}
            </For>
          </div>
        </div>
      )
    }

    return (
      <div
        class="relative w-full h-full min-w-0"
        classList={{ "flex flex-col min-h-0": input.fixedHeader?.() }}
        data-workspace-session={props.workspaceSession() ? "" : undefined}
        data-local-session={!props.workspaceSession() ? "" : undefined}
      >
        <Show when={input.fixedHeader?.() && input.showHeader()}>{props.header}</Show>
        <div class={props.frameClass} style={{ display: props.frameClass ? undefined : "contents" }}>
          {props.afterHeader}
          <div
            class="absolute left-1/2 -translate-x-1/2 z-[60] pointer-events-none transition-all duration-200 ease-out"
            classList={{
              "bottom-8": true,
              "opacity-100 translate-y-0 scale-100": input.scroll().overflow && input.scroll().jump,
              "opacity-0 translate-y-2 pointer-events-none": !input.scroll().overflow || !input.scroll().jump,
              "scale-[0.8]": !input.scroll().overflow || !input.scroll().jump,
            }}
          >
            <button
              type="button"
              aria-label={language.t("session.messages.jumpToLatest")}
              class="pointer-events-auto flex items-center justify-center w-8 h-7 px-2 py-1.5 rounded-lg border-none cursor-pointer text-v2-text-text-base backdrop-blur-[2px]"
              style={{
                background: "color-mix(in srgb, var(--v2-background-bg-base) 92%, transparent)",
                "box-shadow": "var(--v2-elevation-raised), 0px 2px 8px var(--v2-background-bg-base)",
              }}
              onClick={input.onResumeScroll}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M12.3333 8.66665L8 13L3.66667 8.66665M8 12.6667V2.83332"
                  stroke="currentColor"
                  stroke-linecap="square"
                />
              </svg>
            </button>
          </div>
          <ScrollView
            data-slot="session-timeline-scroll"
            viewportRef={bindListRoot}
            onBeforeScroll={prepareNavigation}
            verticalScrollAdjustment={rendering.scrollAdjustment}
            onWheel={handleListWheel}
            onTouchStart={handleListTouchStart}
            onPointerDown={handleListPointerDown}
            onKeyDown={handleListKeyDown}
            onScroll={handleListScroll}
            onClick={input.onSelectionInteraction}
            class="relative min-w-0 w-full h-full"
            style={{ "--sticky-accordion-top": input.showHeader() && !input.fixedHeader?.() ? "48px" : "0px" }}
          >
            <Show when={!input.fixedHeader?.()}>
              <Show when={input.showHeader()} fallback={<div aria-hidden="true" class="h-4 md:hidden" />}>
                {props.header}
              </Show>
            </Show>
            <div
              data-timeline-virtual-content
              class="w-full"
              ref={(element) => {
                virtualContent = element

                if (active()) input.setContentRef(element)
              }}
              style={{
                height: `${virtualizer.getTotalSize() - rendering.scrollAdjustment}px`,
                position: "relative",
                visibility: coldBottomMount ? "hidden" : undefined,
              }}
            >
              <For each={virtualRowKeys()}>
                {(itemKey) =>
                  grouped() ? (
                    <VirtualGroup itemKey={itemKey} />
                  ) : (
                    <VirtualRow rowKey={itemKey} />
                  )
                }
              </For>
              <div
                data-timeline-row="bottom-spacer"
                class="absolute top-0 left-0 h-16 w-full"
                style={{
                  transform: `translateY(${virtualizer.getTotalSize() - 64 - rendering.scrollAdjustment}px)`,
                }}
              >
                {props.bottomSpacer}
              </div>
            </div>
          </ScrollView>
        </div>
      </div>
    )
  }

  onCleanup(() => {
    cache.delete(ownerSessionKey)
    cache.set(ownerSessionKey, {
      measurements: virtualizer.takeSnapshot(),
      toolOpen: { ...toolOpen },
      patchGroupKeys,
      presentationKey: input.presentationKey?.(),
      layoutKey: input.layoutKey?.(),
    })

    while (cache.size > 16) cache.delete(cache.keys().next().value!)
    coldPending = false
    contentObserver?.disconnect()
    viewportObserver?.disconnect()

    if (active()) {
      input.setScrollRef(undefined)
      input.setRevealMessage?.(() => {})
      input.setScrollToEnd?.(() => {})
    }
  })

  return {
    disclosure: {
      patchGroupKeys,
      value: (key: string) => toolOpen[key],
      set: (key: string, open: boolean) => setToolOpen(key, open),
    },
    revealPart,
    scrollToEnd,
    View,
  }
}
