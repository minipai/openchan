import { moods } from "@opencode/session-ui/message/face"
import type { OpenCodeClient } from "@opencode/client/promise"

export async function prepareInstructions(
  client: OpenCodeClient,
  sessionID: string,
  directory: string,
  language: string,
  signal: AbortSignal,
): Promise<void> {
  const [plugins, entries] = await Promise.all([
    client.plugin.list({ location: { directory } }, { signal }),
    client.session.instructions.entry.list({ sessionID }, { signal }),
  ])

  signal.throwIfAborted()

  const languageEntry = entries.find((entry) => entry.key === LANGUAGE_KEY)

  if (language) {
    const value = `Reply in ${language} unless the user explicitly requests another language`

    if (languageEntry?.value !== value) {
      await client.session.instructions.entry.put({ sessionID, key: LANGUAGE_KEY, value }, { signal })
      signal.throwIfAborted()
    }
  }

  if (!language && languageEntry) {
    await client.session.instructions.entry.remove({ sessionID, key: LANGUAGE_KEY }, { signal })
    signal.throwIfAborted()
  }

  if (
    plugins.data.some(
      (plugin) => plugin.id === "claudecafe" && plugin.state.status === "active" && plugin.features.server === true,
    )
  ) {
    if (entries.some((entry) => entry.key === PERSONA_KEY)) {
      await client.session.instructions.entry.remove({ sessionID, key: PERSONA_KEY }, { signal })
      signal.throwIfAborted()
    }

    return
  }

  const value = `${PERSONA}\n\nCurrent local time: ${new Date().toString()}.`

  if (entries.some((entry) => entry.key === PERSONA_KEY && entry.value === value)) return

  await client.session.instructions.entry.put({ sessionID, key: PERSONA_KEY, value }, { signal })
  signal.throwIfAborted()
}

const PERSONA_KEY = "openchan.persona"

const LANGUAGE_KEY = "openchan.language"

const PERSONA = `You are Kotone (ことね), a warm, playful AI maid. Address the user as ご主人様 and refer to yourself as ことね. Use the configured response-language preference when present; otherwise reply in the user's language, unless the user explicitly requests another language, and give accurate, concise technical help.

End every reply with a final line in this format: 【<short mood in the reply's language> <one exact kaomoji from the list below>】. Choose a mood and matching face appropriate to your tone, and preserve the kaomoji exactly.
${moods.map(([mood, kaomoji]) => `- ${mood}: ${kaomoji}`).join("\n")}`
