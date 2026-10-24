import { resolveServerKey } from "@/lib/server-keys";
/**
 * AI provider factory and registry
 * Central management for all registered AI platform providers
 */

import type { AIProvider, ProviderConfig, ProviderRegistration } from './types'
import { AtlasCloudProvider } from './atlas-cloud'
import { FalAIProvider } from './fal-ai'
import { ReplicateProvider } from './replicate'
import { OpenAIProvider } from './openai'

// ==================== Provider registry ====================

/** Registered providers */
const providerRegistry: Map<string, ProviderRegistration> = new Map()

/**
 * Register a provider
 * @param registration provider registration info
 */
function registerProvider(registration: ProviderRegistration): void {
  providerRegistry.set(registration.name, registration)
}

// Register all built-in providers
registerProvider({
  name: 'atlas-cloud',
  displayName: 'Atlas Cloud',
  description: 'Atlas Cloud AI platform with image and video generation',
  factory: (config) => new AtlasCloudProvider(config),
})

registerProvider({
  name: 'fal-ai',
  displayName: 'fal.ai',
  description: 'fal.ai inference platform with FLUX, Veo, Luma and many more models',
  factory: (config) => new FalAIProvider(config),
})

registerProvider({
  name: 'replicate',
  displayName: 'Replicate',
  description: 'Replicate model marketplace: FLUX, Imagen, Veo and more',
  factory: (config) => new ReplicateProvider(config),
})

registerProvider({
  name: 'openai',
  displayName: 'OpenAI',
  description: 'OpenAI platform: gpt-image-2 / gpt-image-1.5 image generation and image editing',
  factory: (config) => new OpenAIProvider(config),
})

// ==================== Factory functions ====================

/**
 * Create a provider instance
 * @param config provider config; must include a name field
 * @returns AI provider instance
 * @throws if the given provider does not exist
 *
 * @example
 * ```ts
 * const provider = createProvider({
 *   name: 'fal-ai',
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://queue.fal.run',
 * })
 *
 * const result = await provider.generateImage({
 *   modelId: 'fal-ai/flux/dev',
 *   mode: 'text-to-image',
 *   prompt: 'A cute kitten',
 * })
 * ```
 */
export function createProvider(input: ProviderConfig): AIProvider {
  const config: ProviderConfig = { ...input, apiKey: resolveServerKey(input.apiKey) };
  const registration = providerRegistry.get(config.name)

  if (!registration) {
    const available = Array.from(providerRegistry.keys()).join(', ')
    throw new Error(
      `No provider named "${config.name}". Available providers: ${available}`
    )
  }

  return registration.factory(config)
}

/**
 * Get info for all registered providers
 * @returns list of provider registrations
 */
export function getAvailableProviders(): Array<{
  name: string
  displayName: string
  description: string
}> {
  return Array.from(providerRegistry.values()).map((reg) => ({
    name: reg.name,
    displayName: reg.displayName,
    description: reg.description,
  }))
}

/**
 * Dynamically register a custom provider
 * @param registration provider registration info
 */
export function registerCustomProvider(registration: ProviderRegistration): void {
  registerProvider(registration)
}

// ==================== Exported types and classes ====================

export type {
  AIProvider,
  ProviderConfig,
  ProviderRegistration,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  TaskStatus,
  TaskStatusEnum,
  Model,
  MediaType,
  GenerationMode,
} from './types'

export { BaseProvider, ProviderError } from './base'
export { AtlasCloudProvider } from './atlas-cloud'
export { FalAIProvider } from './fal-ai'
export { OpenAIProvider } from './openai'
