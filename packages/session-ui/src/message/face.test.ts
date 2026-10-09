import { expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import { latestSessionFace } from "./face"

test("uses trailing mood markers and completed expression tools in history order", () => {
  const messages: SessionMessageInfo[] = [
    assistant("msg_1", [text("Ready 【＼(ˆ ᗜ ˆ)／】")]),
    assistant("msg_2", [tool("character.set_expression", { expression: "focused" })]),
    assistant("msg_3", [text("Done 【(｡•́︿•̀｡)】")]),
  ]

  expect(latestSessionFace(messages)).toBe("sad")
  expect(latestSessionFace(messages.slice(0, 2))).toBe("focused")
})

test("ignores running tools, unrelated tools, code examples, incomplete markers, and reverted messages", () => {
  const ready = assistant("msg_1", [text("Ready 【＼(ˆ ᗜ ˆ)／】")])

  expect(
    latestSessionFace(
      [
        ready,
        assistant("msg_2", [tool("set_expression", { face: "sad" }, "running")]),
        assistant("msg_3", [tool("execute", { command: "set_expression('sad')" })]),
        assistant("msg_4", [text("Example: `【(｡•́︿•̀｡)】`")]),
        assistant("msg_5", [text("Still typing: 【(｡•́︿•̀｡)")]),
        assistant("msg_6", [text("Reverted 【(｡•́︿•̀｡)】")]),
      ],
      "msg_6",
    ),
  ).toBe("happy")
})

function assistant(id: string, content: SessionMessageAssistant["content"]): SessionMessageAssistant {
  return {
    id,
    type: "assistant",
    time: { created: 0, completed: 1 },
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
  }
}

function text(value: string): SessionMessageAssistant["content"][number] {
  return { type: "text", text: value }
}

function tool(
  name: string,
  input: Record<string, string>,
  status: "completed" | "running" = "completed",
): SessionMessageAssistantTool {
  const state: SessionMessageAssistantTool["state"] =
    status === "completed"
      ? { status, input, content: [{ type: "text" as const, text: "ok" }] }
      : { status, input, metadata: {} }

  return {
    type: "tool",
    id: `call_${name}`,
    name,
    state,
    time: { created: 0 },
  }
}
