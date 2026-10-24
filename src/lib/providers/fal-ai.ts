/**
 * fal.ai Provider implementation
 * Built on the fal.ai REST API, supporting a wide range of image and video generation models
 * API docs: https://fal.ai/docs
 */

import { BaseProvider, ProviderError } from './base'
import type {
  ProviderConfig,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  TaskStatus,
  TaskStatusEnum,
  Model,
  MediaType,
} from './types'

// ==================== fal.ai API response types ====================

interface FalSubmitResponse {
  request_id: string
  [key: string]: unknown
}

interface FalStatusResponse {
  request_id: string
  status: string
  progress?: number
  response_url?: string
  [key: string]: unknown
}

interface FalResultResponse {
  images?: Array<{ url: string; width?: number; height?: number }>
  video?: { url: string; content_type?: string }
  videos?: Array<{ url: string }>
  seed?: number
  timings?: { inference?: number }
  [key: string]: unknown
}

// ==================== Provider implementation ====================

export class FalAIProvider extends BaseProvider {
  readonly name = 'fal-ai'
  readonly displayName = 'fal.ai'

  constructor(config: ProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://queue.fal.run',
    })
  }

  /**
   * Get authentication headers - fal.ai uses Key authentication
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Key ${this.config.apiKey}`,
    }
  }

  /**
   * Generate an image
   */
  async generateImage(options: ImageOptions): Promise<ImageResult> {
    const w = options.width ?? 0
    const h = options.height ?? 0
    // GPT Image series does not accept negative_prompt / guidance / steps
    const isGptImage = options.modelId.includes('gpt-image')
    // gpt-image-1.5: image_size only accepts string enum values (1024x1024 / 1536x1024 / 1024x1536)
    const isGptImage15 = options.modelId.includes('gpt-image-1.5')
    // gpt-image-2: image_size accepts {width,height} (must be multiples of 16) or a preset name
    const isGptImage2 = options.modelId.includes('gpt-image-2')
    // edit/image-to-image endpoints: gpt-image-1.5/edit uses image_urls; gpt-image-2/image-to-image also supports image_urls
    const isEdit = options.modelId.includes('/edit') || options.modelId.includes('/image-to-image')

    const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16)
    const imageSize = (() => {
      if (isGptImage15) {
        if (w > h) return '1536x1024'
        if (h > w) return '1024x1536'
        return '1024x1024'
      }
      if (!w || !h) return undefined
      // gpt-image-2 requires width and height to be multiples of 16
      return isGptImage2
        ? { width: round16(w), height: round16(h) }
        : { width: w, height: h }
    })()

    const body = {
      prompt: options.prompt,
      negative_prompt: isGptImage ? undefined : options.negativePrompt,
      image_size: imageSize,
      num_images: options.count ?? 1,
      guidance_scale: isGptImage ? undefined : options.guidanceScale,
      num_inference_steps: isGptImage ? undefined : options.steps,
      seed: options.seed,
      // edit/image-to-image: multi-image endpoints use image_urls array; regular image-to-image uses image_url
      ...((options.referenceImageUrls?.length || options.referenceImageUrl) && isEdit && {
        image_urls: options.referenceImageUrls?.length
          ? options.referenceImageUrls
          : [options.referenceImageUrl!],
      }),
      ...(options.referenceImageUrl && !options.referenceImageUrls?.length && !isEdit && {
        image_url: options.referenceImageUrl,
      }),
      ...options.extra,
    }

    // submit async task
    const submitResponse = await this.request<FalSubmitResponse>(
      `/${options.modelId}`,
      { method: 'POST', body }
    )

    // guard: submit occasionally returns no request_id; without this, taskId becomes "model::undefined",
    // parseTaskId does not throw, but the subsequent status endpoint returns 404
    if (!submitResponse.request_id) {
      throw new ProviderError('No request ID returned', 'NO_REQUEST_ID', this.name)
    }
    // getTaskStatus needs the "modelId::requestId" format to locate the query endpoint; assemble it here before polling
    const taskId = `${options.modelId}::${submitResponse.request_id}`
    const finalStatus = await this.pollTaskStatus(taskId, {
      interval: 2000,
    })

    return this.requireResult(finalStatus.result) as ImageResult
  }

  /**
   * Generate a video
   */
  async generateVideo(options: VideoOptions): Promise<VideoResult> {
    // if audio is enabled and a voiceover script is provided, merge it into the prompt
    let prompt = options.prompt
    if (options.audioEnabled && options.voiceover) {
      // models that support audio (e.g., Veo 3, other providers) can describe audio directly in the prompt
      prompt = `${options.prompt}. The narrator says: "${options.voiceover}"`
    }

    const body = {
      prompt,
      negative_prompt: options.negativePrompt,
      video_size: options.width && options.height
        ? { width: options.width, height: options.height }
        : undefined,
      duration: options.duration,
      fps: options.fps,
      motion_strength: options.motionStrength,
      guidance_scale: options.guidanceScale,
      seed: options.seed,
      // image-to-video mode
      ...(options.firstFrameUrl && {
        image_url: options.firstFrameUrl,
      }),
      // video-to-video mode
      ...(options.referenceVideoUrl && {
        video_url: options.referenceVideoUrl,
      }),
      // audio-related parameters (supported by some models)
      ...(options.audioEnabled && {
        audio: true,
        ...(options.audioPrompt && { audio_prompt: options.audioPrompt }),
      }),
      ...options.extra,
    }

    // submit async task
    const submitResponse = await this.request<FalSubmitResponse>(
      `/${options.modelId}`,
      { method: 'POST', body }
    )

    // guard: submit occasionally returns no request_id; without this, taskId becomes "model::undefined",
    // parseTaskId does not throw, but the subsequent status endpoint returns 404
    if (!submitResponse.request_id) {
      throw new ProviderError('No request ID returned', 'NO_REQUEST_ID', this.name)
    }
    // getTaskStatus needs the "modelId::requestId" format to locate the query endpoint; assemble it here before polling
    const taskId = `${options.modelId}::${submitResponse.request_id}`
    const finalStatus = await this.pollTaskStatus(taskId, {
      interval: 5000,
    })

    return this.requireResult(finalStatus.result) as VideoResult
  }

  /**
   * Query task status
   * fal.ai uses the queue API to poll status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    // fal.ai taskId format: "modelId::requestId"
    const [modelId, requestId] = this.parseTaskId(taskId)

    const statusResponse = await this.request<FalStatusResponse>(
      `/${modelId}/requests/${requestId}/status`,
      {
        // use fal.ai status query baseUrl
        headers: {},
      }
    )

    const status = this.mapStatus(statusResponse.status)

    const taskStatus: TaskStatus = {
      taskId,
      status,
      progress: statusResponse.progress,
    }

    // fetch the result once the task completes
    if (status === 'completed') {
      const result = await this.request<FalResultResponse>(
        `/${modelId}/requests/${requestId}`
      )
      taskStatus.result = this.parseResult(taskId, result, modelId)
    }

    return taskStatus
  }

  /**
   * Get the list of available models
   * fal.ai models are dynamic; this returns the commonly used ones
   */
  async listModels(mediaType?: MediaType): Promise<Model[]> {
    // model list verified against the fal.ai platform (2026-03)
    const models: Model[] = [
      // ==================== image generation ====================
      // OpenAI GPT Image 2 (fal endpoint: openai/gpt-image-2; strong prompt adherence, great product quality)
      {
        id: 'openai/gpt-image-2',
        name: 'GPT Image 2',
        description: 'OpenAI image model with strong prompt adherence, composition and detail fidelity (top pick for product hero shots)',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'openai/gpt-image-2/image-to-image',
        name: 'GPT Image 2 Edit',
        description: 'GPT Image 2 edit: precise inpainting/outpainting, product-faithful',
        modes: ['image-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      // kept for backward compatibility with the previous generation gpt-image-1.5
      {
        id: 'fal-ai/gpt-image-1.5',
        name: 'GPT Image 1.5',
        description: 'Previous-generation OpenAI image model, strong prompt adherence',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'fal-ai/flux/schnell',
        name: 'FLUX.1 [schnell]',
        description: 'Fast text-to-image, good for prototyping',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'fal-ai/flux/dev',
        name: 'FLUX.1 [dev]',
        description: 'High-quality text-to-image model',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'fal-ai/flux-pro/v1.1',
        name: 'FLUX.1 Pro v1.1',
        description: 'Professional-grade text-to-image',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'fal-ai/flux-2-pro',
        name: 'FLUX.2 [pro]',
        description: 'FLUX second-generation Pro',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },
      {
        id: 'fal-ai/recraft/v4/pro/text-to-image',
        name: 'Recraft V4 Pro',
        description: 'High-quality design-style image generation',
        modes: ['text-to-image'],
        mediaType: 'image',
        provider: this.name,
      },

      // ==================== video generation ====================
      // reference-to-video deliberately not listed: fal's variant needs a dedicated reference_image_urls
      // body this provider doesn't build — the grid-to-film pass runs on Atlas Cloud instead

      // --- Google Veo series ---
      {
        id: 'fal-ai/veo3',
        name: 'Veo 3',
        description: 'Google Veo 3: native dialogue / SFX / ambience, with lip sync',
        modes: ['text-to-video'],
        mediaType: 'video',
        provider: this.name,
        supportsAudio: true,
      },

      // --- Luma Ray 2 series ---
      {
        id: 'fal-ai/luma-dream-machine/ray-2',
        name: 'Luma Ray 2 (text-to-video)',
        description: 'Luma Ray 2: realistic motion and physics, 5s/9s',
        modes: ['text-to-video'],
        mediaType: 'video',
        provider: this.name,
      },
      {
        id: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
        name: 'Luma Ray 2 (image-to-video)',
        description: 'Luma Ray 2 image-to-video',
        modes: ['image-to-video'],
        mediaType: 'video',
        provider: this.name,
      },

    ]

    if (mediaType) {
      return models.filter((m) => m.mediaType === mediaType)
    }

    return models
  }

  // ==================== private methods ====================

  /** Map fal.ai task status to unified status */
  private mapStatus(falStatus: string): TaskStatusEnum {
    const statusMap: Record<string, TaskStatusEnum> = {
      IN_QUEUE: 'pending',
      IN_PROGRESS: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
    }
    return statusMap[falStatus] ?? 'pending'
  }

  /**
   * Parse a taskId
   * fal.ai task IDs are encoded as "modelId::requestId"
   */
  private parseTaskId(taskId: string): [string, string] {
    const separatorIndex = taskId.indexOf('::')
    if (separatorIndex === -1) {
      throw new ProviderError(
        'Invalid task ID format; expected "modelId::requestId"',
        'INVALID_TASK_ID',
        this.name
      )
    }
    return [
      taskId.substring(0, separatorIndex),
      taskId.substring(separatorIndex + 2),
    ]
  }

  /** Parse fal.ai response into the unified result format */
  private parseResult(
    taskId: string,
    result: FalResultResponse,
    modelId: string
  ): ImageResult | VideoResult {
    // image result
    if (result.images && result.images.length > 0) {
      return {
        taskId,
        imageUrls: result.images.map((img) => img.url),
        modelId,
        seed: result.seed,
        duration: result.timings?.inference,
      }
    }

    // video result (single video)
    if (result.video) {
      return {
        taskId,
        videoUrls: [result.video.url],
        modelId,
        processingTime: result.timings?.inference,
      }
    }

    // video result (multiple videos)
    if (result.videos && result.videos.length > 0) {
      return {
        taskId,
        videoUrls: result.videos.map((v) => v.url),
        modelId,
        processingTime: result.timings?.inference,
      }
    }

    throw new ProviderError('Could not parse the response', 'PARSE_ERROR', this.name)
  }
}
