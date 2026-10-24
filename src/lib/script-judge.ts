/**
 * Judge panel — a five-judge adversarial pass over script lines and shot visuals,
 * run BEFORE any money is spent on generation.
 *
 * The UGC methodology this encodes: video models render a bad script exactly as
 * pretty as a good one, so the script must be torn apart first — by narrow,
 * bad-tempered specialists, not one generalist reviewer. Five judges, each
 * owning exactly one axis (retention pacing / spoken-not-written voice /
 * freshness / structure / visible-action visuals), one LLM call for all five,
 * plus rewrites that keep meaning, selling points and — critically — line
 * LENGTH (voiceover duration is pinned to shot duration by TTS).
 *
 * v2 additions:
 *  - visual judge: "who does what in THIS second" — purpose-sentences
 *    ("shows product quality") are not frames; they get rewritten into visible
 *    actions via descriptionRewrites.
 *  - three-tier adoption grades: hands-off chains auto-apply invariant/default
 *    rewrites only; taste-tier stays display-only (protects creative choices
 *    while still catching hard defects). Invalid tiers clamp to "taste" —
 *    when in doubt, show, never auto-change.
 *  - evidence rule: every issue must quote the offending fragment; rewrites
 *    must preserve the original line's numeric fact tokens (price/spec/count),
 *    enforced server-side — a rewrite that loses a number is dropped.
 *
 * Pure functions: prompt building + response parsing/clamping. The route does I/O.
 */
import { SPOKEN_VOICE_RULES } from "@/lib/presenters";
import { extractJSON } from "@/lib/script-engine/generator";

export const JUDGE_IDS = ["pace", "voice", "idea", "structure", "visual"] as const;
export type JudgeId = (typeof JUDGE_IDS)[number];

/** Judge display metadata for the report UI. */
export const JUDGE_META: Record<JudgeId, { en: string }> = {
  pace: { en: "Pacing judge" },
  voice: { en: "Voice judge" },
  idea: { en: "Freshness judge" },
  structure: { en: "Structure judge" },
  visual: { en: "Visual judge" },
};

/** Adoption tiers: what automation may act on vs. what stays a suggestion. */
export const JUDGE_TIERS = ["invariant", "default", "taste"] as const;
export type JudgeTier = (typeof JUDGE_TIERS)[number];

export interface JudgeIssue {
  shotId?: number;
  issue: string;
  /** Adoption grade (display); invalid model output clamps to "taste" */
  tier: JudgeTier;
}
export interface JudgeVerdict {
  judge: JudgeId;
  issues: JudgeIssue[];
}
export interface JudgeRewrite {
  shotId: number;
  voiceover: string;
  /** Adoption grade: hands-off chains only auto-apply invariant/default */
  tier: JudgeTier;
}
/** Visual judge's shot-description rewrite (function sentence → visible action). */
export interface JudgeDescriptionRewrite {
  shotId: number;
  description: string;
  tier: JudgeTier;
}
export interface JudgeReport {
  verdicts: JudgeVerdict[];
  rewrites: JudgeRewrite[];
  descriptionRewrites: JudgeDescriptionRewrite[];
  summary?: string;
}

/** Minimal shot view the judges need (id + spoken line + what the frame shows). */
export interface JudgeShotInput {
  shotId: number;
  voiceover: string;
  /** Shot visual description — feeds the visual judge; optional for line-only callers */
  description?: string;
}

