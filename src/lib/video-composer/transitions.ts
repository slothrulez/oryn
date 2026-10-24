/**
 * Transition strategy
 * Core idea: achieve natural transitions by stitching AI-generated start/end frames,
 * rather than using FFmpeg template transitions.
 *
 * Workflow:
 * 1. Generate the video for the first clip
 * 2. Extract the last frame as the "end frame"
 * 3. Generate the "start frame" for the next clip (can be an AI image or product image)
 * 4. Use a model that supports start/end frames (e.g. Veo 3.1) to generate the transition clip
 * 5. Or directly let the AI use the last frame of the previous clip as a reference when generating the next clip
 */

// transition mode
export type TransitionMode =
  | "ai_start_end"    // AI start/end frame transition (recommended, best quality)
  | "ai_reference"    // AI generation with reference to previous frame (second choice)
  | "direct_concat"   // direct concatenation (hard cut)
  | "ffmpeg_fade";    // FFmpeg fade in/out (fallback option)

export interface TransitionConfig {
  mode: TransitionMode;
  label: string;
  description: string;
  // models that support this transition mode
  supportedModels: string[];
}

// list of transition configurations
export const TRANSITIONS: Record<TransitionMode, TransitionConfig> = {
  ai_start_end: {
    mode: "ai_start_end",
    label: "AI smart transition",
    description: "Takes the last frame of the previous clip and the first frame of the next, and generates a natural AI transition video",
    supportedModels: [
      // Google Veo 3.1 (image + last_image)
      "google/veo3.1/image-to-video",
    ],
  },
  ai_reference: {
    mode: "ai_reference",
    label: "AI reference transition",
    description: "Uses the previous clip's last frame as the reference image so the next clip connects automatically",
    supportedModels: [
      // Google Veo 3.1
      "google/veo3.1/reference-to-video",
      "google/veo3.1/image-to-video",
    ],
  },
  direct_concat: {
    mode: "direct_concat",
    label: "Hard cut",
    description: "Hard cut, no transition effect",
    supportedModels: [],
  },
  ffmpeg_fade: {
    mode: "ffmpeg_fade",
    label: "Crossfade",
    description: "FFmpeg fade in/out (fallback option)",
    supportedModels: [],
  },
};

// get the list of all transitions
export function getTransitionList(): TransitionConfig[] {
  return Object.values(TRANSITIONS);
}

/**
 * Whether a video model accepts a pinned last frame (start/end-frame generation) — the gate for
 * keyframe-chained i2v. Conservative: the ai_start_end allowlist only; unknown/custom models chain only if explicitly listed.
 */
export function modelSupportsLastFrame(modelId: string): boolean {
  if (!modelId) return false;
  return TRANSITIONS.ai_start_end.supportedModels.includes(modelId);
}

// recommend the best transition mode based on the user's configured providers
export function recommendTransition(availableModels: string[]): TransitionMode {
  // prefer AI start/end frame transition
  const hasStartEnd = TRANSITIONS.ai_start_end.supportedModels.some((m) =>
    availableModels.includes(m)
  );
  if (hasStartEnd) return "ai_start_end";

  // second choice: AI reference transition
  const hasReference = TRANSITIONS.ai_reference.supportedModels.some((m) =>
    availableModels.includes(m)
  );
  if (hasReference) return "ai_reference";

  // fallback: fade in/out
  return "ffmpeg_fade";
}
