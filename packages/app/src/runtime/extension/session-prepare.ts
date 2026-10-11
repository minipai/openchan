import type { OpenCodeClient } from "@opencode/client/promise"
import { SessionPrepare } from "@opencode/gui-extensions/sdk"
import type { useExtensionHost } from "./host"

/** Awaits each live session-preparation contribution in registration order before the composer sends. */
export async function prepareSession(input: {
  host: ReturnType<typeof useExtensionHost>
  client: OpenCodeClient
  sessionID: string
  directory: string
}): Promise<void> {
  for (const item of input.host.items(SessionPrepare)) {
    item.signal.throwIfAborted()
    await item.value.prepare({
      client: input.client,
      sessionID: input.sessionID,
      directory: input.directory,
      signal: item.signal,
    })
    item.signal.throwIfAborted()
  }
}
