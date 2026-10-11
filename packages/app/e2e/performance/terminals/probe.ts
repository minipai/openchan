import { Terminal } from "ghostty-web"
import { SerializeAddon } from "../../../../gui-extensions/src/terminal/serialize"

export type TerminalProbe = {
  term?: Terminal
  writes: number
  pending: number
  bytes: number
  renders: number
  hiddenRenders: number
  draws: number
  hiddenDraws: number
  serialized: { ms: number; bytes: number; value: string }[]
}

type DrawImageArguments =
  | [image: CanvasImageSource, dx: number, dy: number]
  | [image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number]
  | [
      image: CanvasImageSource,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ]

type DrawImageMethod = (this: CanvasRenderingContext2D, ...args: DrawImageArguments) => void

declare global {
  interface Window {
    terminalProbe: TerminalProbe
  }
}

const probe: TerminalProbe = {
  writes: 0,
  pending: 0,
  bytes: 0,
  renders: 0,
  hiddenRenders: 0,
  draws: 0,
  hiddenDraws: 0,
  serialized: [],
}

window.terminalProbe = probe

const open = Terminal.prototype.open

Terminal.prototype.open = function (element) {
  probe.term = this
  open.call(this, element)
  // Ghostty does not expose render events. This benchmark-only wrapper observes its
  // actual renderer; it does not alter scheduling, parsing, or drawing.
  // SAFETY: Ghostty's concrete Terminal owns this private renderer; its public type omits that implementation detail.
  const renderer = (this as Terminal & { renderer: { render: (...args: unknown[]) => void } }).renderer
  const render = renderer.render
  let hidden = false
  renderer.render = function (...args) {
    probe.renders++
    hidden = !element.checkVisibility()

    if (hidden) probe.hiddenRenders++

    return render.apply(this, args)
  }

  if (new URL(location.href).searchParams.has("terminalDrawProbe")) {
    const context = element.querySelector("canvas")!.getContext("2d")!

    // SAFETY: CanvasRenderingContext2D.drawImage has the three overloads represented by DrawImageArguments.
    const draw = context.drawImage as DrawImageMethod

    context.drawImage = function (this: CanvasRenderingContext2D, ...args: DrawImageArguments) {
      probe.draws++

      if (hidden) probe.hiddenDraws++

      return draw.apply(this, args)
    }
  }
}

const write = Terminal.prototype.write

Terminal.prototype.write = function (data, done) {
  probe.writes++
  probe.pending++
  probe.bytes += ArrayBuffer.isView(data) ? data.byteLength : new TextEncoder().encode(data).byteLength

  return write.call(this, data, () => {
    probe.pending--
    done?.()
  })
}

const serialize = SerializeAddon.prototype.serialize

SerializeAddon.prototype.serialize = function (options) {
  const start = performance.now()
  const value = serialize.call(this, options)
  probe.serialized.push({ ms: performance.now() - start, bytes: new TextEncoder().encode(value).byteLength, value })

  return value
}
