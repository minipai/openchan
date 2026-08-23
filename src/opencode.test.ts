import { expect, test } from 'bun:test'
import { modelsIn, type ProviderModels } from './opencode'

/** Two providers as the server answers with them, one of them offering the same
 * model under its own name. */
const PROVIDERS: ProviderModels[] = [
  {
    id: 'opencode',
    name: 'opencode',
    models: {
      'nemotron-3.5-lightning-free': { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning' },
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    },
  },
]

test('every model every provider has is on the list, named the way opencode names it', () => {
  expect(modelsIn(PROVIDERS)).toEqual([
    { id: 'anthropic/claude-sonnet-4-5', label: 'Anthropic · Claude Sonnet 4.5' },
    { id: 'opencode/claude-sonnet-4-5', label: 'opencode · Claude Sonnet 4.5' },
    { id: 'opencode/nemotron-3.5-lightning-free', label: 'opencode · Nemotron 3.5 Lightning' },
  ])
})

test('the same model from two providers is two rows that can be told apart', () => {
  const listed = modelsIn(PROVIDERS).filter((model) => model.label.includes('Claude Sonnet 4.5'))

  expect(listed).toHaveLength(2)
  expect(new Set(listed.map((model) => model.label)).size).toBe(2)
})

test('a provider with nothing configured adds nothing to the list', () => {
  expect(modelsIn([{ id: 'lonely', name: 'Lonely', models: {} }])).toEqual([])
})
