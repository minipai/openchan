import type { SessionMessageInfo } from "@opencode/client/promise"
import { Predicate } from "effect"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { Timeline, TimelineRow, reuseTimelineRows } from "@opencode/session-ui/timeline/projection"
import type { createTimelineProjection } from "./projection"

type Projection = Pick<
  ReturnType<typeof createTimelineProjection>,
  "activeMessageID" | "assistantMessagesByParent" | "messageByID" | "rows"
>

type AssistantContent = Extract<SessionMessageInfo, { type: "assistant" }>["content"][number]

const summaryKeyPrefix = "flow-summary:"

const groupKeyPrefix = "flow-group:"

export function createFlowTimelineDensity(input: { projection: Projection }) {
  const [expanded, setExpanded] = createStore<Record<string, boolean | undefined>>({})

  const sourceRows = createMemo(
    () => new Map(input.projection.rows().map((row) => [TimelineRow.key(row), row] as const)),
  )

  const latestMessageID = createMemo(() => {
    const active = input.projection.activeMessageID()
    const rows = input.projection.rows()

    const activeRow =
      active && rows.findLast((row) => row.userMessageID === active && messageIDForRow(row, input.projection))

    const latestRow = activeRow ?? rows.findLast((row) => messageIDForRow(row, input.projection))

    return latestRow ? messageIDForRow(latestRow, input.projection) : undefined
  })

  const isLatest = (row: TimelineRow.TimelineRow) => messageIDForRow(row, input.projection) === latestMessageID()
  const canCollapse = (row: TimelineRow.TimelineRow) => isSummarizableRow(row, input.projection)
  const isExpanded = (row: TimelineRow.TimelineRow) => expanded[TimelineRow.key(row)] ?? isLatest(row)

  const collapsedRows = createMemo((previous: TimelineRow.TimelineRow[] | undefined) =>
    reuseTimelineRows(
      previous,
      input.projection.rows().flatMap((row) => {
        if (Predicate.isTagged(row, "TurnGap")) return []

        if (!canCollapse(row) || isExpanded(row)) return [row]

        return [summaryRow(row)]
      }),
    ),
  )

  const density = createMemo(
    (
      previous:
        | {
            rows: TimelineRow.TimelineRow[]
            members: Map<string, TimelineRow.TimelineRow[]>
          }
        | undefined,
    ) => {
      const groups = groupAssistantRows(collapsedRows(), input.projection, sourceRows(), previous?.members)

      return {
        rows: reuseDensityRows(previous?.rows, groups.rows),
        members: groups.members,
      }
    },
  )

  const rows = () => density().rows
  const rowByKey = createMemo(() => new Map(rows().map((row) => [TimelineRow.key(row), row] as const)))

  const rowIndexes = createMemo(() => {
    const first = new Map<string, number>()
    const last = new Map<string, number>()

    rows().forEach((row, index) => {
      if (!first.has(row.userMessageID)) first.set(row.userMessageID, index)
      last.set(row.userMessageID, index)
    })

    return { first, last }
  })

  const sourceRowForSummary = (row: TimelineRow.TimelineRow) => {
    const key = summarySourceKey(row)

    return key ? sourceRows().get(key) : undefined
  }

  const projection = {
    activeMessageID: input.projection.activeMessageID,
    messageByID: input.projection.messageByID,
    messageLastRowIndex: () => rowIndexes().last,
    messageRowIndex: () => rowIndexes().first,
    rowByKey,
    rows,
  }

  return {
    projection,
    canCollapse,
    members: (row: TimelineRow.TimelineRow) => density().members.get(TimelineRow.key(row)),
    role: (row: TimelineRow.TimelineRow) => flowMessageRole(row, input.projection, sourceRows()),
    isExpanded,
    expand: (row: TimelineRow.TimelineRow) => setExpanded(TimelineRow.key(row), true),
    collapse: (row: TimelineRow.TimelineRow) => setExpanded(TimelineRow.key(row), false),
    summarySource: sourceRowForSummary,
    summaryMessageID: (row: TimelineRow.TimelineRow) => {
      const source = sourceRowForSummary(row)

      return source && messageIDForRow(source, input.projection)
    },
    summaryContent: (row: TimelineRow.TimelineRow): AssistantContent[] => {
      const source = sourceRowForSummary(row)

      if (!source || !Predicate.isTagged(source, "AssistantPart") || source.group.type !== "part") return []

      const content = Timeline.resolveContent(
        input.projection.messageByID().get(source.group.ref.messageID),
        source.group.ref.partID,
      )

      return content?.type === "text" ? [content] : []
    },
    prepareRevealMessage: (id: string, partID?: string) => {
      input.projection.rows().forEach((row) => {
        const matches = partID ? rowHasPart(row, partID) : messageIDForRow(row, input.projection) === id

        if (matches && isSummarizableRow(row, input.projection)) setExpanded(TimelineRow.key(row), true)
      })
    },
  }
}

