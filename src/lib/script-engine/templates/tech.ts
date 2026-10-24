/**
 * Tech & electronics category script templates
 * Classic viral script structures for gadgets, accessories, audio, smart home, etc.
 */

import type { ScriptTemplate } from "./beauty";

export const techTemplates: ScriptTemplate[] = [
  {
    name: "Gadget unboxing",
    description: "A crisp unboxing that builds anticipation, then shows the key feature in action",
    suitableFor: ["earbuds", "chargers", "smartwatches", "phone accessories"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Box lid lifting, macro", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Tangled cables / dead phone", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Device rotating on a dark background", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Key feature in action", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Product + price card", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "This tiny thing replaced three chargers on my desk" (box lid lifts, macro)
[Pain point] "A mess of cables and my phone still dies by noon" (tangled cables)
[Product reveal] "A 65W charger that fits in my palm" (device rotating)
[Demo] "Laptop, phone and earbuds — all at once" (charging three devices)
[CTA] "Under $40 today — link below!" (product + price card)`,
  },
  {
    name: "Spec showdown",
    description: "Compare key specs against a typical alternative with a clear visual test",
    suitableFor: ["power banks", "speakers", "keyboards", "webcams"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Two devices side by side", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Frustration with the old device", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product hero shot", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Side-by-side test close-ups", transition: "direct_concat" },
      { type: "social_proof", duration: 3, camera: "Rating card", transition: "ffmpeg_fade" },
      { type: "cta", duration: 3, camera: "Product + price", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Same price, double the battery — let's test it" (two power banks side by side)
[Pain point] "My old one barely charges my phone once" (low-battery warning)
[Product reveal] "This one is 20,000 mAh and still slim" (hero shot)
[Demo] "Phone fully charged three times, and it's still at 20%" (side-by-side test)
[Social proof] "4.7 stars from over 10,000 reviews" (rating card)
[CTA] "Grab it at today's price — tap the link!" (product + price)`,
  },
  {
    name: "Desk setup upgrade",
    description: "Show how one gadget upgrades a familiar setup and daily workflow",
    suitableFor: ["monitor lights", "stands", "hubs", "smart plugs"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Before/after desk wide shot", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Eye strain in a dim room", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product being mounted", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Feature close-ups during use", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Upgraded desk + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "The $30 upgrade that fixed my late-night desk" (before/after wide shot)
[Pain point] "Working at night used to wreck my eyes" (rubbing eyes in a dim room)
[Product reveal] "This monitor light bar clips right on" (mounting it)
[Demo] "No glare on the screen, adjustable warmth, one touch" (feature close-ups)
[CTA] "Link below — it's on sale this week!" (upgraded desk + product)`,
  },
];

/** Prompt directive specific to this category */
export const techPromptDirective = `
You are writing a commerce short-video script for the [Tech & electronics] category. Keep in mind:
1. Unboxing, feature-in-action and side-by-side tests are the key shots
2. Translate specs into everyday benefits ("charges your phone 3 times", not just "20,000 mAh")
3. Use accurate numbers only; never invent specs or benchmarks
4. Describe materials, lighting and screens precisely so AI can generate the assets
5. Target audience: practical buyers who want reliable gear at a fair price
6. Tone: clear and confident, like a knowledgeable friend who tests everything
`;
