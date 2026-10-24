import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { createLLMClient, llmErrorPair, withLLMErrors } from "@/lib/llm-error";
import { reasoningParams } from "@/lib/script-engine/generator";
import { sanitizeCustomAdTemplate, AD_TEMPLATE_GROUPS } from "@/lib/ad-templates";
import { CAMERA_PRESETS } from "@/lib/camera-presets";
import { LOOK_PRESETS } from "@/lib/look-presets";

/**
 * AI custom ad-template generation: turn a concrete product (name / category /
 * selling points) into a full-pipeline AdTemplate recipe. The LLM only PICKS from
 * the real preset vocabularies (styles, camera presets, looks, compose options) —
 * every id in its output is validated and clamped by sanitizeCustomAdTemplate, so
 * an invalid pick degrades to a safe default instead of breaking the pipeline.
 *
 * No retry loop of our own: transport-level retries (429/5xx, plus free-pool 402)
 * are the SDK's job via createLLMClient; anything that still fails surfaces to the
 * user with an actionable message. Blind app-level retry loops stay banned
 * project-wide (paid-task discipline) — those would re-submit billable work.
 */

const STYLE_GLOSS: Record<string, string> = {
  "pain-point": "problem-solution",
  scenario: "lifestyle scenario",
  comparison: "comparison review",
  story: "storytelling",
  drama: "two-person skit",
  reversal: "plot twist",
  interview: "street interview",
  unboxing: "unboxing",
  product_pov: "product POV / visuals-led",
  talking_head: "creator talking-head",
};

const VIDEO_MODE_GLOSS: Record<string, string> = {
  product_closeup: "product close-ups",
  graphic_montage: "graphic flash montage",
  scene_demo: "real-scene demo",
  live_presenter: "on-camera presenter",
};

function buildPrompt(productName: string, category: string, sellingPoints: string): string {
  const styles = Object.entries(STYLE_GLOSS).map(([k, v]) => `${k}(${v})`).join(", ");
  const modes = Object.entries(VIDEO_MODE_GLOSS).map(([k, v]) => `${k}(${v})`).join(", ");
  const looks = LOOK_PRESETS.map((l) => `${l.id}(${l.name.en})`).join(", ");
  const cameras = CAMERA_PRESETS.map((c) => `${c.id}(${c.name.en})`).join(", ");
  const groups = AD_TEMPLATE_GROUPS.map((g) => `${g.id}(${g.name.en})`).join(", ");
  return [
    `Design a custom short-video ad "video template" recipe for the product below. Every enum field must use only the given vocabulary:`,
    `Product name: ${productName}`,
    category ? `Product category: ${category}` : "",
    sellingPoints ? `Core selling points: ${sellingPoints}` : "",
    ``,
    `Vocabulary:`,
    `- styleType (script style): ${styles}`,
    `- videoMode (visual format): ${modes}`,
    `- look (lighting and color grade): ${looks}`,
    `- camera preset ids: ${cameras}`,
    `- group (template group): ${groups}`,
    `- captionPreset: standard, bold, minimal, karaoke; bgm: none, upbeat, chill, energetic, emotional; quality: fast, standard, hd`,
    `- cameraPlan keys (shot types): hook, pain_point, product_reveal, demo, social_proof, cta (pick 3-5; values are camera preset ids)`,
    ``,
    `Requirements: tailor the recipe to this product's category traits and selling points (e.g. appetizing light and macro for food, cool tones and structure for tech). Write scriptHint as one English sentence describing the creative direction and narrative structure. Keep content truthful and compliant (no absolute claims or false promises). Write all text in English.`,
    `Output only one JSON object, no other text, in this format:`,
    `{"name":{"en":"Template name (≤4 words)"},"tagline":{"en":"one-line pitch"},"emoji":"one emoji","group":"...","goodFor":["${category || "beauty"}"],"styleType":"...","videoMode":"...","look":"...","cameraPlan":{"hook":"...","product_reveal":"...","demo":"...","cta":"..."},"compose":{"captionPreset":"...","bgm":"...","bgmDuck":true,"quality":"standard","productCard":true},"scriptHint":{"en":"one-sentence creative direction"}}`,
  ].filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const category = typeof body.category === "string" ? body.category : "";
  const sellingPoints = typeof body.sellingPoints === "string" ? body.sellingPoints.slice(0, 500) : "";
  const llmConfig = body.llmConfig;

  if (!productName) {
    return apiError(req, "Please enter the product name first");
  }
  if (!llmConfig?.baseUrl || !llmConfig?.model) {
    return apiError(req, "Please configure the LLM in settings first");
  }

  try {
    // shared factory: keyless endpoints accept a placeholder key; SDK retries + free-pool 402 retry
    const client = createLLMClient(llmConfig);
    const response = await withLLMErrors(
      () =>
        client.chat.completions.create({
          model: llmConfig.model,
          messages: [
            { role: "system", content: "You are a senior e-commerce short-video director. Output JSON only." },
            { role: "user", content: buildPrompt(productName, category, sellingPoints) },
          ],
          temperature: 0.8,
          ...reasoningParams(llmConfig.baseUrl),
        }),
      llmConfig,
    );
    const text = response.choices[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return apiError(req, "The AI did not return a valid template recipe, please try again", 502);
    }
    const template = sanitizeCustomAdTemplate(JSON.parse(text.slice(start, end + 1)));
    if (!template) {
      return apiError(req, "Could not parse the AI's recipe, please try again", 502);
    }
    return NextResponse.json({ template });
  } catch (error) {
    console.error("AI custom template generation failed:", error);
    const { en } = llmErrorPair(error);
    return apiError(req, `AI template generation failed: ${en}`, 500);
  }
}