function groupAssistantRows(
  rows: TimelineRow.TimelineRow[],
  projection: Projection,
  sourceRows: Map<string, TimelineRow.TimelineRow>,
  previousMembers?: Map<string, TimelineRow.TimelineRow[]>,
) {
  const projected: TimelineRow.TimelineRow[] = []
  const membersByKey = new Map<string, TimelineRow.TimelineRow[]>()
  let group: TimelineRow.TimelineRow[] = []

  const flush = () => {
    if (group.length === 0) return

    const precedingRow = projected.at(-1)
    const trailing = group.map((row) => assistantParagraph(row, projection, sourceRows).type)

    if (
      precedingRow &&
      precedingRow.userMessageID === group[0]!.userMessageID &&
      trailing.includes("tool") &&
      !trailing.includes("text")
    ) {
      const key = TimelineRow.key(precedingRow)
      const preceding = membersByKey.get(key) ?? [precedingRow]

      if (preceding.some((row) => assistantParagraph(row, projection, sourceRows).type === "text")) {
        projected.pop()
        membersByKey.delete(key)
        group = [...preceding, ...group]
      }
    }

    if (group.length === 1) {
      projected.push(group[0]!)
      group = []

      return
    }

    const candidate = densityGroup(group)
    const key = TimelineRow.key(candidate)
    const previous = previousMembers?.get(key)

    const members =
      previous?.length === group.length && previous.every((row, index) => row === group[index]) ? previous : group

    const row = members === group ? candidate : densityGroup(members)

    membersByKey.set(key, members)
    projected.push(row)
    group = []
  }

  rows.forEach((row) => {
    if (!isAssistantFlowRow(row, projection, sourceRows)) {
      flush()
      projected.push(row)

      return
    }

    const previous = group.at(-1)

    if (
      previous &&
      (previous.userMessageID !== row.userMessageID || startsAssistantGroup(previous, row, projection, sourceRows))
    )
      flush()

    group.push(row)
  })
  flush()

  return { rows: projected, members: membersByKey }
}

function reuseDensityRows(previous: TimelineRow.TimelineRow[] | undefined, rows: TimelineRow.TimelineRow[]) {
  if (!previous?.length) return rows
  const byKey = new Map(previous.map((row) => [TimelineRow.key(row), row] as const))

  const next = rows.map((row) => {
    const existing = byKey.get(TimelineRow.key(row))

    return existing && TimelineRow.equals(existing, row) ? existing : row
  })

  return previous.length === next.length && previous.every((row, index) => row === next[index]) ? previous : next
}

function isAssistantFlowRow(
  row: TimelineRow.TimelineRow,
  projection: Projection,
  sourceRows: Map<string, TimelineRow.TimelineRow>,
): boolean {
  const sourceKey = summarySourceKey(row)

  if (sourceKey) {
    const source = sourceRows.get(sourceKey)

    if (source) return isAssistantFlowRow(source, projection, sourceRows)
  }

  if (Predicate.isTagged(row, "Thinking") || Predicate.isTagged(row, "Retry") || Predicate.isTagged(row, "Error"))
    return true

  if (!Predicate.isTagged(row, "AssistantPart")) return false
  const refs = row.group.type === "part" ? [row.group.ref] : row.group.refs
  const messages = projection.messageByID()

  return refs.some((ref) => messages.get(ref.messageID)?.type === "assistant")
}

function startsAssistantGroup(
  previous: TimelineRow.TimelineRow,
  current: TimelineRow.TimelineRow,
  projection: Projection,
  sourceRows: Map<string, TimelineRow.TimelineRow>,
) {
  const before = assistantParagraph(previous, projection, sourceRows)

  if (before.type !== "text") return false
  const after = assistantParagraph(current, projection, sourceRows)

  return (
    after.type === "tool" ||
    after.type === "reasoning" ||
    (after.type === "text" && before.messageID !== after.messageID)
  )
}

function assistantParagraph(
  row: TimelineRow.TimelineRow,
  projection: Projection,
  sourceRows: Map<string, TimelineRow.TimelineRow>,
): { type: "text"; messageID: string } | { type: "tool" | "reasoning" | "other" } {
  const sourceKey = summarySourceKey(row)
  const source = sourceKey ? (sourceRows.get(sourceKey) ?? row) : row

  if (Predicate.isTagged(source, "Thinking")) return { type: "reasoning" }

  if (!Predicate.isTagged(source, "AssistantPart")) return { type: "other" }
  const refs = source.group.type === "part" ? [source.group.ref] : source.group.refs

  const contents = refs.flatMap((ref) => {
    const content = Timeline.resolveContent(projection.messageByID().get(ref.messageID), ref.partID)

    return content ? [{ ref, content }] : []
  })

  if (contents.some((entry) => entry.content.type === "tool")) return { type: "tool" }

  if (contents.some((entry) => entry.content.type === "reasoning")) return { type: "reasoning" }

  if (contents.length !== refs.length || contents.length === 0) return { type: "other" }

  if (contents.every((entry) => entry.content.type === "text"))
    return { type: "text", messageID: contents.at(-1)!.ref.messageID }

  return { type: "other" }
}

