import { describe, expect, setSystemTime, test } from "bun:test"
import { OpenCode } from "@opencode/client/promise"
import { prepareInstructions } from "./instructions"

const entryPath = "/api/experimental/session/session-1/instructions/entries"

function setup(options: {
  plugins: {
    id: string
    source: { type: "builtin" }
    features: { server?: true }
    state: { status: "active" } | { status: "failed"; error: string }
  }[]
  entries?: { key: string; value: unknown }[]
  failEntryLookup?: boolean
  abortAfterMutation?: AbortController
}) {
  let entries = [...(options.entries ?? [])]
  const requests: { method: string; path: string; body?: unknown }[] = []
  const requestSignals: AbortSignal[] = []

  const fetch = Object.assign(
    async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      const request = requestInput instanceof Request ? requestInput : new Request(requestInput, init)
      const url = new URL(request.url)
      const body = request.method === "PUT" ? await request.json() : undefined

      requests.push({ method: request.method, path: url.pathname, body })
      requestSignals.push(request.signal)

      if (url.pathname === "/api/plugin")
        return Response.json({ location: { directory: "/repo" }, data: options.plugins })

      if (url.pathname === entryPath && request.method === "GET") {
        if (options.failEntryLookup) return Response.json({ error: "lookup failed" }, { status: 503 })

        return Response.json({ data: entries })
      }

      if (url.pathname.startsWith(`${entryPath}/`)) {
        const key = decodeURIComponent(url.pathname.slice(entryPath.length + 1))

        if (request.method === "PUT") {
          const value = body?.value
          entries = [...entries.filter((entry) => entry.key !== key), { key, value }]
          options.abortAfterMutation?.abort()

          return new Response(null, { status: 204 })
        }

        if (request.method === "DELETE") {
          entries = entries.filter((entry) => entry.key !== key)
          options.abortAfterMutation?.abort()

          return new Response(null, { status: 204 })
        }
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`)
    },
    { preconnect() {} },
  )

  return {
    api: OpenCode.make({ baseUrl: "http://opencode.test", fetch }),
    requests,
    requestSignals,
    entries: () => entries,
  }
}

const claudeCafe = {
  id: "claudecafe",
  source: { type: "builtin" as const },
  features: { server: true as const },
  state: { status: "active" as const },
}

describe("session instructions", () => {
  test("syncs the response language with the server persona plugin active and removes only its own entries", async () => {
    const signal = new AbortController().signal

    const server = setup({
      plugins: [claudeCafe],
      entries: [
        { key: "openchan.persona", value: "old persona" },
        { key: "user.notes", value: "keep this" },
      ],
    })

    await prepareInstructions(server.api, "session-1", "/repo", "Japanese", signal)

    expect(server.requests.filter((request) => request.method === "PUT" || request.method === "DELETE")).toEqual([
      {
        method: "PUT",
        path: `${entryPath}/openchan.language`,
        body: { value: "Reply in Japanese unless the user explicitly requests another language" },
      },
      {
        method: "DELETE",
        path: `${entryPath}/openchan.persona`,
        body: undefined,
      },
    ])
    expect(server.entries()).toEqual([
      { key: "user.notes", value: "keep this" },
      { key: "openchan.language", value: "Reply in Japanese unless the user explicitly requests another language" },
    ])

    server.requests.length = 0
    await prepareInstructions(server.api, "session-1", "/repo", "Japanese", signal)

    expect(server.requests.some((request) => request.method === "PUT" || request.method === "DELETE")).toBe(false)

    server.requests.length = 0
    await prepareInstructions(server.api, "session-1", "/repo", "French", signal)

    expect(server.requests.filter((request) => request.method === "PUT" || request.method === "DELETE")).toEqual([
      {
        method: "PUT",
        path: `${entryPath}/openchan.language`,
        body: { value: "Reply in French unless the user explicitly requests another language" },
      },
    ])
    expect(server.entries()).toEqual([
      { key: "user.notes", value: "keep this" },
      { key: "openchan.language", value: "Reply in French unless the user explicitly requests another language" },
    ])

    server.requests.length = 0
    await prepareInstructions(server.api, "session-1", "/repo", "", signal)

    expect(server.requests.filter((request) => request.method === "PUT" || request.method === "DELETE")).toEqual([
      {
        method: "DELETE",
        path: `${entryPath}/openchan.language`,
        body: undefined,
      },
    ])
    expect(server.entries()).toEqual([{ key: "user.notes", value: "keep this" }])
  })

  test("installs the persona when absent and does not rewrite an identical entry", async () => {
    const initialTime = new Date("2026-10-12T09:00:00.000Z")
    const laterTime = new Date("2026-10-12T09:01:00.000Z")

    setSystemTime(initialTime)

    try {
      const server = setup({ plugins: [] })
      const signal = new AbortController().signal

      await prepareInstructions(server.api, "session-1", "/repo", "", signal)

      const firstPut = server.requests.find((request) => request.method === "PUT")

      expect(firstPut?.path).toBe(`${entryPath}/openchan.persona`)
      const firstBody = JSON.stringify(firstPut?.body)
      expect(firstBody).toContain("You are Kotone (ことね)")
      expect(firstBody).toContain(`Current local time: ${initialTime.toString()}.`)
      expect(server.entries()).toHaveLength(1)

      server.requests.length = 0
      await prepareInstructions(server.api, "session-1", "/repo", "", signal)

      expect(server.requests.some((request) => request.method === "PUT" || request.method === "DELETE")).toBe(false)

      setSystemTime(laterTime)
      server.requests.length = 0
      await prepareInstructions(server.api, "session-1", "/repo", "", signal)

      const refreshedPut = server.requests.find((request) => request.method === "PUT")

      expect(refreshedPut?.path).toBe(`${entryPath}/openchan.persona`)
      const refreshedBody = JSON.stringify(refreshedPut?.body)
      expect(refreshedBody).toContain(`Current local time: ${laterTime.toString()}.`)
      expect(refreshedBody).not.toContain(`Current local time: ${initialTime.toString()}.`)
    } finally {
      setSystemTime()
    }
  })

  test("does not mutate entries when lookup fails", async () => {
    const signal = new AbortController().signal

    const server = setup({
      plugins: [claudeCafe],
      entries: [{ key: "openchan.persona", value: "keep until lookup succeeds" }],
      failEntryLookup: true,
    })

    const entries = server.entries()

    await expect(prepareInstructions(server.api, "session-1", "/repo", "Japanese", signal)).rejects.toThrow()

    expect(server.requests.some((request) => request.method === "PUT" || request.method === "DELETE")).toBe(false)
    expect(server.entries()).toEqual(entries)
  })

  test("stops syncing after an in-flight instruction write is aborted", async () => {
    const controller = new AbortController()

    const server = setup({
      plugins: [claudeCafe],
      entries: [{ key: "openchan.persona", value: "old persona" }],
      abortAfterMutation: controller,
    })

    await expect(prepareInstructions(server.api, "session-1", "/repo", "Japanese", controller.signal)).rejects.toThrow()

    expect(server.requests.filter((request) => request.method === "PUT" || request.method === "DELETE")).toEqual([
      {
        method: "PUT",
        path: `${entryPath}/openchan.language`,
        body: { value: "Reply in Japanese unless the user explicitly requests another language" },
      },
    ])
    expect(server.entries()).toEqual([
      { key: "openchan.persona", value: "old persona" },
      { key: "openchan.language", value: "Reply in Japanese unless the user explicitly requests another language" },
    ])
    expect(server.requestSignals.at(-1)?.aborted).toBe(true)
  })
})
