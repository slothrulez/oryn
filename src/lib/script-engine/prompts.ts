/**
 * LLM Prompt templates
 * System prompts and structured templates for generating e-commerce short-video scripts
 */

import { getTemplatesByCategory, categoryNameMap, type ProductCategory } from "./templates";
import { buildHookGuidance } from "./hook-patterns";
import { EMOTION_RESTRAINT_RULES, presenterPromptBlock } from "@/lib/presenters";
import { cameraPresetGuide } from "@/lib/camera-presets";

// ==================== System Role Prompt ====================

/** System role prompt: professional e-commerce short-video director */
export const SYSTEM_PROMPT = `You are a top-tier e-commerce short-video director with the following expertise:

[Background]
- 5+ years creating commerce short videos for TikTok, Instagram Reels and YouTube Shorts, with campaigns that drove over $100M in sales
- Expert in consumer psychology and the AIDA model (Attention → Interest → Desire → Action)
- Tells stories with visual language; every video is built on a deliberate shot-by-shot storyboard
- Understands platform algorithms: completion rate and engagement are the core metrics

[Core skills]
1. Golden first 3 seconds: hold viewers with visual impact, a curiosity question, a contrast, or a clear benefit promise
2. Pain-point discovery: find the target viewer's real pain and describe it in concrete, relatable scenes
3. Product seeding: turn features into benefits the viewer can feel — talk experience, not specs
4. Trust building: use data, comparisons, reviews and credible endorsements
5. Call to action: drive the purchase with limited-time offers, price anchors and bonuses

[Principles]
- Conversational copy: talk like a friend, never like an announcer
- Tight pacing: every shot earns its place; no filler shots
- Emotional arc: hook attention → build trust → drive action
- Executable visuals: each shot description is specific enough to film directly or to generate with AI
- Product shots (product_reveal/cta) should prefer product_image so the product is never altered by AI
- AI-generated scene descriptions must be concrete and visual
- Write the prompt field in English, describing composition, lighting and color precisely

[Language]
- Write ALL text in English: titles, voiceover, subtitles, descriptions, prompts and every other field.

[Output]
Output the script strictly in the specified JSON format, with no extra explanation.`;

// ==================== Style Structure Templates ====================

/** Script style type */
export type ScriptStyleType =
  | "pain_point"
  | "scene"
  | "comparison"
  | "story"
  | "drama"
  | "reversal"
  | "interview"
  | "unboxing"
  | "product_pov"
  | "talking_head"
  | "custom";

/** Display name mapping for script styles */
export const styleNameMap: Record<ScriptStyleType, string> = {
  pain_point: "Pain point",
  scene: "Lifestyle scene",
  comparison: "Comparison review",
  story: "Story",
  drama: "Mini drama",
  reversal: "Plot twist",
  interview: "Street interview",
  unboxing: "Unboxing review",
  product_pov: "Product POV",
  talking_head: "Talking head",
  custom: "Custom",
};

/**
 * Style form groups (drama / product / talking-head / scene) — the four mainstream commerce-video forms.
 * Used by pickers to present the style system by form instead of a flat list.
 */
export const styleFormGroups: { form: string; formEn: string; styles: ScriptStyleType[] }[] = [
  { form: "Drama forms", formEn: "Drama forms", styles: ["drama", "reversal", "interview", "story"] },
  { form: "Product forms", formEn: "Product forms", styles: ["unboxing", "product_pov", "comparison"] },
  { form: "Talking-head forms", formEn: "Talking-head forms", styles: ["talking_head", "pain_point"] },
  { form: "Scene forms", formEn: "Scene forms", styles: ["scene"] },
];

const LOOK_RULE =
  "appearance must describe a fresh, likeable everyday person — balanced features, natural real skin texture without smoothing, everyday hair and makeup; no retouched influencer or celebrity looks, and no deliberate uglifying";

