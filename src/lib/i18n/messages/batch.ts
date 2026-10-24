import type { NamespaceMessages } from "../config";

// batch namespace strings
export const batch: NamespaceMessages = {
  en: {
    // top navigation
    navTitle: "Batch production",
    // page title
    heroTitle: "Batch production",
    heroSubtitle: "Select multiple products, set shared options, and generate commerce videos in one click",
    // video mode options
    modeProductCloseup: "Product close-up",
    modeGraphicMontage: "Graphic montage",
    modeSceneDemo: "Scene demo",
    modeLivePresenter: "Live presenter",
    // script style options
    stylePainPoint: "Pain point",
    styleScenario: "Scenario pitch",
    styleComparison: "Comparison review",
    styleStory: "Story-driven",
    styleDrama: "Mini-drama",
    styleReversal: "Plot twist",
    styleInterview: "Street interview",
    styleUnboxing: "Unboxing review",
    styleProductPov: "Product POV",
    styleTalkingHead: "Talking head",
    styleAuto: "Smart pick",
    // category labels
    categoryHome: "Home goods",
    categoryTech: "Tech & gadgets",
    categoryBeauty: "Beauty & skincare",
    categoryFood: "Food & snacks",
    categoryFashion: "Fashion & bags",
    categoryOther: "Other",
    // task status
    taskPending: "Pending",
    taskGenerating: "Generating",
    taskComposing: "Rendering",
    taskDone: "Done",
    taskFailed: "Failed",
    // error / API messages
    errorNoLlm: "No LLM configured — can't generate scripts.",
    errorNoLlmCta: "Add your API key in Settings →",
    errorProjectCreate: "Failed to create project",
    errorScriptFailed: "Script generation failed",
    errorComposeFailed: "Render failed",
    errorGenerateFailed: "Generation failed",
    // Batch persistence: resume after interruption
    resumeTitle: "Your last batch didn't finish",
    resumeDesc: "{done}/{total} items done. Continue the rest (finished items are kept, same settings), or discard and start fresh.",
    resumeContinue: "Continue last batch",
    resumeDiscard: "Discard & start new",
    resumeProductMissing: "Product was removed from the library",
    abortBatch: "Stop",
    projectNameSuffix: "{name} promo",
    // step 1
    step1Label: "Step 1: Select products",
    step1Selected: "{selected}/{total} selected",
    emptyHint: "Your product library is empty — import sample products to try batch production right away",
    importExamples: "Import sample products",
    goToProducts: "Go to products",
    // step 2
    step2Label: "Step 2: Shared settings",
    videoModeLabel: "Video mode",
    livePresenterHint: "Live-presenter mode renders no digital human: bring your own real-person footage at the compose step, or use AI mid/long-shot person scenes only. No footage? Switch to Product close-up or Scene demo.",
    scriptStyleLabel: "Script style",
    durationLabel: "Target duration",
    autoComposeLabel: "Auto-fill footage + render the video after scripting (free, 0 API key)",
    productCardLabel: "Overlay a product card (image + name + price + buy CTA)",
    variationLabel: "Anti-template variation: rotate hook/style/voice/BGM/captions per video (platforms suppress templated batches; recommended)",
    // generation progress
    progressLabel: "Progress",
    progressDone: "{done}/{total} done",
    taskView: "View",
    taskViewVideo: "View video",
    completeMsg: "Batch generation complete! {count} videos created",
    // bottom action bar
    ctaGenerating: "Generating batch...",
    ctaAgain: "Done — run another batch",
    ctaStart: "Start batch generation",
    hintWillGenerate: "Will generate commerce videos for {count} products",
    hintSelectAtLeastOne: "Select at least 1 product first",
  },
};
