/**
 * Pre-publish "throttle-risk" health check — runs a traceable, item-by-item check on the script before rendering
 * (banned words / hook / duration / subtitle readability / call to action / e-commerce three-act structure / AIGC label),
 * giving a pass/warn/fail result plus concrete, actionable advice for each item.
 *
 * Deliberately avoids fake-precise scores like "73 points": whether a commerce video goes viral depends on too many external
 * factors — reporting a number would be misleading. Only evidence-based, actionable check items are included.
 * Pure function, unit-testable; displayed on the script page in the UI.
 */
import { checkScriptCompliance } from "./ad-compliance";
import type { Shot } from "./db/schema";

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckKey = "compliance" | "hook" | "duration" | "caption" | "cta" | "structure" | "aigc" | "productEarly";

export interface ReadinessItem {
  key: CheckKey;
  status: CheckStatus;
  message: string;
}

export interface ReadinessReport {
  items: ReadinessItem[];
  pass: number;
  warn: number;
  fail: number;
  /** Overall readiness: any fail → needsWork (fix recommended); only warns → risky; all pass → ready */
  overall: "ready" | "risky" | "needsWork";
}

export interface ReadinessOptions {
  /** Whether the AIGC compliance label will be burned in; undefined means skip this check */
  aigcLabel?: boolean;
  /** Product name (commerce videos only) — enables the "product visible in the first 3s" hard rule; omit for topic videos */
  productName?: string;
  locale?: "en";
}

// E-commerce duration sweet spot (seconds): too short = insufficient info to drive purchase; too long = completion rate drops
const DUR_MIN = 15;
const DUR_SWEET_HI = 45;
const DUR_MAX = 60;
// Opening hook: golden 3-second window, with 1s tolerance — warn at 4s
const HOOK_MAX_SEC = 4;
// Maximum subtitle reading speed (CJK chars/second); exceeding this makes subtitles unreadable
const READ_CPS = 9;

// "Product visible within the first N seconds" hard rule: cart-linked videos that tease a story
// and only reveal the product at the end are treated as completion-baiting and suppressed;
// the product must appear inside the opening 3 seconds
const PRODUCT_EARLY_SEC = 3;
const PRODUCT_LATE_SEC = 7;
// shot types that inherently show the product
const PRODUCT_SHOT_TYPES = new Set(["product_reveal", "product_intro", "demo"]);

// Hook signals: question / number / pain-point / contrast — any one qualifies as "has a hook"
const HOOK_SIGNAL = /[?!]|\d|\b(stop|still|always|why|how|actually|turns out|did you know|never|regret|secret|nobody|wait|finally|you need)\b/i;
// Call-to-action signals
const CTA_SIGNAL = /\b(tap|link|buy|shop|cart|grab|order|get yours|click|check out|swipe|bio)\b/i;

const cjkLen = (s: string) => Array.from((s || "").replace(/\s+/g, "")).length;