/** Structured prompt directives keyed by style */
export const stylePrompts: Record<Exclude<ScriptStyleType, "custom">, string> = {
  pain_point: `
[Script style: Pain point]
Structure: pain-point hook → product to the rescue → proof of results → limited-time offer

Key points:
1. Open by hitting the target viewer's exact pain with a concrete scene, not an abstract question
   - Good: "My foundation cakes every single time — I can't even zoom in on my own photos"
   - Bad: "Is your skin bad?"
2. The pain must sting enough that viewers think "yes, that's me"
3. Bring the product in when the pain peaks, like a rescue
4. Show results as a contrast: before vs after, as visual as possible
5. Close with limited-time urgency; the push should feel natural, not pushy

Emotional rhythm: frustration → recognition → anticipation → surprise → desire → buy now`,

  scene: `
[Script style: Lifestyle scene]
Structure: everyday scene → natural use → results → recommendation

Key points:
1. Open on a specific moment of daily life (before a date, working late, a lazy weekend, on a trip)
2. The product should appear naturally, as something really used in that life — not a hard sell
3. Focus on the "good moment" the product creates so viewers picture themselves in it
4. Recommend like "this is too good not to share", never "you must buy this"
5. First-person vlog narration adds authenticity and closeness

Emotional rhythm: everyday → relatable → aspiration → curiosity → convinced → want the same`,

  comparison: `
[Script style: Comparison review]
Structure: pose the question → compare options → let data/results speak → recommend the winner

Key points:
1. Hook with something like "I spent $200 testing 5 of these so you don't have to"
2. Compare fairly: looks, performance, price, details
3. Show each comparison visually: side-by-side tests, simple charts, slow-motion replays
4. Stay objective; don't trash competitors, highlight the recommended product's strengths
5. End with a reasoned recommendation that sums up "why this one"

Emotional rhythm: curiosity → trust (expertise) → agreement → confirmed choice → purchase`,

  story: `
[Script style: Story]
Structure: setup → conflict/twist → product solves the problem → happy ending + recommendation

Key points:
1. Open with an intriguing story line: "Something happened last week..."
2. Keep it short but with real conflict: a date gone wrong, an awkward interview, an embarrassing moment with friends
3. The product appears as the key prop that resolves the conflict and turns the story around
4. The ending should land with a satisfying payoff
5. Transition naturally into the product pitch without breaking immersion
6. Keep the story to 15-25 seconds; no dragging
7. Camera language: everyday medium shots for setup; close-ups with a fast push or follow shot when conflict erupts; the product reveal gets its own close-up; return to a medium shot for the ending

Emotional rhythm: curiosity → tension/awkwardness → surprising turn → satisfaction → convinced → action`,

  drama: `
[Script style: Mini drama (multi-character dialogue)]
Structure: conflict erupts → conflict escalates → product enters as the turning point → satisfying reversal → natural recommendation

This is not a narrated video. It is a mini drama with characters, dialogue and real dramatic conflict.

Characters (mandatory):
1. Exactly 2 characters (more cannot be told in 15-30 seconds), in a relationship with built-in tension: best friends roasting each other / a bickering couple / humble-bragging coworkers / in-laws / boss and employee
2. Output them in the characters array: id (e.g. "char_a"), name, gender, persona (one-line personality), appearance (a visual anchor: hairstyle + outfit color + age range + at least one comparable detail such as rolled-up sleeves, a pen clipped to the collar or a hair tie on the wrist — unchanged across the whole video for cross-shot consistency). The ${LOOK_RULE}
3. In every shot where a character speaks: set characterId to the speaker id; voiceover is that person's line — casual, emotional, like a real argument or banter; never an announcer voice
4. Narrator shots (such as the closing recommendation) leave characterId empty

Drama rules:
1. The first 3 seconds of dialogue must ignite the conflict: open directly with a cutting complaint, humble-brag or roast — no setup
   - Good opening line: "These tissues tear the second you touch them — and you serve them to guests?"
   - Bad opening: "Today let me introduce a tissue"
2. Escalate the conflict once (round two hits harder) so viewers wonder what happens next
3. The product's entrance is the turn: the losing side pulls out the product as a comeback, with one line naming the core selling point
4. The reversal should feel satisfying: the side that was winning is left speechless — that payoff is the selling moment
5. Close with one narrator shot plus a call to action, without breaking immersion
6. Each description states who is on screen (by character name), the action, expression and setting; the prompt includes that character's appearance anchor

Camera language (use when writing camera/description):
- Dialogue rounds: shot/reverse-shot (speaker in close-up or medium, the listener's reaction in close-up); the camera follows whoever speaks
- Emotional turning point: slow push-in close-up — the turning line gets its own shot
- Conflict actions (slamming, grabbing, pulling out the product): follow shot or quick cuts
- Key lines get their own shot: the most cutting line and the selling-point line each get a dedicated shot

${EMOTION_RESTRAINT_RULES}

Emotional rhythm: gripping conflict → escalating tension → unexpected turn → satisfying payoff → convinced → action

${presenterPromptBlock()}`,

  reversal: `
[Script style: Plot twist (expectation reversal)]
Structure: set up an expectation → reinforce it → twist → the product is the reason → recommendation

Key points:
1. In the first 3 seconds, state a belief viewers will buy: "I never buy cheap tissues" / "Mom says everything online is a scam"
2. Reinforce the expectation mid-video; the stronger the setup, the better the twist
3. The twist must be tied to the product: the reason for the reversal is its core selling point — no twist for its own sake
4. Make the "I was wrong" moment specific ("three sheets in and I finally knew what thick means"), not just "it's great"
5. Can be a single narrator or 1-2 characters (then output the characters array and set characterId on their shots)
6. A self-deprecating recommendation lands best: "Fine, I was wrong — it really is that good"
7. Optional "hide the result" technique: the shot before the reveal shows only the reaction (a frozen face or a half-second pause), the next shot reveals the product detail; the payoff must come immediately in the next shot — never hide it behind a black screen

Camera language: direct-to-camera close-up for the setup; everyday medium shots for reinforcement; slow or fast push-in close-up at the twist; macro close-ups for the "it's great" details

${EMOTION_RESTRAINT_RULES}

Emotional rhythm: agree with the belief → believe it more → surprise twist → realization → won over → action`,

  interview: `
[Script style: Street interview (host + interviewee)]
Structure: pose the topic → interviewee's genuine reaction → try it → interviewee's surprised verdict → recommendation

Characters (mandatory):
1. Exactly 2 characters: the host (asks, hands over the product, controls pace) + the interviewee (the genuine reaction); output both in the characters array with appearance anchors. The ${LOOK_RULE}
2. In every speaking shot set characterId to the speaker; voiceover is their line — the interviewee should sound like a random passer-by: casual, hesitant, real ("Wait, how much is this? ...No way, that's a steal")
3. The host's lines are short and punchy, like a variety-show segment

Key points:
1. Open with a debatable or curiosity-gap topic: "Street test: what's the difference between $3 and $10 tissues?"
2. The interviewee's first reaction must feel real (doubt or dismissal is fine); credibility comes from imperfection
3. During the trial the camera stays tight on details; the interviewee's surprised turn is the product demo
4. End with one host summary plus a call to action, no dragging

Camera language: host close-up to pose the topic; shot/reverse-shot close-ups for reactions; hand-detail close-ups during the trial; the surprised line gets its own close-up shot

${EMOTION_RESTRAINT_RULES}

Emotional rhythm: curiosity → watching → doubt → hands-on twist → convinced → action

${presenterPromptBlock()}`,

  unboxing: `
[Script style: Unboxing review (immersive first person)]
Structure: suspenseful unboxing → first impression → hands-on test (including a nitpick) → verdict → recommendation

Key points:
1. Open on the unboxing action plus suspense: "Everyone's raving about this — let's open it and see if it's worth it"
2. Casual first-person narration, like a vlog for a friend, no corporate tone
3. Include a nitpick: volunteer a minor flaw ("the box design is meh") to make the core selling point more credible
4. Tests need visible actions: tearing, pulling, soaking, weighing, comparing to an old item — the description spells out the test action in close-up
5. The verdict says who should buy it and who shouldn't; restraint sells
6. No characters array needed (single first-person creator; mostly hand + product close-ups, face optional)

Emotional rhythm: curiosity → watching → skeptical → convinced by the test → trust → action`,

  product_pov: `
[Script style: Product POV (the product speaks in first person)]
Structure: the product introduces itself → complains about its hard/busy life → shows off its special skill (selling point) → sassy recommendation

Characters:
1. Output a characters array with exactly 1 character: the product itself (id such as "char_product", name = the product's nickname, gender to match its vibe, persona such as "sassy but genuinely great")
2. Every speaking shot sets characterId to the product character; voiceover is the product's first-person line

Key points:
1. A cute contrast in the self-introduction: "Hi, I'm the tissue box you go through three sheets at a time"
2. Use "my life is so hard / so busy" to bring in the use case: "Pulled 80 times a day — your allergies depend on me"
3. When showing off its skill the personality flips (sassy to confident); selling points said in first person don't feel like ads
4. Visuals are mostly product close-ups/macro (the description gives the product "actions": picked up, pulled out, squeezed), no human faces
5. End with a sassy call to action: "Buy me or don't — I'm selling out anyway"

Emotional rhythm: cute contrast → funny → sympathy → won over by the skill → knowing smile → action`,

  talking_head: `
[Script style: Talking head (creator persona, straight to the point)]
Structure: persona-driven opening punch → core verdict → rapid stack of evidence → firm recommendation → call to action

Key points:
1. Open with persona + a punchy verdict: "Five years reviewing paper goods — this is the only tissue I've rebought ten times" — verdict first, reasons after
2. Keep the rhythm of one person talking to camera: short sentences, quick cuts, every line carries information; no filler or long clauses
3. Stack three kinds of evidence: numbers (weight/ply/price) → comparison (same factory as the big brand / three times as much for the price) → scenarios (with kids / in the car / at the office)
4. Repeat a persona catchphrase ("trust me" / "remember this") to make it memorable
5. Description: mostly half-body or close-up framing of the speaker, intercut with product close-ups as B-roll; switch shots fast (2-4 seconds each)
6. Describe the speaker as a real everyday person in description/prompt (ordinary looks, real skin, everyday hair and makeup, not an influencer face); credibility comes from feeling like someone you know
7. The firm recommendation needs at least three concrete reasons before "just get it"; no unsupported claims

Emotional rhythm: hooked by the persona → curious about the reasons → convinced by evidence → trust → decisive purchase

${presenterPromptBlock()}`,
};

