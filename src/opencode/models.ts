import type { Model } from '../between/protocol'

/**
 * A model as opencode wants it named when it is being asked for: the two halves
 * of `provider/id`, apart. Nothing, if what came out of the environment is not
 * a model name at all — then the server keeps whatever it was started with,
 * which is a better answer than half a name.
 */
export function halves(model: string) {
  const cut = model.indexOf('/')
  if (cut < 1 || cut === model.length - 1) return undefined
  return { providerID: model.slice(0, cut), modelID: model.slice(cut + 1) }
}

/**
 * Everything the server has to think with, flattened out of the providers it
 * answers with and put in one order — a list that came back grouped by whoever
 * happened to be configured first reads as no order at all.
 *
 * The label carries the provider as well as the model: the same model is
 * offered by several of them, and two rows reading `Claude Sonnet 4.5` with
 * nothing to tell them apart is worse than not offering the choice.
 */
export function modelsIn(providers: ProviderModels[]): Model[] {
  return providers
    .flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        id: `${provider.id}/${model.id}`,
        label: `${provider.name} · ${model.name}`,
      })),
    )
    .sort((one, other) => one.label.localeCompare(other.label))
}

/** As much of a provider as the list needs. */
export type ProviderModels = {
  id: string
  name: string
  models: Record<string, { id: string; name: string }>
}
