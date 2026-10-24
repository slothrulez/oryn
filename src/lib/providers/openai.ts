/**
 * Official OpenAI provider
 * Image generation (text-to-image + image-to-image edits): GPT Image series (flagship gpt-image-2 / gpt-image-1.5 etc.), DALL·E 3/2 compatible.
 * Docs: https://platform.openai.com/docs/api-reference/images
 *
 * Notes:
 * - Text-to-image: POST /images/generations (JSON, synchronous).
 * - Image-to-image (edit): POST /images/edits (multipart/form-data, synchronous),
 *   supported by gpt-image-* and dall-e-2; dall-e-3 does not support edits.
 * - gpt-image-* only returns base64 (b64_json) and doesn't accept response_format;
 *   DALL·E 2/3 support response_format=url. This implementation always wraps base64 as a data URI;
 *   downstream persistence (persistSource) already supports data: URLs.
 * - gpt-image-2 supports arbitrary resolutions (sides divisible by 16, aspect 1:3–3:1), so vertical 9:16 works directly.
 * - Video (Sora) downloads require auth (GET /v1/videos/{id}/content with Bearer),
 *   while asset persistence here downloads unauthenticated direct links, so OpenAI video isn't wired; generateVideo throws.
 */

import { BaseProvider, ProviderError } from './base'
import type {
  ProviderConfig,
  ImageOptions,
  ImageResult,
  VideoResult,
  TaskStatus,
  Model,
  MediaType,
} from './types'

// ==================== OpenAI API response types ====================

interface OpenAIImageResponse {
  created: number
  data: Array<{
    url?: string
    b64_json?: string
    revised_prompt?: string
  }>
  [key: string]: unknown
}

