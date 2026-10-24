/**
 * Fashion & accessories category script templates
 * Classic viral script structures for clothing, shoes, bags, jewelry, etc.
 */

import type { ScriptTemplate } from "./beauty";

export const fashionTemplates: ScriptTemplate[] = [
  {
    name: "Outfit transformation",
    description: "A quick before/after outfit change that shows how the item lifts a look",
    suitableFor: ["dresses", "jackets", "jeans", "sets"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Full-body transition cut", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Staring at a full closet", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Item on a hanger, rotating", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Mirror try-on, multiple angles", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Final look + product + price", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "From 'nothing to wear' to this in one step" (full-body transition cut)
[Pain point] "A closet full of clothes and still nothing goes together" (staring at the closet)
[Product reveal] "This blazer fixes that" (blazer on a hanger)
[Demo] "Over a tee, over a dress, with jeans — it works with everything" (three quick looks)
[CTA] "Under $60 today in four colors — link below!" (final look + price)`,
  },
  {
    name: "Fabric close-up",
    description: "Prove quality through fabric, stitching and fit details",
    suitableFor: ["knitwear", "shirts", "activewear", "leather goods"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Macro of the fabric texture", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Pilling on an old sweater", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Item laid flat", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Stretch, stitching and fit close-ups", transition: "direct_concat" },
      { type: "social_proof", duration: 3, camera: "Reviews flying in", transition: "ffmpeg_fade" },
      { type: "cta", duration: 3, camera: "Worn look + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Look how dense this knit is" (fabric macro)
[Pain point] "My old sweaters pill after two washes" (pilling close-up)
[Product reveal] "This one is 100% merino" (sweater laid flat)
[Demo] "Stretches and bounces back, clean double stitching" (stretch and seam close-ups)
[Social proof] "Still like new after 20 washes, say reviewers" (review cards)
[CTA] "Free returns and 20% off this week!" (worn look + product)`,
  },
  {
    name: "One item, three ways",
    description: "Style one versatile piece three ways to prove its value",
    suitableFor: ["bags", "scarves", "sneakers", "jewelry"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Fast three-look montage", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Pile of rarely used items", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product close-up", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Three outfits with the item", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Product + price", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "One bag, three completely different looks" (fast montage)
[Pain point] "I keep buying bags I only use once" (pile of bags)
[Product reveal] "This one goes with everything" (bag close-up)
[Demo] "Office, weekend, date night" (three outfits)
[CTA] "Today's price won't last — tap the link!" (product + price)`,
  },
];

/** Prompt directive specific to this category */
export const fashionPromptDirective = `
You are writing a commerce short-video script for the [Fashion & accessories] category. Keep in mind:
1. On-body try-ons, transitions and fabric close-ups are the key shots
2. Describe fit, fabric and color concretely ("relaxed drop shoulder", "heavyweight cotton", "warm camel")
3. Show versatility with multiple quick looks
4. Describe outfits, poses and lighting precisely so AI can generate the assets
5. Target audience: style-conscious 18-35s who want looks that are easy to wear
6. Tone: confident and fun, like a stylish friend giving advice
`;
