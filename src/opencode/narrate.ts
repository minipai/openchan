import path from 'node:path'

/** What she is doing, in words rather than in the tool's own name. */
export function narrate(tool: string, input: Record<string, unknown>): string {
  const file = typeof input.filePath === 'string' ? path.basename(input.filePath) : null
  switch (tool) {
    case 'read':
      return file ? `reading ${file}` : 'reading'
    case 'edit':
    case 'write':
      return file ? `writing ${file}` : 'writing'
    case 'bash':
      return typeof input.command === 'string' ? `running ${input.command.split('\n')[0]}` : 'running a command'
    case 'grep':
      return typeof input.pattern === 'string' ? `looking for ${input.pattern}` : 'searching'
    case 'glob':
    case 'list':
      return 'going through the folder'
    case 'webfetch':
      return 'looking it up'
    case 'todowrite':
      return 'putting things in order'
    case 'question':
      return 'asking'
    default:
      return tool
  }
}

/**
 * The same thing once it is over, for the word that goes up as she puts the
 * tool down.
 *
 * Said in the past because that is when it is said: the 地の文 is written while
 * she is at it and stays until she speaks again, so a second line still saying
 * she is reading something she has finished reading would read as her being
 * stuck on it.
 */
export function justDid(tool: string, input: Record<string, unknown>): string {
  const file = typeof input.filePath === 'string' ? path.basename(input.filePath) : null
  switch (tool) {
    case 'read':
      return file ? `read ${file}` : 'read'
    case 'edit':
    case 'write':
      return file ? `wrote ${file}` : 'wrote'
    case 'bash':
      return typeof input.command === 'string' ? `ran ${input.command.split('\n')[0]}` : 'ran a command'
    case 'grep':
      return typeof input.pattern === 'string' ? `looked for ${input.pattern}` : 'searched'
    case 'glob':
    case 'list':
      return 'went through the folder'
    case 'webfetch':
      return 'looked it up'
    case 'todowrite':
      return 'put things in order'
    case 'question':
      return 'asked'
    default:
      return tool
  }
}
