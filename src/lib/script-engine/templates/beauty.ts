/**
 * Beauty & skincare category script templates
 * Classic viral script structures for skincare, makeup, beauty devices, etc.
 */

import type { Shot } from "@/lib/db/schema";

/** Script template structure for the beauty category */
export interface ScriptTemplate {
  /** template name */
  name: string;
  /** template description */
  description: string;
  /** applicable product types */
  suitableFor: string[];
  /** shot structure skeleton (no concrete copy) */
  shotStructure: Array<Pick<Shot, "type" | "duration" | "camera" | "transition">>;
  /** reference script example (used for few-shot prompting) */
  example: string;
}

export const beautyTemplates: ScriptTemplate[] = [
  {
    name: "Bare-face glow-up",
    description: "A bare-face vs finished-look reversal that uses visual impact to spark curiosity and desire",
    suitableFor: ["foundation", "concealer", "cushion compact", "tinted moisturizer"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Tight face close-up with slight handheld shake", transition: "direct_concat" },
      { type: "pain_point", duration: 4, camera: "Face close-up slowly pulling back", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product centered, rotating", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Hands applying close-up + split-screen face comparison", transition: "ai_start_end" },
      { type: "social_proof", duration: 3, camera: "Review screenshots / sales numbers flying in", transition: "ffmpeg_fade" },
      { type: "cta", duration: 4, camera: "Finished-look close-up dissolving to the product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Wait, don't scroll! Would you believe this is my bare skin?" (tight bare-face shot, blemishes clearly visible)
[Pain point] "Half an hour of makeup and my base still looks patchy and cakey? That used to be me..." (sigh)
[Product reveal] "Until I found this foundation" (product slides in from the bottom of the frame)
[Demo] "Watch — just one pump" (swatch on the back of the hand → apply → blend → split-screen bare vs finished)
[Social proof] "50k+ saves and a 92% repurchase rate" (numbers fly in)
[CTA] "Buy one get one free today — tap the link below before it sells out!" (finished-look close-up + product + price tag)`,
  },
  {
    name: "Ingredient deep-dive",
    description: "Lead with ingredient science, build expert trust, then recommend the product",
    suitableFor: ["serum", "moisturizer", "sunscreen", "eye cream", "sheet mask"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Close-up of the ingredient list", transition: "direct_concat" },
      { type: "pain_point", duration: 4, camera: "Close-up of the skin concern", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 4, camera: "Full product shot + ingredient graphics flying in", transition: "ai_start_end" },
      { type: "demo", duration: 7, camera: "Texture shot + applying to the face", transition: "ai_start_end" },
      { type: "social_proof", duration: 3, camera: "Before/after comparison", transition: "ffmpeg_fade" },
      { type: "cta", duration: 4, camera: "Product + price card", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "A serum with 10% niacinamide — is that even safe? That's a serious dose!" (ingredient list close-up)
[Pain point] "Seasonal breakouts, dull skin, and hundreds of dollars spent with nothing to show for it" (redness and dullness close-up)
[Product reveal] "This serum's core actives are niacinamide, tranexamic acid and licorice root" (product close-up + ingredient graphic)
[Demo] "It's a watery texture that disappears on the skin" (drop on the back of the hand → show how it flows → press into the face)
[Social proof] "After 28 days the dullness is visibly brighter" (before/after photos)
[CTA] "$49 at the flagship store, $29 here, with three travel minis free!" (price card pops in)`,
  },
  {
    name: "One-swipe color",
    description: "Use the instant visual change from one swipe of product to create impact",
    suitableFor: ["lip gloss", "blush", "eyeshadow", "hair color", "whitening strips"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Close-up at the moment of application", transition: "ai_start_end" },
      { type: "pain_point", duration: 3, camera: "Medium shot of the bare look", transition: "direct_concat" },
      { type: "product_reveal", duration: 3, camera: "Product macro + texture", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Application close-up + color change", transition: "direct_concat" },
      { type: "cta", duration: 3, camera: "Full finished face + product + price", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "This color is unreal!" (lip close-up, the gloss changes color in one swipe)
[Pain point] "Bare lips make me look so washed out and tired" (bare lips shown)
[Product reveal] "This lip gloss in shade 208, Peach Oolong" (product rotates + loaded applicator close-up)
[Demo] "One thin layer is a soft nude, build it up for a bold red!" (applying → sheer → layered → every angle)
[CTA] "$5 off today plus a free matching lip liner — tap the link!" (finished look + price pop-up)`,
  },
  {
    name: "Date-night tutorial",
    description: "A scene-based tutorial that weaves the product into a practical makeup look",
    suitableFor: ["makeup set", "eyeshadow palette", "lipstick", "highlighter", "setting spray"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Finished-look close-up (flash-forward)", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Pre-date nerves scene", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Products lined up on the vanity", transition: "ai_start_end" },
      { type: "demo", duration: 10, camera: "Step-by-step tutorial close-ups", transition: "direct_concat" },
      { type: "social_proof", duration: 3, camera: "Comments / a friend's reaction", transition: "ffmpeg_fade" },
      { type: "cta", duration: 3, camera: "Product lineup + offer", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Wear this look on a date and they won't stop looking at you!" (finished look, slow-motion head turn and smile)
[Pain point] "My hands shake every time I do my makeup before a date — I'm scared it'll look like I tried too hard..." (anxious look in the mirror)
[Product reveal] "Today's date look uses just these 4 things" (top-down shot of 4 products on the vanity)
[Demo] "Base → eyes → blush → lips, 30 seconds each" (fast-forward tutorial + product name captions)
[Social proof] "Last time I wore this, my friends asked if I was in love, haha" (chat screenshot / comments fly in)
[CTA] "All 4 bundled for one price, plus a free makeup bag!" (product set + price tag)`,
  },
];

/** Prompt directive specific to this category */
export const beautyPromptDirective = `
You are writing a commerce short-video script for the [Beauty & skincare] category. Keep in mind:
1. Visual impact is everything: before/after comparisons, texture close-ups and color swatches are the key shots
2. Ingredients and benefits must be specific; avoid prohibited claims (e.g. "medical grade", "cures")
3. Make the feel concrete: "silky", "weightless", "second-skin" persuade better than "works well"
4. Describe colors and lighting precisely so AI can generate the assets
5. Target audience: women 18-35 who care about value and real results
6. Tone: like chatting with a best friend — sincere, not fake; light internet slang is fine
`;
