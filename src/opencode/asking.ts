import path from 'node:path'
import type { Question, Standing } from '../between/protocol'

/** A question she asked with the answers written out, as the server raises
 * it: one request, carrying one or more questions, each with its options. */
export type AskedQuestion = {
  id: string
  /** The tool call she asked it through, where she asked it through one: the
   * turn it belongs to, and the only thing that says whose turn that is. */
  tool?: { messageID?: string }
  questions: {
    question: string
    header: string
    options: { label: string; description?: string }[]
    multiple?: boolean
  }[]
}

/**
 * Her questions, in the window's vocabulary: the same shape the server gives
 * them, less what the window has no use for. What goes back is the labels —
 * the server takes the answer as the label, not as a position in the list —
 * and a description the agent left empty is no description at all rather than
 * an empty line under the row.
 */
export function questionsIn(asked: AskedQuestion): Question[] {
  return asked.questions.map((one) => ({
    header: one.header,
    question: one.question,
    options: one.options.map(({ label, description }) => (description ? { label, description } : { label })),
    multiple: one.multiple ?? false,
  }))
}

/** A tool she may not use until he says so. The server names the tool under
 * `permission`, and older ones under `type` or `title`; what it would be used
 * for is under `metadata`, shaped by the tool. */
export type AskedPermission = {
  id: string
  /** The turn asking, as the server knows it: her side of a sentence somebody
   * sent, rather than the sentence. The running server sends it under `tool`
   * with the call that wants the permission; the SDK this is built against
   * describes it beside `sessionID` and knows nothing of `tool`. Both are
   * written down, because both are what somebody's server sends. */
  tool?: { messageID?: string }
  messageID?: string
  permission?: string
  type?: string
  title?: string
  metadata?: Record<string, unknown>
}

/**
 * What she would actually do with the tool she is asking for, off the
 * permission the server raised: the one line the box has room for, and the
 * whole of it for whoever wants to read before saying yes.
 *
 * The server shapes `metadata` by the tool — a command for bash, a path and a
 * unified diff for edit, an address for webfetch — so this is the one place
 * that knows those shapes, the same as `narrate` is for tool calls. Both halves
 * are given even when they say the same thing: the box shortens the line it
 * shows to whatever is left after the keys, and the long way round is how the
 * rest of it gets read.
 */
export function asking(
  toolName: string | undefined,
  metadata: Record<string, unknown>,
): { summary?: string; detail?: string; standing?: Standing } {
  // A tool the server did not name cannot be given a standing yes: the scope
  // would be the same scope every other tool it forgot to name is remembered
  // under, and a yes to one of them would be a yes to all of them.
  const stands = (what: string, covers: string): Standing | undefined =>
    toolName ? { scope: `${toolName} ${what}`, covers } : undefined
  const { command, filepath, diff, url } = metadata as Record<string, string | undefined>
  if (typeof command === 'string') {
    // The program, not the command: yes to `git status` is yes to git, and it
    // is not yes to whatever else she thinks of next.
    const program = oneProgram(command)
    return {
      summary: command.split('\n')[0],
      detail: command,
      standing: program ? stands(program, `run ${program}`) : undefined,
    }
  }
  if (typeof filepath === 'string') {
    const near = path.relative(process.cwd(), filepath)
    const shown = near && !near.startsWith('..') ? near : filepath
    return {
      summary: shown,
      detail: typeof diff === 'string' ? hunks(diff) : undefined,
      // The one file, by the path the server named it by — the file she is
      // asking about is the whole of what he can see, so it is the whole of
      // what he can be taken to have said yes to.
      standing: filepath ? stands(filepath, `${toolName} ${shown}`) : undefined,
    }
  }
  if (typeof url === 'string') {
    const from = originOf(url)
    return {
      summary: url,
      detail: url,
      standing: from ? stands(from, `fetch ${from}`) : undefined,
    }
  }
  return {}
}

/** Anything that makes a command line more than one program running: another
 * command after it, a pipe into one, a substitution that is one, a file it
 * writes over. */
const SHELL = /[;&|<>$`(){}\n\\]/
/** A program, as opposed to `FOO=1` in front of one. */
const PROGRAM = /^[\w.\-/]+$/
/**
 * The programs whose whole job is to run another one. What actually runs is in
 * their arguments, so the name at the front of the line says nothing about it:
 * `bash -c 'rm -rf ~'` is a yes to bash, and a yes to bash is a yes to
 * anything at all. The same second thing hidden in one line that the shell
 * characters hide, wearing a program's name instead.
 */
const RUNS_ANYTHING = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'env',
  'sudo',
  'doas',
  'su',
  'xargs',
  'nohup',
  'timeout',
  'time',
  'nice',
  'watch',
  'command',
  'exec',
  'eval',
  'ssh',
])

/**
 * The one program a command line runs, for a standing yes to be against.
 * Nothing, unless that is all the line is: `git status && rm -rf dist` starts
 * with git and ends somewhere else entirely, and a yes shown as "run git" would
 * carry the second half of it along for the rest of the session. So anything
 * with shell in it is asked about every time, and so is anything that runs
 * whatever it is handed — which is the same answer a command with a name it
 * cannot read gets.
 */
function oneProgram(command: string): string | null {
  if (SHELL.test(command)) return null
  const program = command.trim().split(/\s+/)[0]
  if (!program || !PROGRAM.test(program)) return null
  // By the name at the end of the path: `/bin/bash` is bash.
  return RUNS_ANYTHING.has(program.split('/').pop()!) ? null : program
}

/**
 * Who an address is asking, for a standing yes to be against — a page is one of
 * thousands on a host, and the host is the thing worth naming. With the scheme
 * on it: `http://internal.corp` is not the site he said yes to when he said yes
 * to `https://internal.corp`. Nothing, for an address that will not parse or
 * has nobody on the other end of it — then there is nobody to say yes to.
 */
function originOf(url: string): string | null {
  try {
    const { origin } = new URL(url)
    return origin && origin !== 'null' ? origin : null
  } catch {
    return null
  }
}

/** A unified diff with its preamble off. The server writes the path three
 * times above the first hunk and the box has already said which file this is —
 * what is worth the screen is the changed lines. */
function hunks(diff: string): string {
  // The start of a line, not anywhere: the path is written above the first
  // hunk three times, and a path with @@ in it would otherwise be the cut.
  const first = diff.search(/^@@/m)
  return (first === -1 ? diff : diff.slice(first)).trim()
}
