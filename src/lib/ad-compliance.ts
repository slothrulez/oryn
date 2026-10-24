/**
 * Ad-law compliance check for e-commerce scripts — scans already-generated script copy for terms
 * that may violate advertising rules (FTC / ASA / platform ad policies). The script engine prompt only asks the LLM to avoid
 * them, but the LLM still misses some; this provides a safety-net check on the actual output
 * before rendering. Hits surface a warning + revision suggestion (not a hard block — user decides).
 * Pure function, unit-testable, zero external keys, decoupled from the compose pipeline.
 */

export type AdViolationCategory = "Absolute claim" | "Medical/false efficacy" | "Certification claim" | "False urgency";

export interface AdViolation {
  term: string;
  category: AdViolationCategory;
  severity: "high" | "med";
  suggestion: string;
}

interface Rule {
  terms: string[];
  category: AdViolationCategory;
  severity: "high" | "med";
  suggestion: string;
}

// Conservative term selection — only include terms that are almost certainly illegal in an e-commerce context, to minimize false positives (this is a warning tool, not a hard block).
const RULES: Rule[] = [
  {
    // Absolute superlatives and unprovable "#1" claims (FTC / ASA substantiation rules; price absolutes are a top enforcement target).
    // Longest-match dedup below collapses e.g. "lowest price ever" → one hit instead of overlapping ones.
    terms: [
      "best in the world", "world's best", "the best ever", "number one", "#1 rated", "#1 best", "100% guaranteed",
      "guaranteed results", "works for everyone", "never fails", "unbeatable", "best-selling of all time",
      "lowest price ever", "lowest price anywhere", "cheapest anywhere", "all-time low",
    ],
    category: "Absolute claim",
    severity: "high",
    suggestion: "Unsubstantiated absolute claims are prohibited; use relative wording such as \"one of the\", \"more\" or \"loved by many\"",
  },
  {
    terms: [
      "cures", "cure for", "heals", "treats disease", "instant results", "results in 3 days", "results in 7 days",
      "never comes back", "eliminates completely", "anti-cancer", "anti-inflammatory", "kills bacteria", "prescription strength",
      "medical grade", "clinically proven",
    ],
    category: "Medical/false efficacy",
    severity: "high",
    suggestion: "Ordinary products must not claim medical / treatment / cure effects; remove them or describe your real experience instead",
  },
  {
    terms: ["all natural", "100% natural", "no additives", "zero additives", "certified organic"],
    category: "Certification claim",
    severity: "med",
    suggestion: "\"All natural / organic / no additives\" needs an authoritative certification or test basis; remove it if you have none",
  },
  {
    // Fake scarcity / urgency is a platform marketing violation (throttling + penalties). These phrases are legal only when the promotion is real and provable,
    // so they are warnings (med), not hard blocks.
    terms: ["last day", "today only", "never again", "price goes up tomorrow", "back to full price tomorrow", "only a few left", "last few units"],
    category: "False urgency",
    severity: "med",
    suggestion: "Fake time or stock limits are a platform marketing violation (throttling + penalties); remove them unless the promotion is real and provable, and keep proof for real ones",
  },
];

/** Scans a text string and returns matched ad-law risk terms (deduplicated by term, high-severity first). */
export function checkAdCompliance(text: string): AdViolation[] {
  const clean = String(text || "").toLowerCase();
  if (!clean) return [];
  const seen = new Set<string>();
  const out: AdViolation[] = [];
  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (!seen.has(term) && clean.includes(term)) {
        seen.add(term);
        out.push({ term, category: rule.category, severity: rule.severity, suggestion: rule.suggestion });
      }
    }
  }
  // Remove shorter terms that are substrings of a longer matched term (e.g. "natural" subsumed by "100% natural") to avoid duplicate or contradictory hints for the same text span
  const terms = out.map((v) => v.term);
  const deduped = out.filter((v) => !terms.some((t) => t !== v.term && t.includes(v.term)));
  return deduped.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/** Scans all shots in a script (voiceover + text overlays) and returns deduplicated risk terms. */
export function checkScriptCompliance(shots: Array<{ voiceover?: string; textOverlay?: { text?: string } | null }>): AdViolation[] {
  const text = (shots || [])
    .flatMap((s) => [s.voiceover || "", s.textOverlay?.text || ""])
    .join(" \n ");
  return checkAdCompliance(text);
}
