/**
 * Food & snacks category script templates
 * Classic viral script structures for snacks, drinks, ready meals, etc.
 */

import type { ScriptTemplate } from "./beauty";

export const foodTemplates: ScriptTemplate[] = [
  {
    name: "Bite-and-react",
    description: "Lead with a satisfying first bite and a genuine reaction to trigger cravings",
    suitableFor: ["snacks", "desserts", "jerky", "chips", "candy"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Macro of the first bite, slow motion", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Medium shot of a bored afternoon at the desk", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Package rotating + opening", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Texture close-ups: crunch, pull, crumbs", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Product + price card", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Listen to that crunch!" (slow-motion macro of the first bite)
[Pain point] "3pm at the office and I'm starving, but everything in the vending machine is boring" (slumped at the desk)
[Product reveal] "These are the chips my whole office is obsessed with" (package opens, chips spill out)
[Demo] "Thin, crispy, and that seasoning hits every time" (close-ups of the texture and seasoning)
[CTA] "A 10-pack for under $15 today — link below!" (product + price card)`,
  },
  {
    name: "Kitchen shortcut",
    description: "Show a ready meal or ingredient saving real time in a believable everyday scene",
    suitableFor: ["ready meals", "instant noodles", "sauces", "frozen dumplings", "meal kits"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Top-down shot of a finished dish", transition: "direct_concat" },
      { type: "pain_point", duration: 4, camera: "Tired person opening an empty fridge", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product on the counter", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Step-by-step cooking close-ups", transition: "direct_concat" },
      { type: "social_proof", duration: 3, camera: "Reviews flying in", transition: "ffmpeg_fade" },
      { type: "cta", duration: 3, camera: "Finished dish + product", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Dinner in 5 minutes that looks like takeout!" (top-down shot of a steaming bowl)
[Pain point] "Home late, exhausted, and nothing in the fridge" (fridge light on an empty shelf)
[Product reveal] "This is my weeknight backup" (product placed on the counter)
[Demo] "Boil, add the sauce pack, toss — done" (pot, sauce pour, tossing close-ups)
[Social proof] "Over 20,000 five-star reviews" (review cards fly in)
[CTA] "Stock up now — the bundle is 30% off today!" (finished dish + product)`,
  },
  {
    name: "Taste-test comparison",
    description: "A side-by-side taste test against the usual option to prove the difference",
    suitableFor: ["coffee", "tea", "juice", "honey", "olive oil"],
    shotStructure: [
      { type: "hook", duration: 3, camera: "Two cups side by side", transition: "direct_concat" },
      { type: "pain_point", duration: 3, camera: "Grimace at a bland drink", transition: "ffmpeg_fade" },
      { type: "product_reveal", duration: 3, camera: "Product pour in slow motion", transition: "ai_start_end" },
      { type: "demo", duration: 8, camera: "Color, aroma and texture comparison", transition: "direct_concat" },
      { type: "cta", duration: 4, camera: "Product + price", transition: "ffmpeg_fade" },
    ],
    example: `[Golden 3s] "Can you taste a $2 difference? I couldn't believe it either" (two cups side by side)
[Pain point] "My usual coffee tastes flat and burnt" (grimace after a sip)
[Product reveal] "Then I tried these beans" (slow-motion pour)
[Demo] "Look at the crema, smell that — and it's actually smooth" (color, steam and sip close-ups)
[CTA] "Free shipping and a free mug with your first bag!" (product + price)`,
  },
];

/** Prompt directive specific to this category */
export const foodPromptDirective = `
You are writing a commerce short-video script for the [Food & snacks] category. Keep in mind:
1. Appetite appeal is everything: steam, crunch, pulls, pours and macro textures are the key shots
2. Describe taste and texture concretely ("shatteringly crisp", "silky", "rich but not heavy")
3. Never make health or medical claims; stick to taste, convenience and ingredients
4. Show real eating moments: at the desk, on the couch, with friends
5. Describe lighting warmly and precisely so AI can generate appetizing assets
6. Tone: excited and genuine, like recommending a find to a friend
`;
