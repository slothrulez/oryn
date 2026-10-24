/**
 * Prompt lint for STATIC keyframe image prompts.
 *
 * Why this exists: a keyframe is one frozen instant, but LLMs habitually write
 * image prompts as tiny screenplays ("she opens the jar, then applies the cream,
 * gradually smiling"). An image model given a time sequence renders a mushy
 * in-between of several moments — motion-blurred hands, double actions, faces
 * caught mid-morph. The fix is upstream wording, so this lint flags temporal
 * connectives BEFORE the (billed) generation call; the UI surfaces the warning
 * and the user can rewrite to a single decisive instant.
 *
 * Warning-only by design: hands-off chains never block on lint results, and a
 * false positive costs one glance, not a generation.
 *
 * Pure functions, no I/O.
 */

/**
 * Temporal-sequence markers that imply MULTIPLE moments in one still frame.
 * Deliberately conservative: single-moment wording ("mid-pour", "frozen mid-action")
 * must never match — every pattern here names an order between two moments.
 */
const TEMPORAL_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bthen\b/i, label: "then" },
  { re: /\b(starts?|begins?|beginning) to\b/i, label: "starts to" },
  { re: /\bgradually\b/i, label: "gradually" },
  { re: /\bafter (that|which)\b/i, label: "after that" },
  { re: /\bfollowed by\b/i, label: "followed by" },
];

/**
 * Scan a static keyframe prompt for time-sequence wording. Returns the matched
 * marker labels (deduped, prompt order) — empty array means the prompt reads as
 * a single instant. Callers render a warning; nothing is blocked.
 */
export function keyframeStaticWarnings(prompt: string | undefined): string[] {
  const text = (prompt ?? "").trim();
  if (!text) return [];
  const hits: string[] = [];
  for (const { re, label } of TEMPORAL_PATTERNS) {
    if (re.test(text) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

/**
 * Frame-position directive appended to keyframe image prompts: the keyframe freezes the
 * instant JUST BEFORE the action, with its potential energy visible — the i2v pass then
 * has a beat to play out, instead of animating an already-completed pose.
 */
const KEYFRAME_INSTANT_RULE = {
  en: "freeze the instant just before the action begins: the pose holds the potential energy of what is about to happen, the action itself not yet done",
};

/** The frame-position directive in the language of the surrounding prompt text. */
export function keyframeInstantLine(sampleText: string): string {
  return KEYFRAME_INSTANT_RULE.en;
}
