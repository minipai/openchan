import { expect, test } from 'bun:test'
import { thinkingWith } from './model'
import type { Model } from './protocol'

/** What she could think with, as an agent lists them: the label carries
 * whoever serves it as well as the model, which is what makes it long. */
const MODELS: Model[] = [
  { id: 'opencode/free', label: 'opencode · Free' },
  { id: 'anthropic/claude-opus-4-5', label: 'Anthropic · Claude Opus 4.5' },
]

test('she is named as the list names her, where there is room for all of it', () => {
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', 40)).toBe('Anthropic · Claude Opus 4.5')
})

test('nothing at all before she has said what she is thinking with', () => {
  expect(thinkingWith(MODELS, null, 40)).toBe('')
})

test('whoever serves it is what gives first', () => {
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', 20)).toBe('Claude Opus 4.5')
  // Even down to a very short name: it is the model that says which model.
  expect(thinkingWith(MODELS, 'opencode/free', 5)).toBe('Free')
})

test('the front of the name, where not even that fits', () => {
  // Where two models part company: `Claude Opus 4.5` and `Claude Haiku 4.5`
  // differ in the middle and share the end.
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', 10)).toBe('Claude Op…')
})

test('nothing, rather than a letter and an ellipsis', () => {
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', 4)).toBe('')
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', 0)).toBe('')
  expect(thinkingWith(MODELS, 'anthropic/claude-opus-4-5', -3)).toBe('')
})

test('a model the list never offered is named by its id, and cut the same way', () => {
  // The list is the agent's to write and it can come back short, or refused
  // altogether — and she goes on thinking with something either way.
  expect(thinkingWith(MODELS, 'openrouter/qwen3-coder', 40)).toBe('openrouter/qwen3-coder')
  expect(thinkingWith([], 'openrouter/qwen3-coder', 40)).toBe('openrouter/qwen3-coder')
  expect(thinkingWith([], 'openrouter/qwen3-coder', 15)).toBe('qwen3-coder')
})
