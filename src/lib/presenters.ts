/**
 * Built-in presenter presets + the anti-"AI face" realism constraint.
 *
 * Why this exists: video models default to an over-polished "influencer face"
 * (flawless skin, symmetric features, studio light) that instantly reads as AI
 * and cheapens the whole video. Real UGC commerce videos are fronted by ordinary
 * people shot on phones. Verified on real Veo 3.1 A/B calls, and calibrated
 * twice: listing blemishes (freckles/acne/eye bags) over-corrects into unappealing
 * faces — the sweet spot is "pleasant ordinary": approachable well-proportioned
 * features + real un-retouched skin + phone-grade footage, explicitly banning both
 * the influencer face AND deliberate uglification.
 *
 * Two exports do the work:
 *  - REAL_FACE_CONSTRAINT: appended to any generation prompt that puts a person
 *    on camera (script character shots, i2v motion prompts).
 *  - PRESENTER_PRESETS: ready-made ordinary-person casts the LLM can pick from
 *    (or riff on) when a script style needs an on-camera presenter, so every
 *    generated cast starts from believable, non-influencer looks.
 *
 * Pure data + pure functions, no I/O.
 */

/** Realism constraint against the default "AI influencer face". */
export const REAL_FACE_CONSTRAINT = {
  en: "the person is a pleasant, ordinary-looking real human: well-proportioned approachable features that are easy on the eyes, everyday light makeup, natural hair, real un-retouched skin texture — not a polished influencer AI face, and never deliberately unattractive either; footage looks like a casual phone shot with slight noise and natural light, never studio-lit, no ad-grade polish",
} as const;

/** Returns the realism constraint line (the argument is kept for call-site compatibility). */
export function realFaceLine(_surroundingText?: string): string {
  return REAL_FACE_CONSTRAINT.en;
}

export interface PresenterPreset {
  id: string;
  /** Display name (persona nickname, not a real person) */
  name: string;
  gender: "female" | "male";
  /** One-line persona for scripts */
  persona: string;
  /** Appearance anchor written with deliberate ordinary-person features */
  appearance: string;
  /** Product categories this presenter type sells well */
  goodFor: string;
}

/**
 * Six ordinary-person presenter archetypes, deliberately diverse in age, build
 * and styling so multi-video batches don't converge on one face. Every
 * appearance string bakes in anti-AI-face features.
 */
export const PRESENTER_PRESETS: PresenterPreset[] = [
  {
    id: "neighbor_sister",
    name: "Girl next door",
    gender: "female",
    persona: "Down-to-earth and opinionated; nitpicks first, then gets won over",
    appearance: "Woman around 32 at home, fresh and approachable, loose low ponytail with natural flyaways, light everyday makeup, natural real skin, loose pale loungewear, a worn hair tie on her left wrist",
    goodFor: "home & living / food",
  },
  {
    id: "office_lady",
    name: "Commuter professional",
    gender: "female",
    persona: "Rational recommender who talks ingredients and evidence",
    appearance: "Professional woman around 35, poised and easy on the eyes, shoulder-length hair falling naturally, light everyday makeup, natural un-retouched skin, simple button-down shirt with the right cuff casually rolled up",
    goodFor: "beauty & skincare / tech",
  },
  {
    id: "student_girl",
    name: "College student",
    gender: "female",
    persona: "Lively and genuine, big reactions",
    appearance: "Young woman around 22, fresh and cute with thin-framed glasses, high ponytail with natural flyaways, light makeup, infectious smile, plain cotton T-shirt with corded earphones hanging around her neck",
    goodFor: "snacks / budget finds",
  },
  {
    id: "practical_mom",
    name: "Practical mom",
    gender: "female",
    persona: "Budget-savvy, only cares about value for money",
    appearance: "Warm mom around 38, shoulder-length natural curls, kind and pleasant, minimal makeup, natural real skin, wearing an apron or a casual jacket, a small towel peeking out of the apron pocket",
    goodFor: "baby / food / home & living",
  },
  {
    id: "tech_bro",
    name: "Engineer guy",
    gender: "male",
    persona: "Spec-obsessed skeptic who ends up a convert on camera",
    appearance: "Neat ordinary man around 30, short hair, friendly balanced features, natural real skin, plaid shirt or plain T-shirt, a pen clipped to his collar",
    goodFor: "tech / tools",
  },
  {
    id: "honest_uncle",
    name: "Straight-talking uncle",
    gender: "male",
    persona: "Plain-spoken but makes sense; recommends what he uses himself",
    appearance: "Kind man around 45, short hair with some gray, honest reliable face, natural real skin, plain polo shirt with reading glasses tucked in the chest pocket",
    goodFor: "food / farm produce / tools",
  },
];

