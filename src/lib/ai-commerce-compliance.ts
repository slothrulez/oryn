/**
 * AI-commerce policy guardrail — warn-only checks against the 2026-07 TikTok e-commerce rules for
 * AI-generated content. Nothing is blocked or removed: every style stays available, warnings
 * surface in the release gate so the user decides (per the "keep everything, warn only" directive).
 *
 * The three rules encoded here (all platform-verified 2026-07):
 * 1. TikTok explicitly forbids AI-GENERATED product comparison/review content — the comparison and
 *    unboxing script styles are exactly that form, so publishing them to TikTok risks takedowns.
 * 2. Digital humans are barred from five categories: medical, finance, beauty-efficacy,
 *    health-supplement-efficacy, education/training-outcome claims.
 * 3. An AI character claiming personal product experience ("tested it myself, it works") edges into the
 *    "fabricated usage results" red line — reword as recommendation-style copy.
 *
 * Pure functions, unit-testable; the gate route feeds it data.
 */

export type AiCommerceWarningId = "ai_review_style" | "digital_human_category" | "personal_testimony";

export interface AiCommerceWarning {
  id: AiCommerceWarningId;
  message: { en: string };
}

export interface AiCommerceInput {
  /** Script style key (styleType), e.g. "comparison" / "unboxing" / "drama" */
  styleType?: string | null;
  /** Whether an AI-generated person appears on camera (shot characterId / script cast / project presenter) */
  hasAiPerson: boolean;
  /** Product name + category text, for the banned-category scan */
  productText?: string;
  /** Voiceover/dialogue copy, for the personal-testimony scan */
  dialogueText?: string;
}

/** Script styles that read as product comparison/review content (TikTok bans these when AI-generated). */
export const AI_REVIEW_STYLES = new Set(["comparison", "unboxing"]);

/**
 * Digital-human banned categories on matched conservatively against product name/category
 * text — terms chosen to minimize false positives (this is a warning tool, not a hard block).
 */
export const DIGITAL_HUMAN_BANNED_CATEGORIES: Array<{
  label: { en: string };
  terms: string[];
}> = [
  {
    label: { en: "medical" },
    terms: ["medical", "medicine", "drug", "pharmaceutical", "hospital", "clinic", "therapy device", "physiotherapy"],
  },
  {
    label: { en: "finance" },
    terms: ["wealth management", "mutual fund", "stocks", "insurance", "loan", "credit card", "investing course"],
  },
  {
    label: { en: "beauty efficacy" },
    terms: ["skin whitening", "dark spot removal", "acne treatment", "anti-wrinkle", "fine lines", "breast enhancement", "weight loss", "slimming", "hair growth", "hair loss"],
  },
  {
    label: { en: "health-supplement efficacy" },
    terms: ["dietary supplement", "boosts immunity", "lowers blood pressure", "lowers blood sugar", "lowers cholesterol", "detox", "rebalances your body"],
  },
  {
    label: { en: "education/training outcomes" },
    terms: ["raise your score", "guaranteed pass", "pass guaranteed", "crash course", "admission rate"],
  },
];

/** Phrases where an AI character claims first-person product experience (fabricated-usage-results risk). */
export const PERSONAL_TESTIMONY_TERMS = [
  "i tested it",
  "tested and it works",
  "i used it for a week",
  "i used it for a month",
  "after three days",
  "i use it myself",
  "my personal pick",
  "my own experience",
];

/** Runs the three warn-only checks. Returns an empty array when nothing matches. */
export function checkAiCommerceCompliance(input: AiCommerceInput): AiCommerceWarning[] {
  const warnings: AiCommerceWarning[] = [];
  const style = (input.styleType || "").trim();
  const productText = (input.productText || "").toLowerCase();
  const dialogueText = (input.dialogueText || "").toLowerCase();

  // 1. AI-generated review/comparison content — applies to every AI-generated script regardless of
  // whether a person is on camera (the platform rule targets the content form, not the presenter)
  if (AI_REVIEW_STYLES.has(style)) {
    const styleName = style === "comparison" ? { en: "comparison review" } : { en: "unboxing review" };
    warnings.push({
      id: "ai_review_style",
      message: {
        en: `The "${styleName.en}" style is takedown-risky on TikTok: platform rules forbid AI-generated product comparison/review content. The style stays available — for prefer talking-head or drama styles, or publish this style elsewhere`,
      },
    });
  }

  // 2. Digital-human banned categories — only meaningful when an AI person fronts the video
  if (input.hasAiPerson && productText) {
    for (const cat of DIGITAL_HUMAN_BANNED_CATEGORIES) {
      const hit = cat.terms.find((t) => productText.includes(t));
      if (hit) {
        warnings.push({
          id: "digital_human_category",
          message: {
            en: `Product looks like the "${cat.label.en}" category (matched "${hit}"): TikTok bars digital humans from medical/finance/beauty-efficacy/health-efficacy/education-outcome content. Use a no-presenter product format, or confirm the category manually before publishing`,
          },
        });
        break; // one category warning is enough — avoid stacking near-duplicate lines
      }
    }
  }

  // 3. AI character claiming personal usage experience — fabricated-usage-results red line
  if (input.hasAiPerson && dialogueText) {
    const hit = PERSONAL_TESTIMONY_TERMS.find((t) => dialogueText.includes(t));
    if (hit) {
      warnings.push({
        id: "personal_testimony",
        message: {
          en: `AI-character dialogue contains a first-person testimony ("${hit}"): a fabricated usage claim by an AI character edges into the "fabricated usage results" red line. Reword as recommendation-style copy ("many users report", "worth trying")`,
        },
      });
    }
  }

  return warnings;
}