export function checkPublishReadiness(
  shots: Shot[],
  totalDuration: number,
  opts: ReadinessOptions = {}
): ReadinessReport {
  const items: ReadinessItem[] = [];
  const push = (key: CheckKey, status: CheckStatus, message: string) => items.push({ key, status, message });

  // 1) Ad-law / banned words
  const violations = checkScriptCompliance(shots);
  if (violations.length === 0) {
    push("compliance", "pass", "No ad-law risk words");
  } else {
    const words = [...new Set(violations.map((v) => v.term))].slice(0, 5).join(" / ");
    push(
      "compliance",
      "fail",
      `${violations.length} ad-law risk word(s) (${words}) — platforms throttle absolute/false-efficacy claims; fix before publishing`
    );
  }

  // 2) Opening hook
  const hook = shots.find((s) => s.type === "hook") ?? shots[0];
  if (!hook || !(hook.voiceover || "").trim()) {
    push("hook", "fail", "Missing opening hook (shot 1 should be a hook with voiceover)");
  } else if (hook.duration > HOOK_MAX_SEC) {
    push("hook", "warn", `Opening hook is ${hook.duration}s — grab attention within the first 3s`);
  } else if (!HOOK_SIGNAL.test(hook.voiceover)) {
    push("hook", "warn", "Opening hook is flat — add a question / pain-point / number");
  } else {
    push("hook", "pass", "Opening hook is short and punchy");
  }

  // 3) Duration sweet spot
  const d = Math.round(totalDuration);
  if (d < DUR_MIN) {
    push("duration", "warn", `Total ${d}s is short — may not be enough to drive a purchase`);
  } else if (d > DUR_MAX) {
    push("duration", "warn", `Total ${d}s is long — completion rate drops; e-commerce sweet spot ~21–45s`);
  } else {
    const note = d > DUR_SWEET_HI ? (" (upper edge)") : "";
    push("duration", "pass", `Total ${d}s is in the e-commerce sweet spot${note}`);
  }

  // 4) Subtitle readability: check each shot's voiceover character count / duration; flag if reading speed is exceeded
  const dense = shots
    .filter((s) => s.duration > 0 && cjkLen(s.voiceover) / s.duration > READ_CPS)
    .map((s) => s.shotId);
  if (dense.length === 0) {
    push("caption", "pass", "Subtitle pacing is readable");
  } else {
    push(
      "caption",
      "warn",
      `Shot(s) ${dense.join(", ")} have too-dense subtitles to read — trim copy or add time`
    );
  }

  // 5) Call to action
  const hasCtaShot = shots.some((s) => s.type === "cta");
  const hasCtaWords = shots.some((s) => CTA_SIGNAL.test(s.voiceover || "") || CTA_SIGNAL.test(s.textOverlay?.text || ""));
  if (hasCtaShot || hasCtaWords) {
    push("cta", "pass", "Has a clear call to action");
  } else {
    push("cta", "warn", "No clear call to action (e.g. 'tap the cart below') — hurts conversion");
  }

  // 6) E-commerce three-act structure: hook → reveal/demo → CTA
  const types = new Set(shots.map((s) => s.type));
  const missing: string[] = [];
  if (!types.has("hook")) missing.push("hook");
  if (!types.has("product_reveal") && !types.has("demo")) missing.push("reveal/demo");
  if (!types.has("cta")) missing.push("CTA");
  if (missing.length === 0) {
    push("structure", "pass", "Complete hook → reveal → CTA structure");
  } else {
    push(
      "structure",
      "warn",
      `Missing "${missing.join(", ")}" — the e-commerce structure is hook → reveal/demo → CTA`
    );
  }

  // 7) Product visible in the first 3s (commerce hard rule; only when the caller passes productName)
  if (opts.productName?.trim()) {
    const name = opts.productName.trim();
    const showsProduct = (s: Shot) =>
      s.visualSource === "product_image" ||
      PRODUCT_SHOT_TYPES.has(s.type ?? "") ||
      (s.voiceover ?? "").includes(name) ||
      (s.description ?? "").includes(name) ||
      (s.textOverlay?.text ?? "").includes(name);
    let elapsed = 0;
    let firstAt: number | null = null;
    for (const s of shots) {
      if (showsProduct(s)) {
        firstAt = elapsed;
        break;
      }
      elapsed += s.duration || 0;
    }
    if (firstAt !== null && firstAt <= PRODUCT_EARLY_SEC) {
      push("productEarly", "pass", "Product appears within the first 3s");
    } else if (firstAt !== null && firstAt <= PRODUCT_LATE_SEC) {
      push(
        "productEarly",
        "warn",
        `Product first appears at ~${Math.round(firstAt)}s — cart-linked videos should show it inside 3s`
      );
    } else {
      push(
        "productEarly",
        "fail",
        `Product ${firstAt === null ? "never clearly appears" : `first appears at ~${Math.round(firstAt)}s`} — platforms treat "story first, product last" cart videos as completion-baiting and suppress them; put the product in the opening shot`
      );
    }
  }

  // 8) AIGC compliance label (only checked when the caller provides the toggle state).
  // Platform rules: a visible AI mark at head/tail lasting >=2s; AI-synthesized AUDIO alone
  // (e.g. TTS voice-over on real footage) also triggers the labeling requirement.
  if (opts.aigcLabel === true) {
    push("aigc", "pass", "Visible AIGC label is burned in (>=2s opening badge)");
  } else if (opts.aigcLabel === false) {
    push(
      "aigc",
      "warn",
      "Visible AIGC label is off — 2026-07 platform rules require a >=2s AI mark (AI voice-over alone counts too); unlabeled content risks throttling"
    );
  }

  const pass = items.filter((i) => i.status === "pass").length;
  const warn = items.filter((i) => i.status === "warn").length;
  const fail = items.filter((i) => i.status === "fail").length;
  const overall = fail > 0 ? "needsWork" : warn > 0 ? "risky" : "ready";
  return { items, pass, warn, fail, overall };
}