// ==================== Provider implementation ====================

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai'
  readonly displayName = 'OpenAI'

  constructor(config: ProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    })
  }

  /**
   * Generate images (synchronous API)
   * With a reference image / image-to-image use the edit endpoint, otherwise text-to-image.
   */
  async generateImage(options: ImageOptions): Promise<ImageResult> {
    if (options.mode === 'image-to-image' || options.referenceImageUrl) {
      return this.editImage(options)
    }
    return this.textToImage(options)
  }

  /**
   * Generate video (not supported)
   * OpenAI Sora renders need authenticated download, while asset persistence uses unauthenticated direct links, so it isn't wired yet.
   */
  async generateVideo(): Promise<VideoResult> {
    throw new ProviderError(
      'OpenAI video generation (Sora) is not wired yet; use a video platform such as fal.ai or Replicate instead',
      'NOT_SUPPORTED',
      this.name
    )
  }

  /**
   * Query task status
   * Images are synchronous; there are no async tasks to query
   */
  async getTaskStatus(): Promise<TaskStatus> {
    throw new ProviderError('OpenAI images are generated synchronously; there is no task status to query', 'NOT_SUPPORTED', this.name)
  }

  /**
   * List available models (current GPT Image series, all support text-to-image + image-to-image edits)
   */
  async listModels(mediaType?: MediaType): Promise<Model[]> {
    if (mediaType === 'video') return []

    const models: Model[] = [
      {
        id: 'gpt-image-2',
        name: 'GPT Image 2',
        description: 'OpenAI flagship image model: any resolution (including 9:16 vertical), best text rendering and product-faithful image-to-image',
        modes: ['text-to-image', 'image-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'gpt-image-1.5',
        name: 'GPT Image 1.5',
        description: 'Faster, cheaper GPT Image model with image-to-image edits',
        modes: ['text-to-image', 'image-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
    ]

    return models
  }

  // ==================== Private methods ====================

  /** Text-to-image: POST /images/generations (JSON) */
  private async textToImage(options: ImageOptions): Promise<ImageResult> {
    const model = options.modelId
    const isGptImage = model.startsWith('gpt-image')
    const isDalle3 = model.startsWith('dall-e-3')

    const body: Record<string, unknown> = {
      model,
      prompt: options.prompt,
      // DALL·E 3 only supports n=1; others use the requested count (gpt-image supports multiple)
      n: isDalle3 ? 1 : (options.count ?? 1),
      size: this.pickSize(model, options.width, options.height),
      // only DALL·E supports response_format; gpt-image-* always returns b64_json and must not receive it
      ...(isGptImage ? {} : { response_format: 'url' }),
      ...options.extra,
    }

    const response = await this.request<OpenAIImageResponse>('/images/generations', {
      method: 'POST',
      body,
      timeout: 120000, // image generation is slow; 2-minute timeout
    })

    return this.mapResult(model, response)
  }

  /** Image-to-image (edit): POST /images/edits (multipart) */
  private async editImage(options: ImageOptions): Promise<ImageResult> {
    const model = options.modelId
    if (model.startsWith('dall-e-3')) {
      throw new ProviderError('DALL·E 3 does not support image-to-image (edits); use gpt-image-1 instead', 'NOT_SUPPORTED', this.name)
    }
    if (!options.referenceImageUrl) {
      throw new ProviderError('Image-to-image is missing a reference image', 'BAD_REFERENCE', this.name)
    }

    const isDalle2 = model.startsWith('dall-e-2')
    const { blob, filename } = await this.fetchReferenceImage(options.referenceImageUrl)

    const form = new FormData()
    form.append('model', model)
    form.append('prompt', options.prompt)
    form.append('n', String(isDalle2 ? 1 : (options.count ?? 1)))
    form.append('size', this.pickSize(model, options.width, options.height))
    // gpt-image-* uses the array field image[]; dall-e-2 uses a single image field
    form.append(isDalle2 ? 'image' : 'image[]', blob, filename)
    // only dall-e-2 supports response_format; gpt-image-* always returns b64_json
    if (isDalle2) form.append('response_format', 'url')
    for (const [k, v] of Object.entries(options.extra ?? {})) {
      if (v !== undefined && v !== null) form.append(k, String(v))
    }

    const response = await this.postMultipart<OpenAIImageResponse>('/images/edits', form)
    return this.mapResult(model, response)
  }

  /** Parse the image response: use url directly, wrap b64_json as a data URI */
  private mapResult(model: string, response: OpenAIImageResponse): ImageResult {
    const imageUrls = (response.data ?? [])
      .map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : undefined))
      .filter((u): u is string => Boolean(u))

    if (imageUrls.length === 0) {
      throw new ProviderError('Generation succeeded but returned no image data', 'NO_RESULT', this.name)
    }

    return {
      taskId: `openai-img-${response.created ?? Date.now()}`,
      imageUrls,
      modelId: model,
    }
  }

  /**
   * Fetch a reference image (data URI or http(s) URL) as a Blob for multipart upload
   */
  private async fetchReferenceImage(ref: string): Promise<{ blob: Blob; filename: string }> {
    if (ref.startsWith('data:')) {
      const comma = ref.indexOf(',')
      if (comma === -1) throw new ProviderError('Failed to parse the reference image data URI', 'BAD_REFERENCE', this.name)
      const mime = ref.slice(5, comma).split(';')[0] || 'image/png'
      const buf = Buffer.from(ref.slice(comma + 1), 'base64')
      return { blob: new Blob([new Uint8Array(buf)], { type: mime }), filename: `image.${this.extFromMime(mime)}` }
    }
    const resp = await fetch(ref)
    if (!resp.ok) throw new ProviderError(`Reference image download failed: ${resp.status}`, 'BAD_REFERENCE', this.name)
    const blob = await resp.blob()
    const mime = blob.type || resp.headers.get('content-type') || 'image/png'
    return { blob, filename: `image.${this.extFromMime(mime)}` }
  }

  /** multipart POST: don't set Content-Type manually so fetch adds the boundary */
  private async postMultipart<T>(path: string, form: FormData, timeoutMs = 120000): Promise<T> {
    const url = `${this.config.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        body: form,
        signal: controller.signal,
      })
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        throw new ProviderError(
          `API request failed: ${resp.status} ${resp.statusText} - ${errBody}`,
          'API_ERROR',
          this.name,
          resp.status
        )
      }
      return (await resp.json()) as T
    } catch (e) {
      if (e instanceof ProviderError) throw e
      const isTimeout = e instanceof DOMException && e.name === 'AbortError'
      throw new ProviderError(
        isTimeout ? `Request timed out (${timeoutMs}ms)` : `Network request error: ${e instanceof Error ? e.message : String(e)}`,
        isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        this.name
      )
    } finally {
      clearTimeout(timer)
    }
  }

  /** MIME → file extension */
  private extFromMime(mime: string): string {
    if (mime.includes('webp')) return 'webp'
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
    return 'png'
  }

  /**
   * Map the requested width/height to the size string each OpenAI model allows (nearest landscape/portrait/square)
   */
  private pickSize(model: string, width?: number, height?: number): string {
    const w = width ?? 1024
    const h = height ?? 1024
    const ratio = w / h
    // DALL·E 3 allows: 1024x1024 / 1792x1024 / 1024x1792
    if (model.startsWith('dall-e-3')) {
      if (ratio > 1.2) return '1792x1024'
      if (ratio < 0.83) return '1024x1792'
      return '1024x1024'
    }
    // DALL·E 2 is square only
    if (model.startsWith('dall-e-2')) return '1024x1024'
    // gpt-image-2 / 2-2026-*: arbitrary resolution, nearest real aspect ratio (9:16 works directly)
    if (model.startsWith('gpt-image-2')) return this.fitArbitrarySize(w, h)
    // other gpt-image-* (1 / 1.5 / mini): standard 1024x1024 / 1536x1024 / 1024x1536
    if (ratio > 1.2) return '1536x1024'
    if (ratio < 0.83) return '1024x1536'
    return '1024x1024'
  }

  /**
   * gpt-image-2 arbitrary-resolution fit: cap the long side at 1536 (cost/latency),
   * align sides to multiples of 16 and clamp the aspect ratio to 1:3–3:1 (API constraint)
   */
  private fitArbitrarySize(width: number, height: number): string {
    const LONG = 1536
    let w = width
    let h = height
    const longest = Math.max(w, h)
    if (longest > LONG) {
      const s = LONG / longest
      w *= s
      h *= s
    }
    const round16 = (n: number) => Math.max(256, Math.round(n / 16) * 16)
    w = round16(w)
    h = round16(h)
    // clamp the aspect ratio to 1:3–3:1
    if (w / h > 3) w = round16(h * 3)
    if (h / w > 3) h = round16(w * 3)
    return `${w}x${h}`
  }
}
