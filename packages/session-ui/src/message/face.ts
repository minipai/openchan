import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import { indexAssistantMessagesByParent } from "../timeline/assistant-messages"

export const moods = [
  ["neutral", "( • ᴗ • )"],
  ["happy", "＼(ˆ ᗜ ˆ)／"],
  ["curious", "(づ •. •)?"],
  ["thinking", "( ╭ರ_•́ )"],
  ["focused", "(๑•̀ ᴗ•́)૭✧"],
  ["confused", "( ⊙.⊙ )?"],
  ["proud", "ᕙ( •̀ ᗜ •́)ᕗ"],
  ["smug", "( ｀▽´ )"],
  ["excited", "٩(ˊᗜˋ*)و"],
  ["flirty", "( ˘ ³˘)♡"],
  ["smitten", "(,,ᴗ ᴗ,,)♡"],
  ["wink", "☆ ( ＞◡❛)"],
  ["embarrassed", "( ˶>﹏<˶ᵕ)"],
  ["pouty", "( •̀ ε •́ )"],
  ["worried", "(´･ω･｀)"],
  ["annoyed", "(￢_￢)"],
  ["sad", "(｡•́︿•̀｡)"],
  ["surprised", "Σ( °口° )"],
  ["angry", "( ＃•̀_•́ )"],
  ["afraid", "( ;ﾟдﾟ )"],
  ["skeptical", "(￢‸￢)…"],
  ["frustrated", "(,,>﹏<,,)"],
  ["awkward", "( ^_^; )"],
  ["sorry", "m( _ _ )m"],
  ["speechless", "(・_・;)"],
  ["relieved", "( ˘ᗜ˘ )⁼³"],
  ["laughing", "ꉂ(ˊᗜˋ*)"],
  ["crying", "(╥﹏╥)"],
  ["oops", "(ﾉ≧ڡ≦)"],
  ["pleading", "(｡•́人•̀｡)"],
  ["facepalm", "(－‸ლ)"],
  ["waving", "( ･ω･)ﾉ"],
] as const

type Face = (typeof moods)[number][0]

export function latestSessionFace(messages: readonly SessionMessageInfo[], revertMessageID?: string): Face {
  return messages.reduce<Face>((face, message) => {
    if (message.type !== "assistant" || (revertMessageID && message.id >= revertMessageID)) return face

    return message.content.reduce<Face>((current, part) => {
      if (part.type === "text") return messageFace(part.text) ?? current

      if (part.type === "tool") return expressionFace(part) ?? current

      return current
    }, face)
  }, "neutral")
}

export function latestExchangeFace(
  messages: readonly SessionMessageInfo[],
  userMessageID: string,
  revertMessageID?: string,
): Face {
  return latestSessionFace(indexAssistantMessagesByParent(messages).get(userMessageID) ?? [], revertMessageID)
}

export function messageFace(text: string): Face | undefined {
  const marker = /【[^【】]*】\s*$/.exec(text)

  if (!marker || isInsideCode(text, marker.index)) return

  const worn = withoutWhitespace(marker[0])

  return moods.find(([, kaomoji]) => worn.includes(withoutWhitespace(kaomoji)))?.[0]
}

function expressionFace(tool: SessionMessageAssistantTool): Face | undefined {
  if (!isExpressionTool(tool.name) || tool.state.status !== "completed") return

  return [tool.state.input.face, tool.state.input.expression, tool.state.input.mood].find(isFace)
}

function isExpressionTool(name: string) {
  const normalized = name.toLowerCase()

  return (
    normalized === "set_expression" || normalized.endsWith(".set_expression") || normalized.endsWith("_set_expression")
  )
}

function isFace(value: unknown): value is Face {
  return moods.some(([face]) => face === value)
}

function isInsideCode(text: string, markerIndex: number) {
  const currentLineStart = text.lastIndexOf("\n", markerIndex - 1) + 1
  const currentLinePrefix = text.slice(currentLineStart, markerIndex)

  if (/^(?: {4,}|\t)/.test(currentLinePrefix)) return true

  let fence: { character: string; length: number } | undefined
  const visiblePrefix: string[] = []
  let lineStart = 0

  while (lineStart <= markerIndex) {
    const newline = text.indexOf("\n", lineStart)
    const lineEnd = newline === -1 ? text.length : newline
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, "")
    const prefixEnd = Math.min(markerIndex, lineEnd)

    if (fence) {
      if (isClosingFence(line, fence)) fence = undefined
      visiblePrefix.push("")
    } else {
      const openingFence = fenceForLine(line)

      if (openingFence) {
        fence = openingFence
        visiblePrefix.push("")
      } else {
        visiblePrefix.push(text.slice(lineStart, prefixEnd))
      }
    }

    if (markerIndex <= lineEnd) break
    lineStart = lineEnd + 1
  }

  return fence !== undefined || hasOpenInlineCode(visiblePrefix.join("\n"))
}

function fenceForLine(line: string) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)

  if (!match || (match[2][0] === "`" && match[3].includes("`"))) return undefined

  return { character: match[2][0], length: match[2].length }
}

function isClosingFence(line: string, fence: { character: string; length: number }) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)

  return (
    match !== null && match[2][0] === fence.character && match[2].length >= fence.length && /^[\t ]*$/.test(match[3])
  )
}

function hasOpenInlineCode(text: string) {
  let delimiter = 0

  for (let index = 0; index < text.length; ) {
    if (text[index] !== "`" || isEscaped(text, index)) {
      index++
      continue
    }

    let end = index + 1

    while (text[end] === "`") end++

    const length = end - index

    if (delimiter === 0) {
      delimiter = length
    } else if (delimiter === length) {
      delimiter = 0
    }

    index = end
  }

  return delimiter !== 0
}

function isEscaped(text: string, index: number) {
  let slashes = 0

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashes++

  return slashes % 2 === 1
}

function withoutWhitespace(text: string) {
  return text.replace(/\s+/g, "")
}
