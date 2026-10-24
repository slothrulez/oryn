// Onboarding example pack: sample products (one-click fill / import to product library), reference script structures, and homepage showcase.
// Note: these are "official examples", fully separated from user-created data and clearly labelled — they will never appear under "My Projects".
// Bilingual: copy is fetched by UI locale (getExampleProducts/Templates/Showcase(locale)).
import type { Shot } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";

// Example product categories (aligned with ProductItem.category in the product library)
export interface ExampleProduct {
  id: string;
  name: string;
  category: "beauty" | "food" | "home" | "fashion" | "tech" | "other";
  /** Selling-point description (also used as product library description / new-project form sellingPoints) */
  sellingPoints: string;
  price: string;
  /** Real product image bundled under public/examples */
  image: string;
}

const exampleProductsByLocale: Record<Locale, ExampleProduct[]> = {
  en: [
    {
      id: "ex-juicer",
      name: "Portable Juicer Cup",
      category: "tech",
      sellingPoints: "USB-rechargeable, juice on the go — a fresh cup in 30 seconds; a 6-blade head crushes ice and fruit; great at the office, gym, or on trips; the cup is fully washable for zero-hassle cleanup.",
      price: "29.99",
      image: "/examples/juicer.png",
    },
    {
      id: "ex-coffee",
      name: "Cold Brew Coffee Concentrate",
      category: "food",
      sellingPoints: "Zero sugar, zero fat — a cup in 3 seconds; tastes great hot or iced, with water or milk; single-serve packs you can carry anywhere; perfect for office pick-me-ups and low-sugar fitness routines.",
      price: "19.99",
      image: "/examples/coffee.png",
    },
    {
      id: "ex-tissue",
      name: "Soft Thick Facial Tissue",
      category: "home",
      sellingPoints: "Extra-thick 3-ply — won't tear or shed even when wet; virgin wood pulp, gentle on skin and safe for babies and moms; buying by the case is the best value — great for home, car, and office.",
      price: "9.99",
      image: "/examples/tissue.png",
    },
  ],
};

// Reference script structures (high-conversion commerce shot templates, used for the "showcase" display and new-user reference)
export interface ExampleTemplate {
  id: string;
  name: string;
  styleType: "pain_point" | "comparison" | "story";
  styleLabel: string;
  description: string;
  totalDuration: number;
  shots: Shot[];
}

