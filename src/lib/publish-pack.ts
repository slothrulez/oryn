/**
 * Key-free publish copy pack — works on the export page as "copy and post" even without an LLM configured.
 * Maps category + platform to trending hashtags and assembles titles and promo copy using pain-point / number / emotion hook templates.
 * Pure function, deterministic (same input → same output), unit-testable; users with an LLM still go through /api/llm/publish for higher-quality copy.
 */

import { buildShopLink } from "@/lib/shop-link";

export interface PublishPack {
  titles: string[];
  hashtags: string[]; // already prefixed with # and deduplicated
  caption: string;
  /** UTM-tagged storefront link (only present when a shopUrl was provided) — creators paste it where the platform allows (bio / cart / description) */
  shopLink?: string;
  /** platform AI-disclosure kit: why to declare + a paste-ready caption line (2026: TikTok auto-flags
   * undeclared AI content and throttles it; TikTok C2PA-detects and suppresses 50-70% — self-declaring
   * barely affects reach on either) */
  aiDeclaration: { notice: string; line: string };
  /** comment-section ops kit — the video's second landing page (buyers read comments before ordering) */
  commentKit: CommentKit;
}

/**
 * Comment-section operating material shipped WITH the video (2026 survey: TikTok now frames the
 * comment section as a commerce engine, and a maintained vs. unmaintained comment section converts on a different order of
 * magnitude at the same view count — yet no video tool ships this).
 */
export interface CommentKit {
  /** pinned self-Q&A: pre-answers the #1 purchase blocker from the creator's own experience */
  pinned: string;
  /** reply templates for the recurring objections (price / effectiveness / hesitation) */
  objections: { q: string; a: string }[];
  /** compliance note — atmosphere comments need a real experience behind them; fabricated
   * customer testimonials are an enforcement target on every platform */
  notice: string;
}

export interface PublishPackInput {
  productName?: string;
  category?: string; // beauty/food/home/fashion/digital/other
  sellingPoints?: string; // selling points / description, may be multiple sentences
  platform?: string; // tiktok/reels/shorts
  locale?: "en"; // copy language; English only
  shopUrl?: string; // storefront link to drive buyers to (from ingest or set manually); UTM-tagged into shopLink
  affiliateCode?: string; // optional affiliate/partner code for commission tracking
}

// Category trending hashtags (English TikTok/Reels commerce context)
const CATEGORY_TAGS_EN: Record<string, string[]> = {
  beauty: ["BeautyTok", "SkincareRoutine", "MakeupHacks", "BeautyFinds", "GlowUp", "TikTokMadeMeBuyIt"],
  food: ["FoodTok", "FoodieFinds", "SnackHaul", "TikTokFood", "MustTry", "TikTokMadeMeBuyIt"],
  home: ["HomeFinds", "HomeHacks", "CleanTok", "OrganizationTips", "CozyHome", "TikTokMadeMeBuyIt"],
  fashion: ["OOTD", "FashionTok", "StyleInspo", "OutfitIdeas", "FashionFinds", "TikTokMadeMeBuyIt"],
  digital: ["TechTok", "GadgetFinds", "TechReview", "CoolGadgets", "Innovation", "TikTokMadeMeBuyIt"],
  other: ["TikTokMadeMeBuyIt", "MustHave", "ProductReview", "WorthIt", "TikTokFinds", "DailyFinds"],
};

// Platform trending hashtags
const PLATFORM_TAGS: Record<string, string[]> = {
  tiktok: ["TikTokMadeMeBuyIt", "TikTokShop"],
  reels: ["Reels", "InstagramReels", "ReelsFinds"],
  shorts: ["Shorts", "YouTubeShorts"],
};

/** Extract the first selling point: split on CJK/ASCII punctuation and newlines, trim whitespace, clip to max length (English points are longer, so max is tunable) */
function firstSellingPoint(sp: string | undefined, max: number): string {
  if (!sp) return "";
  const first = sp.split(/[\u3002.,\uff0c;\uff1b\n\u3001]/).map((s) => s.trim()).find((s) => s.length > 0) || "";
  return clip(first, max);
}

