import type { Accessor, JSX } from "solid-js"
import { onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"

type ContextUsage = { used: number; limit: number; percentage: number }

type CommsAvatarProps = {
  contextUsage: Accessor<ContextUsage | undefined>
  portrait: JSX.Element
}

export function CommsAvatar(props: CommsAvatarProps) {
  const language = useLanguage()
  const ringRadius = 82
  const circumference = 2 * Math.PI * ringRadius
  const [position, setPosition] = createStore({ x: 0, y: 0, initialized: false, dragging: false })
  let rootElement: HTMLElement | undefined
  let avatarElement: HTMLDivElement | undefined

  let dragStart:
    | { pointerId: number; pointerX: number; pointerY: number; left: number; top: number }
    | undefined

  const contextLabel = () => {
    const usage = props.contextUsage()

    if (!usage) return language.t("session.comms.context.unavailable")

    return language.t("session.comms.context.usage", {
      percentage: usage.percentage.toLocaleString(language.intl()),
      used: usage.used.toLocaleString(language.intl()),
      limit: usage.limit.toLocaleString(language.intl()),
    })
  }

  const setClampedPosition = (left: number, top: number) => {
    if (!rootElement || !avatarElement) return

    const maximumLeft = Math.max(0, rootElement.clientWidth - avatarElement.offsetWidth)
    const maximumTop = Math.max(0, rootElement.clientHeight - avatarElement.offsetHeight)

    setPosition({
      x: Math.max(0, Math.min(left, maximumLeft)),
      y: Math.max(0, Math.min(top, maximumTop)),
      initialized: true,
    })
  }

  onMount(() => {
    if (!rootElement || !avatarElement) return

    const root = rootElement
    const avatar = avatarElement

    const clampPosition = () => {
      const rootBounds = root.getBoundingClientRect()
      const avatarBounds = avatar.getBoundingClientRect()

      setClampedPosition(
        position.initialized ? position.x : avatarBounds.left - rootBounds.left,
        position.initialized ? position.y : avatarBounds.top - rootBounds.top,
      )
    }

    const observer = new ResizeObserver(clampPosition)

    observer.observe(root)
    clampPosition()
    onCleanup(() => observer.disconnect())
  })

  const startDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (event.button !== 0 || !event.isPrimary || dragStart || !rootElement || !avatarElement) return

    event.preventDefault()
    const rootBounds = rootElement.getBoundingClientRect()
    const avatarBounds = avatarElement.getBoundingClientRect()

    dragStart = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: avatarBounds.left - rootBounds.left,
      top: avatarBounds.top - rootBounds.top,
    }
    setClampedPosition(dragStart.left, dragStart.top)
    setPosition("dragging", true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent) => {
    if (dragStart?.pointerId !== event.pointerId) return

    event.preventDefault()
    setClampedPosition(
      dragStart.left + event.clientX - dragStart.pointerX,
      dragStart.top + event.clientY - dragStart.pointerY,
    )
  }

  const finishDrag = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (dragStart?.pointerId !== event.pointerId) return

    dragStart = undefined
    setPosition("dragging", false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const moveWithKeyboard = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const step = event.shiftKey ? 64 : 16
    const delta = { x: 0, y: 0 }

    switch (event.key) {
      case "ArrowLeft":
        delta.x = -step
        break
      case "ArrowRight":
        delta.x = step
        break
      case "ArrowUp":
        delta.y = -step
        break
      case "ArrowDown":
        delta.y = step
        break
      default:
        return
    }

    if (!rootElement || !avatarElement) return

    event.preventDefault()
    const rootBounds = rootElement.getBoundingClientRect()
    const avatarBounds = avatarElement.getBoundingClientRect()
    setClampedPosition(
      (position.initialized ? position.x : avatarBounds.left - rootBounds.left) + delta.x,
      (position.initialized ? position.y : avatarBounds.top - rootBounds.top) + delta.y,
    )
  }

  const forwardWheel = (event: WheelEvent & { currentTarget: HTMLElement }) => {
    const viewport = event.currentTarget
      .closest(".comms-timeline")
      ?.querySelector<HTMLElement>('[data-slot="session-timeline-scroll"] .scroll-view__viewport')

    if (!viewport) return

    event.preventDefault()
    viewport.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
      }),
    )

    const multiplier =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 40
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewport.clientHeight
          : 1

    viewport.scrollBy({ left: event.deltaX * multiplier, top: event.deltaY * multiplier })
  }

  return (
    <section
      ref={(element) => {
        rootElement = element
      }}
      class="comms-portrait"
      aria-label={language.t("session.comms.header")}
      onWheel={forwardWheel}
    >
      <div
        ref={(element) => (avatarElement = element)}
        class="comms-portrait__avatar"
        style={{
          left: position.initialized ? `${position.x}px` : undefined,
          top: position.initialized ? `${position.y}px` : undefined,
          transform: position.initialized ? "none" : undefined,
        }}
      >
        <div class="comms-portrait__image" role="img" aria-label={contextLabel()}>
          {props.portrait}
          <svg class="comms-portrait__context-ring" viewBox="0 0 180 200" aria-hidden="true">
            <circle class="comms-portrait__context-track" cx="90" cy="100" r={ringRadius} />
            <Show when={props.contextUsage()}>
              {(usage) => (
                <circle
                  class="comms-portrait__context-progress"
                  cx="90"
                  cy="100"
                  r={ringRadius}
                  stroke-dasharray={`${circumference}`}
                  stroke-dashoffset={`${circumference * (1 - Math.min(100, Math.max(0, usage().percentage)) / 100)}`}
                />
              )}
            </Show>
          </svg>
        </div>
        <button
          type="button"
          class="comms-portrait__drag"
          aria-label={language.t("session.comms.avatar.move")}
          onPointerDown={startDrag}
          on:pointermove={moveDrag}
          on:pointerup={finishDrag}
          on:pointercancel={finishDrag}
          on:lostpointercapture={finishDrag}
          onKeyDown={moveWithKeyboard}
          data-dragging={position.dragging ? "" : undefined}
        />
      </div>
    </section>
  )
}