/** Style-specific extra criteria appended per script style (keyed by styleType). */
const STYLE_CRITERIA: Record<string, string> = {
  reversal: [
    `Reversal-specific criteria (structure judge adds):`,
    `- The reversal must fit a one-sentence formula: "Because <a fact set up earlier>, the assumption that <original belief> fails, and the detail that proves it is <a concrete, perceivable point>" — if it doesn't fit, the reversal fails; call it out at invariant level`,
    `- The reveal must come from facts set up earlier; new information out of nowhere is not a reversal`,
  ].join("\n"),
  drama: [
    `Dialogue-drama criteria (voice and structure judges add):`,
    `- Every line must map to one action verb (jab / probe / brag / back down) — a line without an action is narration, not dialogue`,
    `- Swap-speaker test: if the line works just as well from the other character, it has no stance — call it out for a rewrite`,
    `- Each character needs a hidden agenda (what they want to win); call out lines that serve nobody's agenda`,
  ].join("\n"),
  interview: [
    `Interview criteria (voice and structure judges add):`,
    `- Every interviewee line must map to an action verb (doubt / surprise / verify / convert); call out purely agreeable feed lines`,
    `- Swap-speaker test: if host and interviewee lines can be swapped without friction, neither has a stance — call it out for a rewrite`,
  ].join("\n"),
};

/**
 * Build the single-call judge-panel prompt. All five judges rule in one
 * response; rewrites must keep meaning/claims and stay within ±20% of the
 * original length so TTS timing still fits the shot slots.
 */
export function buildJudgePrompt(
  shots: JudgeShotInput[],
  opts: { styleLabel?: string; styleType?: string } = {}
): string {
  const lines = shots.map((s) => {
    const desc = (s.description ?? "").trim();
    return desc
      ? `- shotId ${s.shotId}: line "${s.voiceover}" | visual "${desc}"`
      : `- shotId ${s.shotId}: "${s.voiceover}"`;
  });
  const styleExtra = opts.styleType ? STYLE_CRITERIA[opts.styleType] : undefined;
  return [
    `You are a short-video "judge panel" made of five ill-tempered reviewers who each care about exactly one thing. Task: tear apart the per-shot lines and visuals of the${opts.styleLabel ? ` (${opts.styleLabel} style)` : ""} video below, then rewrite them. Write all output in English.`,
    ``,
    `The five judges (each nitpicks only from their own angle; harsh beats lenient):`,
    `1. Pace judge (pace): only cares about retention. A first line that doesn't hook = death sentence; every line must make people want the next; call out every low-density, long or winding line.`,
    `2. Voice judge (voice): only cares that it's "spoken, not written". Criteria (iron rules):`,
    SPOKEN_VOICE_RULES,
    `3. Idea judge (idea): only cares about freshness. Call out formulaic openings, worn-out memes and any generic phrasing every similar video would use.`,
    `4. Structure judge (structure): only cares about build-up and payoff. Does setup → escalation → payoff hold; ending on a moral/aphorism = violation; sloganized call to action = violation; a video over 20s with no mid-roll re-hook (a line that reopens suspense around 40%–60% through) = call out. Two more global checks:`,
    `   - Even information density = no shot is an event: perfectly even per-shot density means the video has no climax; call out the lowest-density shot so it gives way`,
    `   - Negative list of "fake hook substitutes": suspense with no source (a question thrown out with no setup), withheld-result teasing (black screen / "guess what happened" with no payoff), repeating the same threat louder — none of these count as hooks; call them out`,
    `5. Visual judge (visual): only cares about "who does what in frame this second". Criteria:`,
    `   - description must be a visible fact: who (character name / hands) + what action + on what object; call out anything a camera can't film`,
    `   - Purpose statements are not visuals: descriptions like "show the product's effect", "build trust", "convey quality" = no visual written; call out at invariant level and give a visible-action rewrite (in descriptionRewrites)`,
    `   - Rewrites keep the shot's intent and setting, only translating "purpose" into "action", at a similar length`,
    styleExtra ?? "",
    ``,
    `Evidence rule (applies to all judges): every issue must contain two elements — ① quote the problematic fragment of the original line/description in quotation marks; ② one sentence on what fails. Nitpicks without a quote are invalid.`,
    ``,
    `Adoption tiers (every issue and every rewrite must carry a tier):`,
    `- invariant: hard defect that will fail if unchanged (factual/compliance risk, a first line that doesn't hook, purpose statement with no visual, lines too dense for lip sync)`,
    `- default: should change by default (voice iron-rule violations, formulaic phrasing, broken structure)`,
    `- taste: matter of taste (another phrasing also works) — suggest only, don't insist; automated flows never adopt taste-level rewrites`,
    ``,
    `Per-shot content:`,
    ...lines,
    ``,
    `Output JSON only, in this format:`,
    `{"verdicts":[{"judge":"pace","issues":[{"shotId":1,"issue":"\\"original fragment\\" — what fails","tier":"default"}]},{"judge":"voice","issues":[]},{"judge":"idea","issues":[]},{"judge":"structure","issues":[]},{"judge":"visual","issues":[]}],"rewrites":[{"shotId":1,"voiceover":"rewritten line","tier":"default"}],"descriptionRewrites":[{"shotId":2,"description":"rewritten visual description (visible action)","tier":"invariant"}],"summary":"one-sentence overall verdict"}`,
    ``,
    `Rewrite rules:`,
    `- Keep the original meaning, selling points and every factual claim; only change "how it's said"; never add any efficacy/price promise (ad-compliance red line)`,
    `- Rewritten lines must keep every number, price and spec from the original verbatim (the server checks each number token; dropping one discards the whole rewrite)`,
    `- Rewritten lines must sound "spoken" and match the original length (within ±20% characters; voiceover duration is pinned to the shot slot)`,
    `- Shots with no problems must not appear in rewrites/descriptionRewrites; judges with no notes return empty issues`,
    `- All issues and rewrites in English.`,
  ]
    .filter((l) => l !== undefined && l !== "")
    .join("\n");
}

