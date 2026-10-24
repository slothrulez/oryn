/**
 * Golden-3-second hook pattern library (e-commerce context).
 *
 * Treat a "hook" as a 3-second retention structure, not just a catchy line:
 *   0–1s stop the thumb → 1–3s prove relevance → 3–7s bridge to product;
 *   patterns are ranked by category preference and annotated with caution notes.
 *
 * Pure data + selection/render functions, unit-testable; injected into the LLM via script-engine prompts.
 */
import { categoryNameMap, type ProductCategory } from "./templates";

export interface HookPattern {
  id: string;
  name: string;
  /** 0–1s: how to stop the thumb */
  stop: string;
  /** 1–3s: how to prove relevance to the viewer */
  prove: string;
  /** 3–7s: how to naturally bridge to the product */
  bridge: string;
  /** arousal level: high is more attention-grabbing but riskier */
  arousal: "high" | "mid";
  /** strong-fit categories (matched entries take priority); omit = universal */
  categories?: ProductCategory[];
  /** situations to avoid (prevents awkward forced fits) */
  avoidWhen?: string;
  /** original example copy */
  example: string;
}

export const HOOK_PATTERNS: HookPattern[] = [
  {
    id: "visual_shock",
    name: "Visual shock",
    stop: "Open on an extreme visual (bursting, stretching, dirty-vs-clean, macro texture) with no buffer and no logo card",
    prove: "In seconds 1–3, make the visual about the viewer (is this what yours looks like right now?)",
    bridge: "The camera naturally lands on the product itself",
    arousal: "high",
    categories: ["beauty", "food", "home"],
    avoidWhen: "The product has no visual tension (pure numbers/services)",
    example: "Camera right on a tissue that tears instantly — is this what you're using at home?",
  },
  {
    id: "suspense_question",
    name: "Curiosity question",
    stop: "Open with a counter-intuitive, numeric or identity question people need answered",
    prove: "In seconds 1–3, make viewers think \"I want to know too\"",
    bridge: "The product is the answer to the question",
    arousal: "mid",
    avoidWhen: "The question is weak or the answer is obvious",
    example: "Why did my mom throw out the trick she used for thirty years?",
  },
  {
    id: "contrast",
    name: "Contrast",
    stop: "Create a sharp price/result/identity contrast in one visual or one line",
    prove: "The contrast challenges what viewers believe (that big a difference?)",
    bridge: "The product is the source of the contrast",
    arousal: "high",
    categories: ["beauty", "fashion", "tech"],
    avoidWhen: "There is no real, provable contrast (never exaggerate)",
    example: "Department-store price on the left, this on the right — you won't guess the difference.",
  },
  {
    id: "pain_strike",
    name: "Pain point strike",
    stop: "One line that hits a specific pain, worry or regret",
    prove: "In seconds 1–3, amplify that pain with an everyday scene",
    bridge: "The product solves the pain",
    arousal: "mid",
    categories: ["beauty", "home", "food"],
    avoidWhen: "The pain is too generic to sting anyone",
    example: "Still stressing over this? I already found the fix for you.",
  },
  {
    id: "before_after",
    name: "Before/after",
    stop: "Open on the worst \"before\" state",
    prove: "In seconds 1–3, cut to the \"after\" reversal",
    bridge: "The one extra step in between is the product",
    arousal: "high",
    categories: ["beauty", "home"],
    avoidWhen: "The change is subtle or can't be demonstrated",
    example: "Before it looked like this, after it looks like this — only one step in between.",
  },
  {
    id: "sound_hook",
    name: "Sound hook",
    stop: "A catchy sound in the first second (click, rip, pop, splash) matched to the visual",
    prove: "The sound leads into the use case",
    bridge: "The sound comes from the product in use",
    arousal: "mid",
    categories: ["food", "home", "tech"],
    avoidWhen: "The product has no signature sound",
    example: "(click) Just that — and half my chore is done.",
  },
  {
    id: "challenge_doubt",
    name: "Skeptic's test",
    stop: "A skeptical stance: \"Everyone says it's great. I don't buy it — testing it today\"",
    prove: "In seconds 1–3, set up the test on the spot",
    bridge: "The test result points to the product",
    arousal: "mid",
    avoidWhen: "There's no real test (don't fake it)",
    example: "Everyone online hypes this. I don't believe it, so I bought one to test.",
  },
  {
    id: "identity",
    name: "Identity",
    stop: "Call out an identity group (office workers, new parents, students)",
    prove: "In seconds 1–3, name the situation that group shares",
    bridge: "The product is made for them",
    arousal: "mid",
    categories: ["fashion", "beauty"],
    avoidWhen: "The identity doesn't match the category",
    example: "If you get home from work completely drained, this one's for us.",
  },
  {
    id: "number_benefit",
    name: "Number-first benefit",
    stop: "Open with a specific number (3 seconds / half the time / one move)",
    prove: "The number makes it feel worth watching",
    bridge: "The product delivers the number",
    arousal: "mid",
    categories: ["tech", "home"],
    avoidWhen: "The number is inflated (false advertising)",
    example: "One move, half the time — you'll have it down by the end of this.",
  },
  {
    id: "unexpected",
    name: "Counter-intuitive",
    stop: "Flip a belief: \"You think A, but actually B\"",
    prove: "In seconds 1–3, reveal the counter-intuitive truth",
    bridge: "The product embodies that truth",
    arousal: "mid",
    avoidWhen: "The twist is too far-fetched",
    example: "Think pricier is better? Here it's the exact opposite.",
  },
  // ---- 2026-08 additions: trust and social-proof hooks (backed by ad-account data: confession /
  // honest openings rank high in both usage and performance; non-stop praise is the first signal
  // viewers use to spot an ad) ----
  {
    id: "confession",
    name: "Confession",
    stop: "Confess a real near-miss first (almost returned it / used it wrong / overpaid before)",
    prove: "In seconds 1–3, state the turning point (until I realized...)",
    bridge: "The product saves the day in the twist",
    arousal: "mid",
    avoidWhen: "Inventing a mishap that never happened (fake stories get called out)",
    example: "I almost returned this — until I realized I'd been using it wrong.",
  },
  {
    id: "honest_flaw",
    name: "Honest flaw",
    stop: "Open by admitting one real flaw of the product",
    prove: "In seconds 1–3, explain why the flaw didn't stop you",
    bridge: "Pivot to the core strength that outweighs it",
    arousal: "mid",
    avoidWhen: "The flaw is serious (safety/efficacy issues are not a talking point)",
    example: "Flaw first: it's honestly ugly. I've still rebought it three times.",
  },
  {
    id: "elimination_haul",
    name: "Elimination test",
    stop: "Lead with the result: \"Bought N, returned N-1\"",
    prove: "In seconds 1–3, flash the eliminated alternatives (no brand names)",
    bridge: "The one that stayed is the star",
    arousal: "high",
    categories: ["beauty", "home", "food"],
    avoidWhen: "You haven't actually compared several (fake reviews break the rules)",
    example: "I bought five of these, returned three, shelved one — this is the one I kept.",
  },
  {
    id: "cost_math",
    name: "Cost breakdown",
    stop: "Break the price into a small everyday number (per day / per use)",
    prove: "In seconds 1–3, compare it to a familiar expense (a coffee, a breakfast)",
    bridge: "After the math, reveal the product",
    arousal: "mid",
    categories: ["home", "food", "tech"],
    avoidWhen: "The numbers or price are inaccurate (false advertising)",
    example: "Did the math: under ten cents a day — cheaper than my morning coffee.",
  },
  {
    id: "comment_reply",
    name: "Comment reply",
    stop: "Open by reading a skeptical comment or question (\"is this legit?\"); the whole video is the answer",
    prove: "In seconds 1–3, signal \"answering everyone today\"",
    bridge: "Answer the doubt with a demo/test; the product appears naturally",
    arousal: "mid",
    avoidWhen: "Swapping doubt for fake praise testimonials (platforms flag it; only use doubts/questions)",
    example: "Someone always asks if this is a waste of money — answering everyone today.",
  },
  {
    id: "hype_confirm",
    name: "Hype confirmed",
    stop: "Follower's view: \"Saw this N times and finally caved\"",
    prove: "In seconds 1–3, flip to \"now I get it\"",
    bridge: "Explain exactly what makes it good",
    arousal: "mid",
    avoidWhen: "The product has no real buzz (there's no hype to follow)",
    example: "Third time it showed up on my feed, I ordered it. Now I get it.",
  },
];

