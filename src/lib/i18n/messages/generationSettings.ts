import type { NamespaceMessages } from "../config";

// generationSettings namespace: custom model endpoints / generation parameters panel under Settings "Advanced"
export const generationSettings: NamespaceMessages = {
  en: {
    // Media types
    mediaImage: "Image",
    mediaVideo: "Video",
    platformDefault: "Platform default",

    // Custom model endpoints
    customModelTitle: "Custom model endpoints",
    customModelDesc:
      "Attach any model id to an existing platform; once added it's selectable under \"Default image/video model\" above (the platform key is reused from \"AI platforms\").",
    fieldProvider: "Platform",
    fieldType: "Type",
    fieldModelId: "model id",
    modelIdPlaceholder: "e.g. fal-ai/flux-pro/v1.1",
    fieldName: "Display name (optional)",
    namePlaceholder: "Defaults to the model id",
    audioCheckbox: "This video model has native audio (skips TTS)",
    addModel: "Add model",
    audioSuffix: " · with audio",
    delete: "Delete",

    // Generation params
    genParamsTitle: "Generation params (global defaults)",
    genParamsDesc:
      "Applied to all image/motion-shot generation; blank numeric fields fall back to each model's default.",
    imageSection: "Image",
    aspectRatio: "Aspect ratio",
    aspect916: "9:16 portrait",
    aspect169: "16:9 landscape",
    aspect11: "1:1 square",
    count: "Count",
    steps: "Inference steps",
    guidanceScale: "Guidance scale",
    seed: "Seed",
    seedPlaceholder: "Random",
    negativePrompt: "Negative prompt (optional)",
    imageNegativePlaceholder: "Elements to avoid, e.g. blur, text, watermark",
    videoSection: "Video (motion shots)",
    resolution: "Resolution",
    duration: "Duration (s)",
    fps: "Frame rate (fps)",
    motionStrength: "Motion strength",
    videoNegativePlaceholder: "Elements to avoid",
  },
};