// ==================== Video Mode Directives ====================

/** Asset generation strategy keyed by video mode */
export const VIDEO_MODE_DIRECTIVES: Record<string, string> = {
  product_closeup: `
[Video mode: Product close-up]
The product itself is the star; no real people appear at any point.

Asset strategy (critical, follow strictly):
1. Every shot's visualSource should prefer "product_image" (the original product photo is the most faithful)
2. Use "ai_generate" only for scene backgrounds; the subject must still be the product — never generate human faces
3. For each shot using product_image, set the motion field:
   - hook: motion = "zoom_in_slow" (slow push-in for suspense)
   - product_reveal: motion = "ken_burns" (slow drift to show the whole product)
   - demo: motion = "pan_left" or "pan_right" (lateral move to show details)
   - cta: motion = "static" (still, focused on purchase info)
4. The prompt field describes the environment/lighting/mood around the product, not people
   - Good prompt: "Premium tissue box on a clean marble surface, soft studio lighting, bokeh background, product photography"
   - Bad prompt: "A woman holding tissue paper" (no people)
5. Use textOverlay on key frames for text (selling points, price, etc.)

Best for: premium skincare, food, electronics, home goods`,

  graphic_montage: `
[Video mode: Graphic montage]
A fast-paced montage of product images, text cards and transitions.

Asset strategy:
1. Mostly "product_image", interleaved with text cards
2. Every shot should set textOverlay with key information:
   - hook: textOverlay.style = "title", large and bold
   - pain_point: textOverlay.style = "highlight", emphasizing the pain
   - demo: textOverlay.style = "subtitle", describing the feature
   - cta: textOverlay.style = "price", showing price/offer
3. Transitions should be fast and frequent (ffmpeg_fade or direct_concat; no AI transitions)
4. Keep shots short (2-4 seconds each) with tight pacing
5. The prompt describes a clean background and layout style, no people
6. Give every shot a motion effect so nothing feels static

Best for: consumer goods, everyday items, snacks, affordable beauty`,

  scene_demo: `
[Video mode: Scene demo]
Shows the product in use; AI generates the setting but never human faces.

Asset strategy:
1. product_reveal and cta shots use "product_image" (keeps the product authentic)
2. hook and demo shots use "ai_generate" for the usage scene
3. AI-generated frames must avoid faces! Allowed:
   - Hand close-ups (applying, using, operating)
   - Back views/silhouettes (blurred)
   - Object-only scenes (desk, bathroom, kitchen)
4. Write "no face visible, hands only" or "back view, silhouette" in the prompt
   - Good: "Close-up of hands applying cream on skin, soft natural lighting, bathroom counter, no face visible"
   - Bad: "A beautiful woman applying cream" (generates a fake face)
5. Scenes should feel like real life with natural light; avoid over-rendered looks

Best for: skincare, cosmetics, kitchenware, fitness equipment`,

  live_presenter: `
[Video mode: Live presenter]
A real person appears on camera to present.

Asset strategy:
1. If presenter details are provided, every shot prompt that includes the person must include their appearance
2. product_reveal and cta should still prefer "product_image"
3. hook and demo may use "ai_generate" for presenter scenes
4. visualSource can also be "user_upload" so the user can upload their own footage
5. Without real footage, use AI people only in medium/wide shots and avoid facial close-ups (they distort easily)

Tip: if the user has no real footage, prefer the "Product close-up" or "Scene demo" mode`,
};

// ==================== Platform SEO Strategy ====================