/** Clamp a tier value; anything unrecognized becomes "taste" (show, never auto-change). */
function clampTier(raw: unknown): JudgeTier {
  return typeof raw === "string" && (JUDGE_TIERS as readonly string[]).includes(raw) ? (raw as JudgeTier) : "taste";
}

/**
 * Numeric fact tokens of a line (prices, specs, counts). Matching is
 * boundary-guarded so "3" never matches inside "13" — a rewrite that changed a
 * number must be dropped, not accepted by substring luck.
 */
export function factTokens(text: string): string[] {
  return Array.from(new Set(text.match(/\d+(?:\.\d+)?/g) ?? []));
}

/** True when every numeric fact token of the original survives verbatim in the rewrite. */
export function preservesFactTokens(original: string, rewrite: string): boolean {
  for (const tok of factTokens(original)) {
    const re = new RegExp(`(?<![\\d.])${tok.replace(".", "\\.")}(?![\\d.])`);
    if (!re.test(rewrite)) return false;
  }
  return true;
}

/** Clamp one issue list: keep only entries with usable text; shotId must exist when given. */
function clampIssues(raw: unknown, validShots: Set<number>): JudgeIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: JudgeIssue[] = [];
  for (const it of raw) {
    const issue = typeof (it as { issue?: unknown })?.issue === "string" ? (it as { issue: string }).issue.trim() : "";
    if (!issue) continue;
    const sid = (it as { shotId?: unknown }).shotId;
    const shotId = typeof sid === "number" && validShots.has(sid) ? sid : undefined;
    const tier = clampTier((it as { tier?: unknown }).tier);
    out.push(shotId === undefined ? { issue, tier } : { shotId, issue, tier });
  }
  return out;
}