/** Look up a hook pattern's display name by its id (used to render performance-feedback hints); returns the id unchanged if unknown */
export function hookPatternName(id: string): string {
  return HOOK_PATTERNS.find((p) => p.id === id)?.name ?? id;
}

/** Category-preference hook selection: matched-category patterns first, then universal ones; deduplicated, top n returned */
export function selectHookPatterns(category: ProductCategory, n = 5): HookPattern[] {
  const matched = HOOK_PATTERNS.filter((p) => p.categories?.includes(category));
  const universal = HOOK_PATTERNS.filter((p) => !p.categories);
  const seen = new Set<string>();
  const out: HookPattern[] = [];
  for (const p of [...matched, ...universal]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Renders into a "three-beat structure + category-preference" prompt snippet for LLM injection.
 * With pinnedHookId (anti-homogenization batch rotation): only that pattern's card is shown and the
 * opening MUST use it — so each batch item gets a genuinely different hook mechanism instead of the
 * LLM free-picking the same favourite every time.
 */
export function buildHookGuidance(category: ProductCategory, n = 5, pinnedHookId?: string): string {
  const pinned = pinnedHookId ? HOOK_PATTERNS.find((p) => p.id === pinnedHookId) : undefined;
  const patterns = pinned ? [pinned] : selectHookPatterns(category, n);
  const cards = patterns
    .map(
      (p, i) =>
        `${i + 1}. [${p.name}]${p.arousal === "high" ? " (high arousal)" : ""}\n` +
        `   · 0–1s stop: ${p.stop}\n` +
        `   · 1–3s prove: ${p.prove}\n` +
        `   · 3–7s bridge: ${p.bridge}\n` +
        `   · Example: ${p.example}` +
        (p.avoidWhen ? `\n   · Caution: ${p.avoidWhen}` : "")
    )
    .join("\n\n");
  return `[Golden 3-second hook — design the opening with the three-beat structure]
A hook is not a witty line; it is a 3-second retention structure:
  0–1s stop the thumb (strong visual/sound/question; never open on a logo or empty shot)
  1–3s prove relevance (viewers instantly feel "this is about me")
  3–7s bridge naturally to the product / result

${
  pinned
    ? `This opening MUST use the following hook mechanism (assigned by anti-homogenization rotation; do not switch to another):`
    : `Preferred hook mechanisms for the "${categoryNameMap[category] || category}" category (pick one; when generating several scripts, use a different one for each so they can be A/B tested):`
}

${cards}`;
}