/** Algorithm optimization directives keyed by distribution platform */
export const PLATFORM_SEO_DIRECTIVES: Record<string, string> = {
  tiktok: `
[TikTok Shop algorithm strategy]
Recommended three-part structure (better reach and conversion):
- Golden 3-6 second hook: the first frame is the product or a striking result; state the pain or contrast immediately — no buffer, no logo card
- Key message: deliver 3-5 benefits quickly, one visual per benefit, making clear "why this one"
- Clear CTA: the ending clearly says "tap the product link / shop tab to buy", optionally with a limited-time offer

Four high-converting formats (pick one for the whole video):
- Review: real trial plus pros and cons, building credibility
- Before/After: a visual contrast of before vs after use
- Unboxing: unpacking surprise plus detail close-ups, building anticipation
- How-to: step-by-step demo of the use case, lowering the decision barrier

Retention and compliance:
- Faster rhythm: a new information point every 2-3 seconds; subtitles on screen throughout (most viewers watch muted)
- Reinforce price/offers with on-screen stickers, not just voiceover
- Label AI-generated content; avoid exaggerated or unproven claims`,

  reels: `
[Instagram Reels algorithm strategy]
Distribution and completion:
- Full-screen vertical 9:16 with a strong hook in the first 2 seconds; Reels reach non-followers through Explore, so the opening must stop strangers
- Shorter videos get rewatched (loop); completion + rewatches are the core signals
- Trending audio can boost reach (check commercial licensing; keep music low behind the voiceover)

Layout and engagement:
- Keep text clear of the bottom caption area and the right-side buttons (like/comment/share/avatar)
- Prompt Saves and Shares — Instagram weighs both heavily
- Point to the link in bio for conversion; Reels cannot carry direct links

Compliance: subtitles on screen throughout (mostly muted viewing); label AI-generated content; avoid exaggerated or unproven claims`,

  shorts: `
[YouTube Shorts algorithm strategy]
Retention and rewatches:
- Full-screen vertical 9:16, hold viewers in the first 3 seconds; an ending that flows back into the opening (loop-friendly) boosts replays
- YouTube is also a search engine: include the core keywords naturally in the title and voiceover

Growth and engagement:
- Subscribers are the main goal on Shorts; close with a natural Subscribe prompt
- Invite comments; tag #Shorts so the platform classifies it as a short

Layout and compliance: subtitles on screen throughout (muted viewing); reinforce price/offers with on-screen stickers; label AI-generated content; avoid exaggerated or unproven claims`,
};

/** Platform code → human-readable label used in the prompt's "target platform" line. */
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
  youtube: "YouTube Shorts",
};

/**
 * Derive a readable "target platform" label from the comma-separated platform codes.
 * Falls back to TikTok when unset or unrecognized. Pure function.
 */
export function platformTargetLabel(platforms?: string): string {
  if (!platforms) return "TikTok";
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of platforms.split(",")) {
    const label = PLATFORM_LABELS[raw.trim().toLowerCase()];
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels.length ? labels.join(" / ") : "TikTok";
}

// ==================== Golden-3-Second Strategy ====================

/** Golden-3-second opening strategy library */
export const goldenThreeSecondsStrategies = `
[Golden 3-second opening strategies — you must use one of these]

Strategy 1 "Visual impact": make the first frame extremely eye-catching
  - Exaggerated contrast (bare face vs made-up, dirty vs clean)
  - Dynamic capture (bursting, stretching, splashing, shattering)
  - Macro close-ups (texture, grain, sheen)
  Example line: "Is this result even real?!"

Strategy 2 "Curiosity question": ask a question viewers have to see answered
  - Counter-intuitive: "How does the $10 one beat the $50 one?"
  - Identity: "The thing every busy parent I know is using"
  - Number hook: "Done in 3 seconds — here's how"
  Example line: "Why is everyone fighting over this?"

Strategy 3 "Contrast": create a sharp contrast in expectations
  - Price: "$10 vs $500 — can you tell the difference?"
  - Result: "My coworker thought I paid $300 for this"
  - Identity: "A software engineer teaching makeup? Better than the beauty gurus"
  Example line: "Don't overpay! Same result for a tenth of the price!"

Strategy 4 "Benefit promise": tell viewers exactly what they'll get
  - Save money: "Watch this and save $50"
  - Improvement: "7 days to a real difference"
  - Avoid mistakes: "Watch this before you buy one"
  Example line: "After this video you'll know exactly which one to get!"

Strategy 5 "Emotional resonance": touch an emotional nerve
  - Shared frustration: "Does it feel like this keeps getting worse?"
  - Joy: "I'm so happy with this I had to share it!"
  - Regret: "I wish I'd found this sooner!"
  Example line: "Wait, don't scroll! I regret not buying this sooner!"
`;

/**
 * Retention & conversion hard rules (2026 ad-platform evidence): product visible inside 3s
 * (TikTok Marketing Science: 63% of top-CTR videos show the product/core info in the first 3s),
 * a mid-video re-hook against the 45-55% statistical drop-off window, dual CTA placement
 * (~70% first mention + final-shot repeat with a pointing gesture — voice+gesture+caption
 * triple sync), soft personal-experience urgency by default (fabricated scarcity is false
 * advertising), and an optional save-hook for list/tutorial content. Injected after the hook
 * guidance in buildUserPrompt; commerce path only (the topic path has no product/CTA).
 */
export const RETENTION_CONVERSION_RULES = `[Retention and conversion hard rules]
- Product on screen within 3 seconds: the first shot must show the physical product (commerce videos that hide the product for the first 3 seconds get markedly lower CTR)
- Mid-video re-hook: if the total runtime exceeds 20 seconds, put a "re-hook" line in a shot at roughly 40%–60% that opens a new curiosity gap (e.g. "But the really wild part is next", "Point three is why I actually bought it") to flatten mid-video drop-off
- Dual CTA placement: the CTA can't only be in the last shot — mention the action casually in a shot at roughly 70%; repeat the CTA in the final shot, and that shot's description has the person pointing down toward the bottom of the frame (voiceover + gesture in sync)
- Urgency tiers: default to soft personal urgency (e.g. "This is the price I got — no idea how long it'll last"); hard claims like "only X left / today only" only when the seller confirms they're true (fake urgency is false advertising)
- Leave one small hook at the CTA: when the CTA lands, viewers must still be owed one small unresolved payoff (e.g. "the free gift in the link is the real deal") — never go for conversion right after the biggest payoff, because viewers swipe away the moment it's resolved
- Save hook (optional): for list/tutorial content, give a reason to save before the CTA (e.g. "Save this so you can shop it later")`;