const exampleTemplatesByLocale: Record<Locale, ExampleTemplate[]> = {
  en: [
    {
      id: "tpl-pain",
      name: "Pain-Point Hook · Golden 3 Seconds",
      styleType: "pain_point",
      styleLabel: "Pain-point",
      description: "Open with a sharp pain point in the first 3 seconds to grab attention, amplify the relatable scenario, present the product as the fix, then close with a limited-time offer. The most universal selling structure.",
      totalDuration: 28,
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "First-person quick cut-in, posing a sharp pain-point question", camera: "Handheld follow", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Are you fed up with ___ too?", prompt: "" },
        { shotId: 2, type: "pain_point", duration: 5, description: "Amplify the before-use pain scenario for resonance", camera: "Close-up", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Every time ___ — it's so frustrating", prompt: "" },
        { shotId: 3, type: "product_reveal", duration: 4, description: "Product enters, slow push-in on the packaging", camera: "Slow push-in", visualSource: "product_image", transition: "ai_start_end", voiceover: "Until I started using this", prompt: "" },
        { shotId: 4, type: "demo", duration: 8, description: "Real demo of the key selling point and results", camera: "Medium shot", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Look — ___, totally solved", prompt: "" },
        { shotId: 5, type: "cta", duration: 3, description: "Product + price + cart, drive the order", camera: "Static", visualSource: "product_image", transition: "direct_concat", voiceover: "Limited-time deal — grab it now!", prompt: "" },
      ],
    },
    {
      id: "tpl-compare",
      name: "Comparison Review · Side-by-side",
      styleType: "comparison",
      styleLabel: "Comparison",
      description: "Compare several options side by side, use real tests to highlight this product's edge, then back it with sales and reviews. Ideal for rational, research-heavy categories.",
      totalDuration: 30,
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "Several products side by side, teasing the review", camera: "Top-down wide", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Spent ___ testing 5 of them to tell you which is worth it", prompt: "" },
        { shotId: 2, type: "demo", duration: 9, description: "Compare the key metrics one by one", camera: "Close-up compare", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "The first one flops… this one's actually good?", prompt: "" },
        { shotId: 3, type: "product_reveal", duration: 4, description: "Our pick wins, close-up reveal", camera: "Push-in", visualSource: "product_image", transition: "ai_start_end", voiceover: "And the winner is this one", prompt: "" },
        { shotId: 4, type: "social_proof", duration: 6, description: "Sales data and review endorsement", camera: "Static", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "100k+ sold a month, 99% positive reviews", prompt: "" },
        { shotId: 5, type: "cta", duration: 3, description: "Order prompt and free-gift info", camera: "Static", visualSource: "product_image", transition: "direct_concat", voiceover: "Link's in the cart — order today and get a free gift", prompt: "" },
      ],
    },
    {
      id: "tpl-story",
      name: "Story · Immersive Scene",
      styleType: "story",
      styleLabel: "Story",
      description: "Wrap the product in a relatable little story — emotion first, selling points woven in naturally. Great for beauty, food, and other emotional categories.",
      totalDuration: 26,
      shots: [
        { shotId: 1, type: "hook", duration: 3, description: "Lead appears, a suspenseful opening", camera: "Front medium", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Something super awkward happened that day", prompt: "" },
        { shotId: 2, type: "pain_point", duration: 5, description: "The awkward/pain moment in the story", camera: "Close-up", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "I just wanted the ground to swallow me up", prompt: "" },
        { shotId: 3, type: "product_reveal", duration: 3, description: "The product appears as the turning point", camera: "Close-up", visualSource: "product_image", transition: "ai_start_end", voiceover: "Good thing I had this in my bag", prompt: "" },
        { shotId: 4, type: "demo", duration: 7, description: "After use, the story turns and results show", camera: "Medium shot", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "After using it, I felt so confident", prompt: "" },
        { shotId: 5, type: "cta", duration: 3, description: "Closing recommendation and order prompt", camera: "Static", visualSource: "product_image", transition: "direct_concat", voiceover: "Go for it — you won't regret it!", prompt: "" },
      ],
    },
  ],
};

// Homepage "Example Showcase": a complete viewable sample (script structure + pre-composed demo clip)
export interface ExampleShowcase {
  id: string;
  title: string;
  productName: string;
  category: string;
  styleLabel: string;
  totalDuration: number;
  resolution: string;
  aspectRatio: string;
  cover: string; // Cover image
  videoUrl: string; // Bundled demo clip
  shots: Shot[];
}

const exampleShowcaseByLocale: Record<Locale, ExampleShowcase> = {
  en: {
    id: "showcase-tissue",
    title: "Soft Thick Tissue · Pain-Point Hook",
    productName: "Soft Thick Facial Tissue",
    category: "Home",
    styleLabel: "Pain-point",
    totalDuration: 17,
    resolution: "1080p",
    aspectRatio: "9:16",
    cover: "/examples/tissue.png",
    videoUrl: "/examples/sample-tissue.mp4",
    shots: [
      { shotId: 1, type: "hook", duration: 4, description: "Living-room close-up of the tissue box, slow push-in", camera: "Slow push-in", visualSource: "product_image", transition: "ai_start_end", voiceover: "Still using tissues that tear at one wipe?", prompt: "" },
      { shotId: 2, type: "demo", duration: 5, description: "Water-absorption demo — won't tear when wet", camera: "Top-down close-up", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Thick 3-ply — won't tear even when wet", prompt: "" },
      { shotId: 3, type: "product_reveal", duration: 4, description: "Macro close-up of the tissue texture", camera: "Macro push-in", visualSource: "ai_generate", transition: "ai_start_end", voiceover: "Virgin wood pulp — gentle, no lint", prompt: "" },
      { shotId: 4, type: "cta", duration: 4, description: "Warm family use scene", camera: "Static", visualSource: "product_image", transition: "direct_concat", voiceover: "Buy by the case for the best value — grab it!", prompt: "" },
    ],
  },
};

// ===== Accessors =====
export function getExampleProducts(locale: Locale): ExampleProduct[] {
  return exampleProductsByLocale[locale] ?? exampleProductsByLocale.en;
}
export function getExampleTemplates(locale: Locale): ExampleTemplate[] {
  return exampleTemplatesByLocale[locale] ?? exampleTemplatesByLocale.en;
}
export function getExampleShowcase(locale: Locale): ExampleShowcase {
  return exampleShowcaseByLocale[locale] ?? exampleShowcaseByLocale.en;
}

// Default exports for callers that don't pass a locale
export const exampleProducts = exampleProductsByLocale.en;
export const exampleTemplates = exampleTemplatesByLocale.en;
export const exampleShowcase = exampleShowcaseByLocale.en;
