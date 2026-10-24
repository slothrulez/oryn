/**
 * AI + real-footage mix metering — the measurable core of the "hybrid mode" strategy.
 *
 * Why: Short-video platforms' recommendation weighting tends to favor AI+real hybrid content (real-footage
 * share ≥50% earns a traffic tilt), while pure-AI videos remain publishable when labeled. The
 * filling mechanics already exist (product photos, user uploads, free real-shot stock, local
 * pool) — what was missing is the metric: how real is this video, per shot and overall?
 *
 * Classification leans on data the pipeline already persists:
 *   assets.type  ai_generated → AI;  product_image / user_upload / stock_footage → real
 *   (stock sources are real-shot footage by real people; product photos are the user's own)
 * Product-image shots resolved without a persisted asset row count as real too.
 *
 * Duration-weighted (a 2s AI transition matters less than a 6s AI talking head). Pure functions;
 * the gate route and the assets page share them. Informative only — never used to block or warn.
 */

/** Per-shot reality: "real" (shot footage/photo), "ai" (generated), or null (nothing filled yet). */
export type ShotReality = "real" | "ai" | null;

/** Classify one shot from its persisted asset type + script visual source. */
export function shotReality(opts: {
  visualSource?: string | null;
  assetType?: string | null;
  /** whether the shot has a usable (done) asset */
  done: boolean;
}): ShotReality {
  if (opts.done && opts.assetType) {
    return opts.assetType === "ai_generated" ? "ai" : "real";
  }
  // Product-image shots resolve straight from the user's own product photo (no asset row persisted)
  if (opts.visualSource === "product_image") return "real";
  return null;
}

export interface RealMixReport {
  totalSec: number;
  realSec: number;
  aiSec: number;
  /** Seconds of shots with nothing filled yet (excluded from the ratio) */
  unfilledSec: number;
  /** realSec / (realSec + aiSec); null when nothing is filled */
  realRatio: number | null;
  /** ≥50% real (duration-weighted) — the hybrid-content distribution threshold */
  tiltEligible: boolean;
  message: { en: string };
}

/** Compute the duration-weighted real/AI mix over classified entries. */
export function computeRealMix(entries: Array<{ duration: number; reality: ShotReality }>): RealMixReport {
  let realSec = 0;
  let aiSec = 0;
  let unfilledSec = 0;
  for (const e of entries) {
    const d = Math.max(0, e.duration || 0);
    if (e.reality === "real") realSec += d;
    else if (e.reality === "ai") aiSec += d;
    else unfilledSec += d;
  }
  const filled = realSec + aiSec;
  const realRatio = filled > 0 ? realSec / filled : null;
  const tiltEligible = realRatio != null && realRatio >= 0.5;

  let message: { en: string };
  if (realRatio == null) {
    message = {
      en: "No visuals yet — once shots are filled this shows the real/AI split (platforms tend to favor AI+real hybrid content)",
    };
  } else {
    const realPct = Math.round(realRatio * 100);
    const aiPct = 100 - realPct;
    const unfilledEn = unfilledSec > 0 ? ` (${Math.round(unfilledSec)}s of shots still unfilled, excluded)` : "";
    if (tiltEligible) {
      message = {
        en: `Real/own footage ≈${realPct}% (duration-weighted) — hybrid threshold met; platforms tend to favor mixed real/AI content${unfilledEn}`,
      };
    } else {
      message = {
        en: `Real ≈${realPct}%, AI ≈${aiPct}% — swapping some shots to real/uploaded/free real-shot footage to reach ≥50% tends to earn better distribution on platforms that favor mixed content (optional; labeled pure-AI is still publishable)${unfilledEn}`,
      };
    }
  }

  return { totalSec: realSec + aiSec + unfilledSec, realSec, aiSec, unfilledSec, realRatio, tiltEligible, message };
}

/** Convenience for assets-page view rows (AssetItem-shaped objects). */
export function realMixFromRows(
  rows: Array<{ duration: number; visualSource?: string | null; assetType?: string | null; status: string }>
): RealMixReport {
  return computeRealMix(
    rows.map((r) => ({
      duration: r.duration,
      reality: shotReality({ visualSource: r.visualSource, assetType: r.assetType, done: r.status === "done" }),
    }))
  );
}