// ==================== Output Format Constraints ====================

/** JSON output format constraint prompt */
export const OUTPUT_FORMAT_PROMPT = `
[Output format]
Output strictly in the JSON format below, with no markdown code fences or extra text. Every text field must be in English.

{
  "title": "Script title (under 8 words, eye-catching)",
  "totalDuration": 25,
  "characters": [
    {
      "id": "char_a",
      "name": "Character name (e.g. Mia)",
      "gender": "female",
      "persona": "One-line personality (e.g. sharp-tongued best friend with a soft heart)",
      "appearance": "Visual anchor: a fresh, likeable everyday person + hairstyle + outfit + age range + one comparable detail (e.g. 32, approachable, loose low ponytail with flyaways, light everyday makeup, pale loungewear, a worn hair tie on her left wrist) — the detail is a sleeve/button/small accessory that stays unchanged across the video; avoid vague praise like 'elegant'"
    }
  ],
  "shots": [
    {
      "shotId": 1,
      "type": "hook",
      "duration": 3,
      "description": "Visual description: specific enough to include set dressing, actions, object placement, lighting and mood",
      "camera": "Camera movement (pick from or adapt the camera vocabulary below, e.g. camera slowly orbits half a circle around the subject as highlights glide across the surface)",
      "visualSource": "ai_generate",
      "transition": "direct_concat",
      "voiceover": "Voiceover line: conversational spoken copy, length matched to duration (about 2.5 words per second)",
      "prompt": "English AI image/video prompt used to generate this shot's visuals",
      "searchTerms": ["english keyword", "alt keyword"],
      "characterId": "ID of the on-screen character (optional; only when a character appears)"
    }
  ],
  "seo": {
    "title": "Video title (with the core keyword, under 10 words)",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
    "coverText": "Cover text (under 5 words, click-worthy)",
    "interactionGuide": "Engagement prompt (invite comments/saves/follows)",
    "description": "Video description (with keywords, under 40 words)"
  }
}

Field rules:
- shotId: integers starting at 1
- type: one of "hook" | "pain_point" | "product_reveal" | "demo" | "social_proof" | "cta"
- duration: shot length in seconds; the shot durations must add up to totalDuration
- description: English visual description, concrete enough to film or generate directly; only the visible facts of "who is doing what in this second" (see the generability rules below)
- camera: ${cameraPresetGuide()}
- visualSource: "ai_generate" (AI-generated) | "product_image" (product photo) | "user_upload" (user footage)
- transition: "ai_start_end" | "ai_reference" | "direct_concat" | "ffmpeg_fade"
- voiceover: English voiceover, about duration x 2.5 words; you may add one [pause] at a natural breath point (at most one per shot, optional) — it only shapes the voiceover, never appears in subtitles and doesn't count toward length
- prompt: English prompt for AI image/video generation describing subject, style, lighting and composition
- searchTerms: 1-3 English stock-footage search phrases, 2-4 words each, naming a concrete, filmable subject plus an action or setting, e.g. ["pouring orange juice glass", "fresh fruit cutting board"]. The first phrase must name the product category or what it is used with (never only the brand name). Never use abstract or marketing words that stock libraries cannot show ("testimonials", "order now", "limited offer", "product reveal", "happy users"); for social_proof and cta shots describe a visible real-world scene instead, e.g. ["woman smiling drinking smoothie", "hand holding phone shopping"]
- characterId: the character ID when a character appears in the shot; omit for shots without characters
- characters: only for drama scripts (styles with character dialogue); gender is "female" | "male"; omit or output an empty array otherwise
- seo.title: short title with the product name and core selling point
- seo.hashtags: 3-5 relevant hashtags, the first being the broad category tag
- seo.coverText: large text overlaid on the cover
- seo.interactionGuide: a natural engagement prompt
- seo.description: the caption used when publishing

[Action generability (hard rules for description/prompt — actions AI video models can't render produce wasted shots)]
Never write these four kinds of action:
1. Two subjects in precisely coordinated interaction (tossing and catching, high-fives, toasting close-ups) → split into two shots, or make one side lead while the other stays still
2. Internal mental states ("remembers", "realizes", "hesitates") → replace with a visible action (freezes mid-motion, looks away, taps the table twice)
3. Negative actions ("fails to catch", "ignores him") → write what actually happens on screen (hand stops mid-air, turns to look out the window)
4. Hand-action chains of three or more steps in one beat (unscrew-pour-apply-pat) → keep one main action; move the rest to other shots or to dialogue/sound
Rewrite order when something can't be filmed: change who performs it → split into two shots → turn it into a hold/freeze → hand it to dialogue or sound

[Three storyboard rules]
1. A key product action gets exactly one "payoff shot": the action happens fully only there, and earlier shots must not show its finished state (opened packaging before the unboxing shot is a continuity error)
2. Adjacent shots must change at least one of: shot size / camera angle / character relationship — two identical shots in a row look like a frozen frame
3. Information decides shot size: pick the scale at which this shot's key information is readable (texture → macro close-up; action → medium; mood → wide)

Notes:
1. The first shot's type must be "hook" and the last must be "cta"
2. Keep totalDuration between 15 and 40 seconds, close to the target duration
3. Use 5-8 shots by default; if the brief asks for a longer arc, use up to 10
4. Write prompt in English with professional style terms (cinematic, soft lighting, macro shot, etc.)
5. When visualSource is "product_image", prompt may be omitted
`;

// ==================== Product Analysis Prompt ====================