/** Shared clamp for text rewrites: real shot, non-empty, sane length ratio, facts preserved. */
function clampTextRewrites<T>(
  raw: unknown,
  originals: Map<number, string>,
  field: "voiceover" | "description",
  make: (shotId: number, text: string, tier: JudgeTier) => T
): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  const seen = new Set<number>();
  for (const r of raw) {
    const shotId = (r as { shotId?: unknown })?.shotId;
    const text =
      typeof (r as Record<string, unknown>)?.[field] === "string"
        ? ((r as Record<string, string>)[field] as string).trim()
        : "";
    if (typeof shotId !== "number" || !originals.has(shotId) || !text || seen.has(shotId)) continue;
    const original = originals.get(shotId) ?? "";
    const origLen = original.trim().length;
    if (origLen > 0) {
      // 0.4x–2.5x: beyond that the TTS timing breaks (voiceover) or the shot got re-imagined
      const ratio = text.length / origLen;
      if (ratio < 0.4 || ratio > 2.5) continue;
    }
    // evidence discipline: a rewrite that loses a number lost a fact — drop it
    if (!preservesFactTokens(original, text)) continue;
    seen.add(shotId);
    out.push(make(shotId, text, clampTier((r as { tier?: unknown }).tier)));
  }
  return out;
}

/**
 * Parse + clamp the LLM's judge response. Unknown judges are dropped, missing
 * judges get empty issue lists (the UI renders all five); voiceover and
 * description rewrites are kept only for real shots with non-empty text within
 * a sane length ratio of the original AND with every numeric fact token intact.
 */
export function parseJudgeResponse(content: string, shots: JudgeShotInput[]): JudgeReport {
  const validShots = new Set(shots.map((s) => s.shotId));
  const voiceoverByShot = new Map(shots.map((s) => [s.shotId, s.voiceover]));
  // description rewrites only apply to shots that HAVE a description
  const descriptionByShot = new Map(
    shots.filter((s) => (s.description ?? "").trim()).map((s) => [s.shotId, (s.description ?? "").trim()])
  );
  let raw: unknown;
  try {
    raw = JSON.parse(extractJSON(content));
  } catch {
    throw new Error("The judge panel did not return valid JSON");
  }

  const rawVerdicts = Array.isArray((raw as { verdicts?: unknown })?.verdicts)
    ? ((raw as { verdicts: unknown[] }).verdicts as unknown[])
    : [];
  const byJudge = new Map<JudgeId, JudgeIssue[]>();
  for (const v of rawVerdicts) {
    const judge = (v as { judge?: unknown })?.judge;
    if (typeof judge !== "string" || !(JUDGE_IDS as readonly string[]).includes(judge)) continue;
    byJudge.set(judge as JudgeId, clampIssues((v as { issues?: unknown }).issues, validShots));
  }
  const verdicts: JudgeVerdict[] = JUDGE_IDS.map((id) => ({ judge: id, issues: byJudge.get(id) ?? [] }));

  const rewrites = clampTextRewrites(
    (raw as { rewrites?: unknown })?.rewrites,
    voiceoverByShot,
    "voiceover",
    (shotId, voiceover, tier): JudgeRewrite => ({ shotId, voiceover, tier })
  );
  const descriptionRewrites = clampTextRewrites(
    (raw as { descriptionRewrites?: unknown })?.descriptionRewrites,
    descriptionByShot,
    "description",
    (shotId, description, tier): JudgeDescriptionRewrite => ({ shotId, description, tier })
  );

  const summary = typeof (raw as { summary?: unknown })?.summary === "string" ? (raw as { summary: string }).summary.trim() : undefined;
  return { verdicts, rewrites, descriptionRewrites, summary: summary || undefined };
}

/**
 * The rewrites automation may apply without a human in the loop: invariant and
 * default tiers only. Taste-tier rewrites are opinions — every hands-off chain
 * (web free / AI / batch / CLI / MCP) displays them but never auto-applies.
 */
export function autoApplicableRewrites(report: JudgeReport): JudgeRewrite[] {
  return report.rewrites.filter((r) => r.tier !== "taste");
}

/** Same gate for the visual judge's description rewrites. */
export function autoApplicableDescriptionRewrites(report: JudgeReport): JudgeDescriptionRewrite[] {
  return report.descriptionRewrites.filter((r) => r.tier !== "taste");
}
