import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"

/** Groups assistant messages by the user-message boundary used by the timeline projection. */
export function indexAssistantMessagesByParent(messages: readonly SessionMessageInfo[]) {
  const result = new Map<string, SessionMessageAssistant[]>()
  let userID: string | undefined

  messages.forEach((message) => {
    if (message.type === "user") userID = message.id

    if (message.type === "shell") userID = undefined

    if (message.type !== "assistant") return

    if (!userID) userID = message.id
    const existing = result.get(userID)

    if (existing) {
      existing.push(message)

      return
    }

    result.set(userID, [message])
  })

  return result
}