/** Product image analysis prompt */
export const PRODUCT_ANALYSIS_PROMPT = `You are a professional e-commerce product analyst. Carefully analyze the provided product image(s) and extract the following. Write every value in English.

1. [Product identification]
   - Product name/type
   - Category (beauty & skincare / food & snacks / home & living / fashion & accessories / tech & electronics)
   - Brand (if visible)

2. [Visual features]
   - Main color and color scheme
   - Packaging design style (minimal / luxurious / cute / techy, etc.)
   - Product form (solid / liquid / powder / set, etc.)
   - Material finish (matte / glossy / transparent / frosted, etc.)

3. [Selling points]
   - Selling points visible in the image (ingredients, benefits, specs, etc.)
   - Marketing copy on the packaging
   - Distinctive design highlights
   - Three hard constraints: each point under 10 words; one dimension per point (don't mix material/benefit/price/scenario); no vague words like "high quality" or "great value" — land on concrete, perceivable details

4. [Target audience]
   - Infer the target audience from the product's features
   - Suitable usage scenarios
   - Likely pain points and needs

5. [Short-video suggestions]
   - Recommended angles and close-ups
   - Visual elements to highlight
   - Suitable script style (pain point / lifestyle scene / comparison review / story)

Output the analysis as JSON:
{
  "productName": "Product name",
  "category": "beauty|food|home|fashion|tech",
  "brand": "Brand (empty if unknown)",
  "visualFeatures": {
    "mainColor": "Main color",
    "designStyle": "Design style",
    "productForm": "Product form",
    "texture": "Material finish"
  },
  "sellingPoints": ["Point 1", "Point 2", "Point 3"],
  "targetAudience": "Target audience",
  "usageScenarios": ["Scenario 1", "Scenario 2"],
  "painPoints": ["Pain point 1", "Pain point 2"],
  "videoSuggestions": {
    "recommendedAngles": ["Angle 1", "Angle 2"],
    "keyVisuals": ["Visual 1", "Visual 2"],
    "suggestedStyle": "pain_point|scene|comparison|story|drama|reversal|interview|unboxing|product_pov|talking_head"
  }
}`;

// ==================== Assemble Full Prompt ====================

/** Input parameters for script generation */
export interface ScriptGenerationInput {
  /** product name */
  productName: string;
  /** product category */
  category: ProductCategory;
  /** product description / selling points */
  productDescription?: string;
  /** script style */
  styleType: ScriptStyleType;
  /** target duration in seconds */
  targetDuration?: number;
  /** target audience */
  targetAudience?: string;
  /** product image analysis result */
  productAnalysis?: string;
  /** video mode */
  videoMode?: "product_closeup" | "graphic_montage" | "scene_demo" | "live_presenter";
  /** user-defined custom requirements */
  customRequirements?: string;
  /** reference script structure (shot pacing/type/conversion logic from a viral template, used for "apply template" generation) */
  referenceStructure?: string;
  /** on-screen character info (live_presenter mode only; injected into prompts to maintain character consistency) */
  character?: {
    id: string;
    name: string;
    appearance: string;
    voiceStyle?: string;
  };
  /** price range */
  priceRange?: string;
  /** distribution platforms (comma-separated: tiktok,reels,shorts) */
  platforms?: string;
  /** product usage and advantages */
  usageAdvantage?: string;
  /** performance-feedback directive (data flywheel): pre-rendered hint that biases style/hook toward what historically converts; empty when there is no data */
  performanceHint?: string;
  /** pin the opening hook mechanism (HOOK_PATTERNS id) — anti-homogenization batch rotation assigns a different one per video */
  preferredHookId?: string;
}

/**
 * Assembles the full user prompt
 * Combines all templates, strategies, and constraints into a single generation instruction
 */
export function buildUserPrompt(input: ScriptGenerationInput): string {
  const {
    productName,
    category,
    productDescription,
    styleType,
    targetDuration = 25,
    targetAudience,
    productAnalysis,
    videoMode = "product_closeup",
    customRequirements,
    character,
    priceRange,
    platforms,
    usageAdvantage,
    performanceHint,
    preferredHookId,
  } = input;

  // fetch category templates
  const categoryData = getTemplatesByCategory(category);
  const categoryName = categoryNameMap[category];

  // fetch style directive
  const styleDirective = styleType === "custom"
    ? `[Script style: Custom]\nDecide the script structure and style from the user's custom requirements.`
    : stylePrompts[styleType];

  // pick the best-fit reference template (use the first one)
  const referenceTemplate = categoryData.templates[0];

  // assemble prompt
  const parts: string[] = [];

  parts.push(`Write an e-commerce short-video script for the following product:`);
  parts.push(`\n[Product info]`);
  parts.push(`- Product name: ${productName}`);
  parts.push(`- Category: ${categoryName}`);

  if (productDescription) {
    parts.push(`- Description/selling points: ${productDescription}`);
  }

  if (targetAudience) {
    parts.push(`- Target audience: ${targetAudience}`);
  }

  if (priceRange) {
    parts.push(`- Price range: ${priceRange}`);
  }

  if (usageAdvantage) {
    parts.push(`- Usage and advantages: ${usageAdvantage}`);
  }

  parts.push(`- Target total duration: ${targetDuration} seconds`);
  parts.push(`- Aspect ratio: 9:16 vertical (mobile viewing)`);
  // Reflect the actual distribution platforms (defaults to TikTok when unset).
  parts.push(`- Target platform: ${platformTargetLabel(platforms)}`);

  // append product image analysis result
  if (productAnalysis) {
    parts.push(`\n[Product image analysis]`);
    parts.push(productAnalysis);
  }

  // inject on-screen character constraints
  if (character) {
    parts.push(`\n[On-screen presenter]`);
    parts.push(`- Name: ${character.name}`);
    parts.push(`- Appearance: ${character.appearance}`);
    if (character.voiceStyle) {
      parts.push(`- Voice style: ${character.voiceStyle}`);
    }
    parts.push(`- Important: every shot featuring this person must include their appearance in the prompt for visual consistency`);
    parts.push(`- Set the shot's characterId field to "${character.id}"`);
  }

  // append video mode directive
  parts.push(`\n${VIDEO_MODE_DIRECTIVES[videoMode]}`);

  // inject platform SEO strategy
  if (platforms) {
    const platformList = platforms.split(",");
    // use the first platform as the primary optimization target
    const primaryPlatform = platformList[0];
    if (PLATFORM_SEO_DIRECTIVES[primaryPlatform]) {
      parts.push(`\n${PLATFORM_SEO_DIRECTIVES[primaryPlatform]}`);
    }
    if (platformList.length > 1) {
      parts.push(`\n[Note] The video will also be published on: ${platformList.join(", ")}; keep each platform's audience habits in mind`);
    }
  }

  // append category-specific directive
  parts.push(`\n${categoryData.directive}`);

  // append style directive
  parts.push(`\n${styleDirective}`);

  // append performance feedback (data flywheel): real published-video conversion data biases
  // the chosen style + opening hook; empty string when the creator has no metrics yet (cold start)
  if (performanceHint) {
    parts.push(`\n${performanceHint}`);
  }

  // append golden-3-second hook guidance (category-preferred patterns + three-beat structure);
  // a pinned hook id (batch anti-homogenization rotation) narrows it to one mandatory mechanism
  parts.push(`\n${buildHookGuidance(category, 5, preferredHookId)}`);

  // append retention & conversion rules (mid-video re-hook, dual CTA placement, soft urgency)
  parts.push(`\n${RETENTION_CONVERSION_RULES}`);

  // append reference template
  parts.push(`\n[Reference script (for style and pacing only; do not copy the content)]`);
  parts.push(`Template: ${referenceTemplate.name}`);
  parts.push(`Example:\n${referenceTemplate.example}`);

  // append custom requirements
  if (customRequirements) {
    parts.push(`\n[Additional user requirements]`);
    parts.push(customRequirements);
  }

  // append output format constraints
  parts.push(`\n${OUTPUT_FORMAT_PROMPT}`);

  parts.push(`\n[LANGUAGE — IMPORTANT] Write every field (title, voiceover, description, camera, seo) in natural English for a global audience.`);

  return parts.join("\n");
}

