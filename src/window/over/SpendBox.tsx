import type { Spend } from '../../between/protocol'
import { spendingKeys } from '../keys'
import { cut, EdgeKeys, packed } from './edge'
import type { Palette } from '../theme'

/**
 * What the panel is answering about, said on the panel rather than left to be
 * assumed.
 *
 * It is the whole difference between this and the thing everybody expects a
 * usage panel to be. This is not how much of an allowance is left or when it
 * comes back — nothing under the window knows that — it is what has actually
 * been spent.
 *
 * "Her turns" because they are hers: what the agent spent carrying a sentence
 * from this window, and not everything that has been spent on the folder. The
 * agent's own errands — naming a conversation, folding an old one up — are not
 * on it, and neither is a helper she sent off to read something, so it is what
 * she cost rather than a bill.
 *
 * "Here" is her session, which is one girl in one folder: it is not let go of
 * when a conversation is left or an earlier one picked up, and not when the
 * server behind her drops and she is opened again — but sending for one of the
 * others or moving her somewhere else closes it, and the next girl starts from
 * nothing because nothing of this was hers. Said out loud in as few words as it
 * takes, because a number with no scope beside it is read as whichever scope
 * the reader came in wanting.
 */
const SINCE = 'her turns, since she started here'

/** Before anything has been counted: she has not answered yet, or whatever is
 * behind her has said nothing about it. Not an error and not drawn as one. */
const NOTHING_YET = 'nothing counted yet'

/** Turns counted, and not one number about them. An agent that keeps no counts
 * at all is a perfectly ordinary agent, and this is what it comes to. */
const UNCOUNTED = 'nothing about them is counted'

/** A count with its thousands marked off, which is the difference between a
 * number read and a number counted on screen. */
const grouped = (many: number) => `${many}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** The smallest amount there is any point writing out, and what is said instead
 * of writing one smaller: past here the places stop being money and start being
 * a way of printing nought that takes six characters to do it. */
const TOO_SMALL = 'under $0.000001'

/**
 * Money, in as many places as it takes to be a number.
 *
 * Two, the way money is written — but a cheap model's turn costs a thousandth
 * of a dollar and a cached one costs a millionth, and "$0.00" over one of those
 * is the panel saying it cost nothing. So the places go on until the number
 * shows, and stop the moment it does. Smaller than the last of them is said in
 * words: a row of noughts is the one thing this must not print over money that
 * was spent.
 *
 * Nought itself is the exception and is written the way money is written: it is
 * a number somebody counted, not a small one nobody could see.
 */
const money = (cost: number) => {
  if (cost === 0) return '$0.00'
  const places = [2, 4, 6].find((many) => Number(cost.toFixed(many)) !== 0)
  return places === undefined ? TOO_SMALL : `$${cost.toFixed(places)}`
}

/** The piles joined the way the counts under the other panel are. */
const beside = (piles: (string | null)[]) => piles.filter(Boolean).join(' · ')

/**
 * What the panel has to say, line by line — exported so a test can ask what it
 * would say without a terminal to draw it in.
 *
 * A count nobody kept is left out rather than drawn as a nought or a dash: a
 * row of placeholders reads as a panel that is broken, and a nought reads as a
 * number somebody took. Which means the panel is as many lines as there is
 * something to say and no more, and every line on it is true.
 */
export function spentSoFar(spend: Spend | null): string[] {
  // No turn of hers has finished yet, so there is nothing counted — which is a
  // different thing from an agent that counts nothing, and reads the same on a
  // panel that has yet to have a number on it.
  if (!spend || spend.turns === 0) return [NOTHING_YET]

  const counted = beside([
    spend.turns === undefined ? null : `${spend.turns} ${spend.turns === 1 ? 'turn' : 'turns'}`,
    spend.cost === undefined ? null : money(spend.cost),
  ])
  const words = beside([
    spend.input === undefined ? null : `${grouped(spend.input)} in`,
    spend.output === undefined ? null : `${grouped(spend.output)} out`,
    spend.reasoning === undefined ? null : `${grouped(spend.reasoning)} thinking`,
  ])
  const cache = beside([
    spend.cacheRead === undefined ? null : `${grouped(spend.cacheRead)} read`,
    spend.cacheWrite === undefined ? null : `${grouped(spend.cacheWrite)} written`,
  ])

  const lines = [counted, words, cache && `cache ${cache}`].filter(Boolean)
  if (lines.length === 0) return [NOTHING_YET]
  // Turns and nothing else. Said in words rather than left as a panel with one
  // line on it, which would read as a panel still loading.
  if (spend.turns !== undefined && spend.cost === undefined && !words && !cache) lines.push(UNCOUNTED)
  return lines
}

/** How many rows the counts are given, whatever comes out: the most there can
 * be, so that the keys under them stay where the eye left them rather than
 * moving up and down between one turn and the next. */
const ROWS = 3

/**
 * What she has spent, as the agent behind her counts it.
 *
 * A glance rather than a page, the same as the panel of how the work stands: a
 * few numbers that can be taken in without reading. Nothing on it is a gauge,
 * because there is nothing to draw one against — what the agent hands over is
 * spending, and the plan it is spent against belongs to the provider behind it
 * rather than to anything the window can ask.
 *
 * Nothing about opening it is hers, either: the counts came off turns she has
 * already had, so it can be opened while she is working, while she is waiting to
 * be allowed something, or while there is no session at all, and she is never
 * told it was looked at.
 */
export function SpendBox({
  theme,
  spend,
  width,
}: {
  theme: Palette
  /** What the agent has counted, and nothing at all before it has counted
   * anything. */
  spend: Spend | null
  width: number
}) {
  // What is left of the row once the frame and its padding have taken theirs.
  const room = width - 4
  const lines = spentSoFar(spend)

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title=" What she has spent "
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
    >
      <text fg={theme.muted}>{cut(SINCE, room)}</text>

      {Array.from({ length: ROWS }, (_, row) => (
        <box key={row} height={1}>
          <text fg={row === 0 ? theme.foreground : theme.muted}>{cut(lines[row] ?? '', room)}</text>
        </box>
      ))}

      <EdgeKeys theme={theme} rows={packed(spendingKeys(), room)} />
    </box>
  )
}