/**
 * Spoken-voice realism rules for on-camera dialogue. The core UGC insight
 * (Veo-era): once viewers can't tell footage is AI, retention lives or dies
 * on whether the LINES sound spoken or written — a rendered model will make a
 * polished-ad script look exactly as pretty as a human one, so the tell moves
 * to the words. Injected wherever real people speak on camera.
 */
export const SPOKEN_VOICE_RULES = `Spoken-line realism (iron rule — the visuals already look real; only the lines can give it away):
1. Lines must sound spoken, not written: filler words are allowed ("like", "honestly", "how do I put this"), and a sentence may trail off halfway — at most once or twice per video, don't overdo it
2. The opening hook should feel like it starts mid-conversation, as if viewers scrolled in halfway — never open with "Hi everyone / today I'm introducing / lots of you have asked me"
3. No written connectors ("therefore / in conclusion / firstly, secondly"); don't end on a moral or a slogan
4. The call to action is a throwaway mention ("anyway, link's right here, see for yourself"), never a slogan
5. Check every line when done: anything that reads like ad copy gets rewritten as something people would actually say`;

/**
 * First-frame realism rules for person-on-camera image prompts. Stacked
 * specificity beats adjectives: a NAMED light source, a lived-in background
 * with one imperfection, and a mid-sentence pose kill the model's default
 * polish. Deliberately does NOT add facial-blemish keywords (pores/eye bags) —
 * real A/B calibration showed those over-correct into unappealing faces; skin
 * wording stays owned by REAL_FACE_CONSTRAINT.
 */
export const UGC_FIRST_FRAME_RULES = `First-frame realism for people on camera (stack these in description/prompt to suppress the model's default polished-ad look):
1. Name the viewpoint: phone front-camera selfie angle / handheld close-up, shallow depth of field
2. Light needs all four elements: a named source (window / desk lamp / screen) + direction (which side) + quality (filtered by a curtain or sheer or not) + where the single highlight lands — never vague phrases like "nice lighting"
3. The background shows signs of life + one imperfection (an unwashed mug on the desk, a jacket over the chair)
4. The expression is mid-sentence: mouth naturally open, eyes don't have to lock on the lens
5. Videos in the same batch must change the person, the room and the light direction — repetition is AI's biggest tell
6. Name one moving element in the background (a swaying curtain / a steaming cup / a blurred passer-by) — a fully static background looks fake`;

/**
 * Context-drives-appearance rule: a persona's look must carry 1–2 traces of what they
 * are DOING right now (flour on an apron mid-cooking, a phone tucked under the chin) —
 * and those traces must stay identical across every shot of the piece. Appearance
 * written as pure styling reads as a catalog model dropped into a scene.
 */
export const CONTEXT_APPEARANCE_RULE = `Appearance must show traces of the situation: include at least 1-2 traces tied to what the person is doing right now, kept identical across the whole video. Examples:
- Cooking → a little flour on the apron, a strand of hair escaping the clip
- Unboxing right after work → ID badge still around the neck, shirt cuffs casually rolled up
- Reviewing while looking after a baby → a burp cloth over one shoulder, a hair tie on the wrist`;

/**
 * Emotion-restraint rules for acted styles (drama / reversal / interview). End-state
 * emotion words ("thrilled"/"devastated"/"stunned") freeze video models into theatrical masks —
 * the single most common acting tell. Real emotion is written as a three-beat PROCESS and
 * stays visibly restrained; the strongest beat is the one being held back.
 */
export const EMOTION_RESTRAINT_RULES = `Emotion writing rules (acted emotion looks fake; held-back emotion looks real):
1. Never write end-state emotion words ("thrilled", "devastated", "stunned", "moved to tears"); always write a three-beat process: the trigger → the body reacts first (breath/shoulders/leaning in) → only then the face reacts, visibly restrained
2. Give each emotional turning point a single reaction beat, never stacked (frown + sigh + head shake = stage play)
3. The strongest emotion is "almost lost it": write "pressed her lips together twice before the smile gave in", not "burst out laughing"`;

/**
 * Prompt block offering the built-in presenters to the script LLM. Styles that
 * cast on-camera characters append this so generated casts start from ordinary,
 * believable looks instead of the model's default influencer face. The spoken-
 * voice and first-frame realism rules ride along: every style that puts a person
 * on camera needs all three.
 */
export function presenterPromptBlock(): string {
  const lines = PRESENTER_PRESETS.map(
    (p) => `- ${p.name} (${p.gender}, ${p.persona}): ${p.appearance} (good for ${p.goodFor})`
  );
  return `Built-in everyday presenter library (use one as-is, adapt one, or create your own — but keep the same ordinary-person realism):\n${lines.join("\n")}\n\n${CONTEXT_APPEARANCE_RULE}\n\n${SPOKEN_VOICE_RULES}\n\n${UGC_FIRST_FRAME_RULES}`;
}
