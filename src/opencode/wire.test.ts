import { expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { sessionOf, SPEAKS, type Heard } from './wire'

test('the types she is read by are the ones written for the server she speaks to', () => {
  // opencode publishes its SDK under the server's own version, and the types in
  // it were read against that server event by event. Bumping one without the
  // other is how this drifted the first time: the pin says which types, the
  // constant says which server, and a version where they disagree is a version
  // nobody has checked.
  const manifest = fs.readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')
  const { dependencies } = JSON.parse(manifest) as { dependencies: Record<string, string> }

  expect(dependencies['@opencode-ai/sdk']).toBe(SPEAKS)
})

test('the conversation an event is about is read off the event and nowhere else', () => {
  const part = {
    id: 'evt_1',
    type: 'message.part.updated',
    properties: {
      sessionID: 'ses_1',
      time: 0,
      part: { id: 'prt_1', sessionID: 'ses_1', messageID: 'msg_1', type: 'text', text: 'hello' },
    },
  } satisfies Heard

  expect(sessionOf(part)).toBe('ses_1')
})

test('the server’s own news belongs to no conversation', () => {
  // Plenty of the stream is this: nothing to do with anybody talking to her.
  // Read as belonging to the conversation she is in, it would be answered.
  const loaded = { id: 'evt_2', type: 'plugin.added', properties: { id: 'core/config-reference' } } satisfies Heard

  expect(sessionOf(loaded)).toBeNull()
})

test('a frame the stream could not parse is not read as the server dying', () => {
  // Anything the stream fails to parse is handed over as the raw text of it.
  // Asked what conversation that is about, `in` against something that is not
  // an object throws — and a throw out of the loop reading events is caught as
  // the server having gone away, which is the one thing it does not mean.
  expect(sessionOf('data: half a li' as unknown as Heard)).toBeNull()
})
