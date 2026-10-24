/**
 * Home & living category script templates
 * Classic viral script structures for household goods, storage, cleaning, kitchenware, etc.
 */

import type { ScriptTemplate } from "./beauty";

export const homeTemplates: ScriptTemplate[] = [
  {
    name: "Mess to tidy",
    description: "A before/after of a messy space solved by the product",
    suitableFor: ["storage boxes", "organizers", "hooks", "drawer dividers"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Wide shot of a cluttered space", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Hands digging through clutter", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product unfolding", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Time-lapse of organizing", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Tidy space + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "This was my closet an hour ago..." (wide shot of a cluttered closet)
[Pain point] "Every morning I dig for ten minutes just to find one shirt" (hands rummaging)
[Product reveal] "These foldable organizers changed everything" (organizer pops open)
[Demo] "Fold, slot, label — done" (time-lapse of organizing)
[CTA] "A set of 6 for under $20 — link below!" (tidy closet + product)`,
  },
  {
    name: "Cleaning test",
    description: "A live cleaning test that proves effectiveness on a real stain",
    suitableFor: ["cleaners", "mops", "sponges", "stain removers", "vacuums"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Close-up of a stubborn stain", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Scrubbing with no result", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product spray close-up", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "One-wipe result in close-up", transition: "direct_concat" },
      { type: "social_proof", duration: 3, camera: "Ratings flying in", transition: "ffmpeg_fade" },
      { type: "cta", duration: 3, camera: "Clean surface + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Can one wipe really get this off?" (close-up of a greasy stovetop)
[Pain point] "I've scrubbed this for weeks and it never comes clean" (scrubbing, no change)
[Product reveal] "Spray, wait ten seconds..." (spray mist close-up)
[Demo] "...and one wipe" (single wipe reveals a shiny surface)
[Social proof] "4.8 stars from 30,000 buyers" (rating card)
[CTA] "Two bottles for the price of one today!" (clean stovetop + product)`,
  },
  {
    name: "Small upgrade, big comfort",
    description: "Show how a small household item makes a daily routine noticeably nicer",
    suitableFor: ["bedding", "towels", "cushions", "lamps", "kitchen gadgets"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Soft morning light on the product", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Uncomfortable old item", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product texture macro", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Using it in a cozy routine", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Cozy scene + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "The cheapest upgrade that made my mornings better" (morning light on a fluffy towel)
[Pain point] "My old towels were scratchy and took forever to dry" (rough towel close-up)
[Product reveal] "These are thick, soft and quick-dry" (texture macro)
[Demo] "Look how much water it soaks up in one press" (absorbency demo)
[CTA] "A 4-piece set at today's price — tap the link!" (cozy bathroom + product)`,
  },
];

/** Prompt directive specific to this category */
export const homePromptDirective = `
You are writing a commerce short-video script for the [Home & living] category. Keep in mind:
1. Before/after contrast and live demos are the key shots
2. Tie every feature to a concrete daily scene (morning rush, small apartment, kids, pets)
3. Show measurable results (time saved, space freed, one-wipe cleaning) without exaggerating
4. Describe spaces, materials and lighting precisely so AI can generate the assets
5. Target audience: busy adults and families who value convenience and value for money
6. Tone: practical and warm, like a friend sharing a life hack
`;