/**
 * Builds a batch generation prompt (generates multiple scripts with different styles in one call)
 */
export function buildBatchPrompt(input: ScriptGenerationInput, count: number = 3): string {
  const basePrompt = buildUserPrompt(input);

  const refBlock = input.referenceStructure
    ? `\n\n[Reference viral structure]\nUse the following proven high-converting storyboard structure (shot types, pacing, conversion logic) and write a new script for this product (do not copy the copy; fit this product's selling points):\n${input.referenceStructure}\n`
    : "";

  return `${basePrompt}${refBlock}

[Batch generation]
Generate ${count} script options with different styles/angles. Each option must clearly differ in angle, opening strategy and narrative pacing.

Change the output format to:
{
  "scripts": [
    { "title": "...", "totalDuration": ..., "shots": [...] },
    { "title": "...", "totalDuration": ..., "shots": [...] }
  ]
}

Make sure to output ${count} script options.`;
}

// ==================== Topic Video (product-free) ====================
//
// "One-line topic video": the user provides only a one-line topic (e.g. "how to brew pour-over
// coffee at home", "the romance of city nights"). No product is involved; the engine produces a
// short-video script with voiceover and shot pacing, each shot carrying English search keywords
// (stockKeywords), which stock-fill then uses to source footage from free libraries → compose video.
// Difference from commerce scripts: no product/selling points/purchase pressure;
// visualSource is ai_generate throughout (backed by free stock footage); expression over conversion.

/** System role for topic videos: general short-video content director (knowledge/lifestyle/story/emotion) */
export const TOPIC_SYSTEM_PROMPT = `You are a top-tier short-video content director who can turn any topic into a vertical short video that is visual, well-paced and leaves viewers with something learned or felt.

[Core skills]
1. Golden 3 seconds: hold viewers with suspense, contrast, a benefit promise or emotional resonance
2. Information rhythm: break the topic into progressive small points; each shot covers one thing, no cramming
3. Visual sense: every shot maps to real, searchable footage (landscapes, actions, objects, scenes)
4. Conversational narration: like a friend talking, not a lecture; voiceover length matches duration (about 2.5 words per second)
5. Strong ending: close with a memorable line or a practical takeaway that gives viewers a reason to like and save

[Principles]
- This is content without a product: no selling, selling points, prices, ordering or purchase prompts
- Every shot's visuals must be findable in free stock libraries, so subjects should be common, concrete and filmable
- Faces are not required; prefer environments, actions, objects and scenery
- searchTerms must be in English and describe the shot's main subject; they drive automatic footage matching and must never be omitted

[Language]
Write every field in English.

[Output]
Output strictly in the specified JSON format, with no extra explanation.`;

/** Narration style for topic videos */
export type TopicNarrationStyle = "knowledge" | "story" | "lifestyle" | "inspiration" | "travel";

/** Display name mapping for narration styles */
export const topicNarrationNameMap: Record<TopicNarrationStyle, string> = {
  knowledge: "Explainer",
  story: "Emotional story",
  lifestyle: "Lifestyle",
  inspiration: "Inspiration",
  travel: "Travel",
};

/** Creative directives for each narration style */
const topicStylePrompts: Record<TopicNarrationStyle, string> = {
  knowledge: `
[Narration style: Explainer]
- Open with a counter-intuitive or intriguing question/fact
- Explain the topic through 3-5 progressive mini facts, one per shot
- Accurate but not academic; use conversational links like "actually" and "you might not know"
- End with one memorable summary line`,
  story: `
[Narration style: Emotional story]
- Narrate in first or second person, opening on a relatable moment
- Build an emotional arc (setup → turn → release) viewers can follow
- Visuals focus on mood, light and everyday details to carry the emotion
- End on a line that resonates`,
  lifestyle: `
[Narration style: Lifestyle]
- Like a polished lifestyle vlog voiceover, calm and unhurried
- Show the good moments of a specific routine, process or habit
- Visuals emphasize texture and detail (hand movements, object close-ups, natural light)
- End with a gentle line about a way of living`,
  inspiration: `
[Narration style: Inspiration]
- Brisk and powerful; one short, punchy line per shot
- Use contrast and parallel structure for momentum, with grand visuals (landscapes, running, summits, cities)
- No empty slogans; tie the emotion to concrete visuals
- End with one on-theme line worth liking and saving`,
  travel: `
[Narration style: Travel]
- The destination or scenery is the star; narrate like a letter to a place
- Visuals combine landmarks, nature and cultural details at a relaxed pace
- The narration captures the place's unique atmosphere and why it's worth visiting
- End with a line that makes viewers want to go`,
};

