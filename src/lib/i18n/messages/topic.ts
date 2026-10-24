import type { NamespaceMessages } from "../config";

// topic namespace strings
export const topic: NamespaceMessages = {
  en: {
    // page header
    heroBadge: "No product needed · One sentence to video",
    heroTitle: "One-sentence to video",
    heroSubtitle:
      "Type one topic and AI writes a voiceover script, then auto-fills footage from free stock libraries — just hit Assets and Compose next to render a vertical short in one click. Works for any topic, not just commerce.",
    // LLM not configured guidance
    llmBannerTitle: "Set up an LLM to generate scripts",
    llmBannerDesc: "Add the script-writing LLM (base URL / API key / model) in Settings.",
    llmBannerCta: "Go to Settings →",
    // topic input
    topicLabel: "Your topic in one sentence",
    topicPlaceholder: "e.g. How to brew a pour-over coffee at home",
    tryLabel: "Try:",
    exampleTopic1: "How to brew a pour-over coffee at home",
    exampleTopic2: "Why city nightscapes feel so soothing",
    exampleTopic3: "Three small habits for a more productive morning",
    exampleTopic4: "Five little things to do on a rainy day",
    exampleTopic5: "Why we always miss our childhood",
    // narration style
    narrationLabel: "Narration style",
    narration_knowledge_label: "Explainer",
    narration_knowledge_desc: "Break down a topic and teach something new",
    narration_story_label: "Emotional story",
    narration_story_desc: "Immersive narrative that strikes a chord",
    narration_lifestyle_label: "Lifestyle",
    narration_lifestyle_desc: "Polished vlog voiceover with a refined feel",
    narration_inspiration_label: "Inspiring quotes",
    narration_inspiration_desc: "Snappy pacing, great for likes and saves",
    narration_travel_label: "Travel & scenery",
    narration_travel_desc: "Destinations and views that make you want to go",
    // duration
    durationLabel: "Target length",
    // generate button
    generatingScript: "AI is writing the script…",
    ctaGenerate: "Generate script",
    // flow hints
    flowStep1: "1 Write script",
    flowStep2: "2 Auto-fill footage",
    flowStep3: "3 Render video",
    // error messages
    errorNoLlm: "No LLM configured yet — add your API key in Settings first",
    errorGenerateCheckLlm: "Script generation failed. Check your LLM settings",
    errorGenerate: "Script generation failed",
  },
};