function densityGroup(members: TimelineRow.TimelineRow[]) {
  const first = members[0]!

  const refs = members.flatMap((row) => {
    if (Predicate.isTagged(row, "AssistantPart")) return row.group.type === "part" ? [row.group.ref] : row.group.refs

    if (Predicate.isTagged(row, "Thinking")) return [row.ref]

    return []
  })

  const sourceKey = summarySourceKey(first) ?? TimelineRow.key(first)

  return new TimelineRow.AssistantPart({
    userMessageID: first.userMessageID,
    previousAssistantPart: Predicate.isTagged(first, "AssistantPart") ? first.previousAssistantPart : false,
    group: {
      type: "context",
      key: `${groupKeyPrefix}${sourceKey}`,
      refs,
    },
  })
}

function flowMessageRole(
  row: TimelineRow.TimelineRow,
  projection: Projection,
  sourceRows: Map<string, TimelineRow.TimelineRow>,
): "user" | "assistant" | "event" {
  const sourceKey = summarySourceKey(row)

  if (sourceKey) {
    const source = sourceRows.get(sourceKey)

    if (source) return flowMessageRole(source, projection, sourceRows)
  }

  if (Predicate.isTagged(row, "UserMessage")) return "user"

  if (
    Predicate.isTagged(row, "Notice") ||
    Predicate.isTagged(row, "Shell") ||
    Predicate.isTagged(row, "CompactionQueued")
  )
    return "event"

  if (Predicate.isTagged(row, "AssistantPart")) {
    const refs = row.group.type === "part" ? [row.group.ref] : row.group.refs
    const messages = projection.messageByID()

    if (refs.length > 0 && refs.every((ref) => messages.get(ref.messageID)?.type !== "assistant")) return "event"
  }

  return "assistant"
}

export function flowMessageSummary(message: SessionMessageInfo, visibleContent?: AssistantContent[]) {
  switch (message.type) {
    case "user":
      return message.text
    case "assistant":
      return (visibleContent ?? message.content).flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
    case "shell":
      return message.command
    case "system":
    case "synthetic":
      return message.description ?? message.text
    case "skill":
      return message.name || message.text
    case "agent-switched":
      return message.agent
    case "model-switched":
      return `${message.model.providerID}/${message.model.id}`
    case "location-switched":
      return message.location.directory
    case "compaction":
      return message.status === "failed" ? message.error.message : message.summary || message.recent
    case "idle":
      return message.outcome
  }
}

function isSummarizableRow(row: TimelineRow.TimelineRow, projection: Projection) {
  if (Predicate.isTagged(row, "UserMessage") || Predicate.isTagged(row, "Notice") || Predicate.isTagged(row, "Shell"))
    return true

  if (!Predicate.isTagged(row, "AssistantPart") || row.group.type !== "part") return false

  const content = Timeline.resolveContent(projection.messageByID().get(row.group.ref.messageID), row.group.ref.partID)

  return content?.type === "text" && !!content.text.trim()
}

function messageIDForRow(row: TimelineRow.TimelineRow, projection: Projection) {
  if (Predicate.isTagged(row, "UserMessage")) return row.userMessageID

  if (Predicate.isTagged(row, "Shell") || Predicate.isTagged(row, "Notice")) return row.messageID

  if (Predicate.isTagged(row, "AssistantPart"))
    return row.group.type === "part" ? row.group.ref.messageID : row.group.refs.at(-1)?.messageID

  if (Predicate.isTagged(row, "Thinking")) return row.ref.messageID

  if (Predicate.isTagged(row, "Error") || Predicate.isTagged(row, "Retry"))
    return projection.assistantMessagesByParent().get(row.userMessageID)?.at(-1)?.id
}

function rowHasPart(row: TimelineRow.TimelineRow, partID: string) {
  if (Predicate.isTagged(row, "Thinking")) return row.ref.partID === partID

  if (!Predicate.isTagged(row, "AssistantPart")) return false

  const refs = row.group.type === "part" ? [row.group.ref] : row.group.refs

  return refs.some((ref) => ref.partID === partID)
}

function summaryRow(row: TimelineRow.TimelineRow) {
  const refs = Predicate.isTagged(row, "AssistantPart") && row.group.type === "part" ? [row.group.ref] : []

  return new TimelineRow.AssistantPart({
    userMessageID: row.userMessageID,
    previousAssistantPart: false,
    group: {
      type: "context",
      key: `${summaryKeyPrefix}${TimelineRow.key(row)}`,
      refs,
    },
  })
}

function summarySourceKey(row: TimelineRow.TimelineRow) {
  if (!Predicate.isTagged(row, "AssistantPart") || row.group.type !== "context") return

  if (!row.group.key.startsWith(summaryKeyPrefix)) return

  return row.group.key.slice(summaryKeyPrefix.length)
}