/** Output format constraints for topic videos (reuses the Shot structure but removes product/purchase pressure, and requires searchTerms on every shot) */
const TOPIC_OUTPUT_FORMAT_PROMPT = `
[Output format]
Output strictly in the JSON format below, with no markdown code fences or extra text. Every text field must be in English.

{
  "title": "Script title (under 8 words, eye-catching)",
  "totalDuration": 25,
  "shots": [
    {
      "shotId": 1,
      "type": "hook",
      "duration": 3,
      "description": "Visual description: what this shot shows (scene/action/object/light), concrete and searchable",
      "camera": "Camera movement: close-up/medium/wide + push/pull/pan/track",
      "visualSource": "ai_generate",
      "transition": "direct_concat",
      "voiceover": "English narration, about duration × 2.5 words",
      "searchTerms": ["english keyword", "alt keyword"]
    }
  ]
}

Field rules:
- shotId: integers starting at 1
- type: "hook" for the first shot, "demo" for middle shots, "cta" for the last (here it means the closing line, not selling)
- duration: shot length in seconds; the shot durations must add up to totalDuration
- description: English visual description, concrete enough to search or film directly
- camera: English camera movement description
- visualSource: always "ai_generate"
- transition: "direct_concat" | "ffmpeg_fade" (topic videos are brisk; use one of these two)
- voiceover: English narration, about duration × 2.5 words
- searchTerms: [required] 1-3 English search terms precisely describing the shot's subject, e.g. ["pour over coffee", "coffee beans closeup"]. Every shot needs them or footage can't be matched

Notes:
1. The first shot's type must be "hook" and the last must be "cta" (closing line)
2. Keep totalDuration between 15 and 40 seconds
3. Use 5-9 shots
4. No products, selling points, prices or purchase/ordering prompts anywhere
5. Never omit searchTerms; use common, concrete English words so stock libraries return footage
`;

/** Input for topic video script generation */
export interface TopicScriptInput {
  /** one-line topic */
  topic: string;
  /** narration style, defaults to knowledge */
  narrationStyle?: TopicNarrationStyle;
  /** target duration in seconds, defaults to 25 */
  targetDuration?: number;
  /** distribution platforms (comma-separated), used to inject platform SEO strategy (optional) */
  platforms?: string;
  /** additional user requirements (optional) */
  customRequirements?: string;
}

/** Assembles the user prompt for topic video generation */
export function buildTopicPrompt(input: TopicScriptInput): string {
  const {
    topic,
    narrationStyle = "knowledge",
    targetDuration = 25,
    platforms,
    customRequirements,
  } = input;

  const styleDirective = topicStylePrompts[narrationStyle] ?? topicStylePrompts.knowledge;

  const parts: string[] = [];
  parts.push(`Write a vertical short-video script on the following topic (content video, no product):`);
  parts.push(`\n[Topic]\n${topic}`);
  parts.push(`\n[Basics]`);
  parts.push(`- Narration style: ${topicNarrationNameMap[narrationStyle] ?? "Explainer"}`);
  parts.push(`- Target total duration: ${targetDuration} seconds`);
  parts.push(`- Aspect ratio: 9:16 vertical (mobile viewing)`);

  // narration style directive
  parts.push(`\n${styleDirective}`);

  // golden-3-second strategies (shared with commerce scripts; opening hook logic is universal)
  parts.push(`\n${goldenThreeSecondsStrategies}`);

  // platform SEO (optional, use first platform)
  if (platforms) {
    const primary = platforms.split(",")[0];
    if (PLATFORM_SEO_DIRECTIVES[primary]) {
      parts.push(`\n${PLATFORM_SEO_DIRECTIVES[primary]}`);
    }
  }

  if (customRequirements) {
    parts.push(`\n[Additional user requirements]\n${customRequirements}`);
  }

  parts.push(`\n${TOPIC_OUTPUT_FORMAT_PROMPT}`);
  parts.push(`\n[LANGUAGE — IMPORTANT] Write every field (title, voiceover, description, camera) in natural English.`);

  return parts.join("\n");
}

/** Batch-generates multiple topic video scripts with different angles */
export function buildTopicBatchPrompt(input: TopicScriptInput, count: number = 3): string {
  const basePrompt = buildTopicPrompt(input);
  return `${basePrompt}

[Batch generation]
Generate ${count} script options with different angles. Each option must clearly differ in opening hook, narrative order and visual choices.

Change the output format to:
{
  "scripts": [
    { "title": "...", "totalDuration": ..., "shots": [...] },
    { "title": "...", "totalDuration": ..., "shots": [...] }
  ]
}

Make sure to output ${count} script options, with searchTerms on every shot.`;
}

// ==================== Backward-Compatible Legacy Interface ====================

/**
 * Legacy script prompt builder (kept for backward compatibility)
 * @deprecated Use buildUserPrompt instead
 */
export function buildScriptPrompt(params: {
  productName: string;
  productCategory?: string;
  productDescription?: string;
  productAnalysis?: string;
  styleType: string;
  duration: number;
  templateHint?: string;
}): string {
  const category = mapOldCategory(params.productCategory);

  return buildBatchPrompt({
    productName: params.productName,
    category,
    productDescription: params.productDescription,
    productAnalysis: params.productAnalysis,
    styleType: (params.styleType as ScriptStyleType) || "pain_point",
    targetDuration: params.duration,
    customRequirements: params.templateHint,
  });
}

/** Maps legacy category names to new category keys */
function mapOldCategory(category?: string): ProductCategory {
  if (!category) return "beauty";
  const map: Record<string, ProductCategory> = {
    "beauty & skincare": "beauty",
    "food & snacks": "food",
    "home & living": "home",
    "fashion & accessories": "fashion",
    "tech & electronics": "tech",
  };
  return map[category.toLowerCase()] || "beauty";
}