/** Clip by approximate display width (CJK counts as 1 character, prevents titles from being too long) */
function clip(s: string, max: number): string {
  const arr = Array.from(s.trim());
  return arr.length <= max ? s.trim() : arr.slice(0, max).join("").trim();
}

/**
 * Build the LLM prompt for publish copy (used by users who have an LLM configured for higher-quality results).
 * Always produces English TikTok/Reels/Shorts copy.
 * Pure function; prompt content is deterministically unit-testable (LLM output itself requires a key and is not tested here).
 */
export function buildPublishPrompt(
  input: { productName: string; category?: string; productDescription?: string; platform?: string },
  locale: "en" = "en"
): string {
  const { productName, category, productDescription, platform } = input;
  void locale;
  {
    const platformHint = platform ? `Target platform: ${platform}.` : "Target platform: TikTok / Reels / Shorts.";
    return `You are a seasoned e-commerce short-video marketer. Write publishing copy for the product below, entirely in ENGLISH. ${platformHint}
Product: ${productName}
${category ? `Category: ${category}\n` : ""}${productDescription ? `Selling points: ${productDescription}\n` : ""}
Output STRICT JSON only (no extra text):
{
  "titles": ["3 catchy short titles with emotion/pain-point/number hooks, each <= 60 chars"],
  "hashtags": ["6-10 hashtags with #, TikTok-style; the FIRST must be a product-specific/branded hashtag (the product name, no spaces) for keyword-search discovery, the rest matching category and platform trends"],
  "caption": "one-line caption, conversational, with a clear call to action, <= 150 chars; lead with the main product keyword in the first ~30 characters for search discoverability",
  "commentKit": {
    "pinned": "a pinned self-Q&A comment: raise THE question buyers hesitate on, answer it from the creator's first-person real experience, invite questions; <= 200 chars",
    "objections": [{ "q": "recurring objection (price / does it work / hesitation)", "a": "friendly first-person reply, honest, no invented claims, <= 120 chars" }]
  }
}
commentKit rules: comments are the video's second landing page. 2-3 objections. NEVER write fake customer testimonials or seeded "I bought it and love it" comments — first-person creator replies only.`;
  }
}

// Title hook pools — every template embeds the product name; point-requiring ones are dropped when no selling point.
// A varied pool (vs 3 fixed titles) avoids identical hooks across a creator's many videos.
const TITLE_POOL_EN: Array<{ needsPoint?: boolean; render: (n: string, p: string) => string }> = [
  { render: (n) => `This ${n} is a total game-changer 🤯` },
  { needsPoint: true, render: (n, p) => `${n} — ${p}, you'll want one` },
  { render: (n) => `3 reasons to grab the ${n}` },
  { render: (n) => `I can't stop using this ${n}` },
  { render: (n) => `Why is everyone obsessed with ${n}?` },
  { render: (n) => `The ${n} you won't regret buying` },
  { needsPoint: true, render: (n, p) => `${n}: ${p}` },
  { render: (n) => `Don't buy another until you've seen this ${n}` },
];

