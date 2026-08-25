import { settled, type Work } from '../../between/repo'
import { fitted, shortened } from '../../between/folder'
import { checkingKeys, shownAs } from '../keys'
import { cut } from './edge'
import type { Palette } from '../theme'

/** What the box says while git is still being asked, so that the panel opens
 * with something in it rather than growing a line under the eye already on it. */
const ASKING = 'looking…'

/** What a folder git has never been asked about comes to. Not an error and not
 * drawn as one: plenty of the folders she works in are nobody's repository, and
 * the panel opened over one has simply nothing to count. */
const NO_REPOSITORY = 'nothing kept in git here'

/** The branch line, cut to what is left of the row once "on " has taken its
 * own room — exported so a test can ask what the panel would say about a real
 * branch without writing the branch's own name, or its length, down. */
export const branchLine = (branch: string | null, room: number) =>
  branch ? `on ${fitted(branch, room - 3)}` : 'not on a branch'

/** The three piles, in the words they are counted in — the empty ones left out
 * rather than printed as noughts, because a nought is a number to read past. */
function counted(work: Work): string {
  const piles = [
    [work.staged, 'staged'],
    [work.changed, 'changed'],
    [work.untracked, 'untracked'],
  ] as const
  return piles
    .filter(([many]) => many > 0)
    .map(([many, what]) => `${many} ${what}`)
    .join(' · ')
}

/**
 * How the work stands in the folder she is in: the branch, and how much is
 * waiting in it.
 *
 * A glance rather than a page. `git status` printed into a box would be the
 * same thing the master already has a terminal for — what is worth having here
 * is the half of it that can be taken in without reading: which branch this is,
 * and whether anything is outstanding.
 *
 * Nothing about it is hers. It is read off the folder when the panel opens, so
 * it can be asked for while she is working, while she is waiting to be allowed
 * something, or while there is no session at all — and asking costs her
 * nothing, because she is never told it was asked.
 */
export function RepoBox({
  theme,
  folder,
  work,
  width,
}: {
  theme: Palette
  folder: string
  /** What git said, nothing where it had nothing to say, and `undefined` while
   * it is still being asked. */
  work: Work | null | undefined
  width: number
}) {
  // What is left of the row once the frame and its padding have taken theirs.
  const room = width - 4

  return (
    <box
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.card}
      title=" How the work stands "
      titleColor={theme.foreground}
      titleAlignment="left"
      width={width}
      flexDirection="column"
      paddingX={1}
      paddingTop={1}
    >
      {/* Which folder is being answered about, since she can have been moved
          since the window opened and every count under it belongs to one. */}
      <text fg={theme.muted}>{fitted(shortened(folder), room)}</text>

      <box height={1}>
        <text fg={theme.foreground}>
          {work === undefined
            ? ASKING
            : work === null
              ? NO_REPOSITORY
              : branchLine(work.branch, room)}
        </text>
      </box>

      {/* Kept to a line however it comes out, so that the key under it stays
          where the eye left it — and cut to the width rather than off it: three
          counts in a narrow terminal would otherwise lose the last of them,
          with nothing on screen saying a pile had gone missing. */}
      <box height={1}>
        <text fg={theme.muted}>
          {work === undefined || work === null
            ? ''
            : settled(work)
              ? 'nothing waiting'
              : cut(counted(work), room)}
        </text>
      </box>

      <box flexDirection="row" gap={3} marginTop={1}>
        {checkingKeys().map((key) => (
          <box key={key.press} flexDirection="row" gap={1} flexShrink={0}>
            <text fg={theme.primary}>{shownAs(key.press)}</text>
            <text fg={theme.faint}>{key.says}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
