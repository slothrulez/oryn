/**
 * Compliance / conversion overlays — optional burned-in layers reusing the composer's existing
 * textOverlay rendering pipeline. Pure functions, unit-testable.
 *  - Purchase CTA end-card: "tap the cart below"-style prompt over the last ~2.5s (conversion lever).
 *  - AI-content badge: a small "AI-generated" corner label over the opening seconds, matching the
 *    AI-content disclosure that TikTok, Instagram and YouTube ask for. This is the visible half —
 *    the file-metadata half lives in compliance-metadata.ts.
 */

export type OverlayStyle = "title" | "highlight" | "price" | "badge";
export interface ComplianceOverlay {
  text: string;
  style: OverlayStyle;
  startTime: number;
  endTime: number;
}
export interface ComplianceOverlayOpts {
  /** Purchase CTA text over the last ~2.5s; empty/absent adds nothing */
  ctaText?: string;
  /** Opening "AI-generated" badge (shown >= 2s); off by default, callers choose the default */
  aigcBadge?: boolean;
  /** Badge text override (default "AI-generated") */
  aigcBadgeText?: string;
}

const CTA_TAIL_SECONDS = 2.5;
// Badge display window: >= 2s; 4s leaves margin against player trimming/rounding
const AIGC_BADGE_SECONDS = 4;
export const AIGC_BADGE_DEFAULT_TEXT = "AI-generated";

/** Build compliance/conversion overlays from options; totalDuration is the real output length in seconds */
export function buildComplianceOverlays(opts: ComplianceOverlayOpts, totalDuration: number): ComplianceOverlay[] {
  const out: ComplianceOverlay[] = [];
  const total = Math.max(totalDuration, 0.1);

  if (opts.aigcBadge) {
    const text = (opts.aigcBadgeText || "").trim() || AIGC_BADGE_DEFAULT_TEXT;
    // Never below the 2s policy floor even on ultra-short clips (a <2s video shows it full-length)
    const dur = Math.min(Math.max(AIGC_BADGE_SECONDS, 2), total);
    out.push({ text, style: "badge", startTime: 0, endTime: Number(dur.toFixed(3)) });
  }

  const cta = (opts.ctaText || "").trim();
  if (cta) {
    const dur = Math.min(CTA_TAIL_SECONDS, total);
    out.push({ text: cta, style: "highlight", startTime: Number(Math.max(0, total - dur).toFixed(3)), endTime: total });
  }

  return out;
}