/** Deterministic string hash (stable per input, so the same product always gets the same titles). */
function hashStr(s: string): number {
  let h = 0;
  for (const c of s) h = (h + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Pick 3 distinct, varied title hooks from the pool (deterministic by name; drops point-requiring templates when no point). */
export function pickTitles(name: string, point: string): string[] {
  const pool = TITLE_POOL_EN.filter((t) => point || !t.needsPoint);
  const start = hashStr(name) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const s = pool[(start + i) % pool.length].render(name, point);
    out.push(clip(s, 60));
  }
  return out;
}

/**
 * Key-free comment-section ops kit (deterministic templates; the LLM publish path produces a
 * tailored version through the same JSON contract). Deliberately ships NO "seed comments" —
 * fabricated bought-it/love-it comments are astroturfing and an enforcement target; a pinned
 * self-Q&A and objection reply templates are legitimate customer-service material.
 */
export function buildCommentKit(input: PublishPackInput): CommentKit {
  const name = clip((input.productName || "").trim() || "this find", 40);
  const point = firstSellingPoint(input.sellingPoints, 40);
  return {
      pinned: `Most-asked question first: is the ${name} actually worth it? I've been using it myself${point ? ` — ${point}` : ""}, ask me anything below 👇`,
      objections: [
        {
          q: "Too expensive / not worth it",
          a: `Break it down per use and it's less than a coffee — and you can return it if it's not for you.`,
        },
        {
          q: "Does it really work?",
          a: `Fair question — the video shows exactly how I use it${point ? ` (${point})` : ""}. Happy to post a follow-up after longer use.`,
        },
        {
          q: "Still hesitating",
          a: `No rush — save this video, check the reviews, and grab it when you're ready.`,
        },
      ],
      notice:
        "Reply with your real experience only — fabricated customer testimonials and seeded fake comments are an enforcement target on every platform.",
  };
}

export function buildPublishPack(input: PublishPackInput): PublishPack {
  const name = clip((input.productName || "").trim() || "this find", 40);
  const cat = (input.category || "other").toLowerCase();
  const point = firstSellingPoint(input.sellingPoints, 40);

  // Titles: pick 3 varied hooks from the pool (deterministic per product, so a creator's many videos don't share identical titles)
  const titles = pickTitles(name, point);

  // Hashtags: product-specific tag + category + platform, deduplicated, prefixed with #, capped at ~10.
  // Product-specific tag goes first — in 2026, TikTok discovery relies heavily on product keywords;
  // generic category tags give broad but unfocused exposure.
  // Adding a product-name tag lets people searching for that exact product find your video directly.
  const platform = (input.platform || "").toLowerCase();
  const catTags = CATEGORY_TAGS_EN;
  const rawName = (input.productName || "").trim();
  // Strip spaces/punctuation from the product name (hashtags cannot contain spaces); keep only letters and digits; clip to max length
  const productTag = rawName ? `#${clip(rawName.replace(/[^\p{L}\p{N}]/gu, ""), 24)}` : "";
  const tagWords = [
    ...(catTags[cat] || catTags.other),
    ...(PLATFORM_TAGS[platform] || []),
  ];
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const tag of [productTag, ...tagWords.map((w) => `#${w}`)]) {
    if (!tag || tag === "#" || seen.has(tag)) continue;
    seen.add(tag);
    hashtags.push(tag);
    if (hashtags.length >= 10) break;
  }

  // Promo caption: conversational + call to action. Clip the lead phrase first, then append the fixed CTA so the CTA tail is never truncated
  const cta = " — tap the link below to grab it 🛒";
  const lead = `Obsessed with ${name}${point ? ", " + point : ""}`;
  const capMax = 130;
  const caption = clip(lead, capMax - Array.from(cta).length) + cta;

  // UTM-tagged storefront link (only when a shopUrl was supplied) so the creator can attribute traffic per platform
  const shopLink = buildShopLink(input.shopUrl, { platform, affiliateCode: input.affiliateCode });

  return {
    titles,
    hashtags,
    caption,
    aiDeclaration: buildAiDeclaration(),
    commentKit: buildCommentKit(input),
    ...(shopLink && { shopLink }),
  };
}

/**
 * Platform AI-disclosure kit — platforms now auto-detect undeclared AI content (TikTok C2PA-flags and suppresses reach 50-70%), while self-declared
 * content distributes normally. Standalone so both the key-free pack and the LLM publish path use it.
 */
export function buildAiDeclaration(): { notice: string; line: string } {
  return {
    notice:
      'Turn on the platform\'s "AI-generated content" toggle when posting — undeclared AI content gets auto-flagged and suppressed (TikTok C2PA detection); self-declared content distributes normally.',
    line: "Contains AI-generated content",
  };
}
