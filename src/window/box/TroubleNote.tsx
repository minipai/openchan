import { keyFor, shownAs } from '../keys'
import type { Trouble } from '../../between/protocol'
import type { Palette } from '../theme'

/**
 * What is in the way, written where the line she is spoken to on would be.
 *
 * It takes that line rather than sitting above it because there is nothing to
 * type into while it is up: whatever is wrong is between him and her, and until
 * it is dealt with a sentence would only be held. The one key that deals with it
 * is printed under it, and which key that is comes off the same table as every
 * other key in the window.
 */
export function TroubleNote({ theme, trouble }: { theme: Palette; trouble: Trouble }) {
  // A session that went with it can only be opened again; one that survived it
  // is simply let go of. There is never a choice of two.
  const out = keyFor(trouble.gone ? 'retry' : 'dismiss')

  return (
    <box flexDirection="column">
      <text fg={theme.foreground} wrapMode="word">{trouble.title}</text>
      <text fg={theme.muted} wrapMode="word">{trouble.body}</text>
      {/* What actually came back. Whoever is looking at this screen is the one
          who can fix it, so it is shown rather than folded away. */}
      {trouble.detail ? (
        <text fg={theme.faint} wrapMode="word">{trouble.detail}</text>
      ) : null}
      <text fg={theme.primary}>{`${shownAs(out.press)} ${out.says}`}</text>
    </box>
  )
}
