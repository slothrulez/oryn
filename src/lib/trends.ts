/**
 * Trending topics — fetches what is trending right now, suggests "what to make a video about",
 * and feeds the result into one-shot video generation.
 *
 * Solves the creator's "I don't know what to make" problem with a keyless source:
 * Google Trends daily trending RSS (traffic estimates + related news headlines).
 * Parsing is pure/unit-testable; network calls have timeout guards; results go through a
 * shared in-memory TTL cache so free endpoints are never hammered per page view.
 */

export type TrendSource = "google";

export interface TrendTopic {
  /** Trending keyword, can be used directly as a one-sentence topic */
  title: string;
  /** Human-readable traffic/heat (e.g. "2000+" or "11.5M"), optional */
  traffic?: string;
  /** A related news headline providing context for why this term is trending, optional */
  context?: string;
  /** 1-based rank on the source board (ranked boards), optional */
  rank?: number;
  /** Raw hot value from the source board (ranked boards), optional */
  hotValue?: number;
  /** Which board this topic came from, optional */
  source?: TrendSource;
}

function stripCdata(s: string): string {
  const c = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return c ? c[1] : s;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Get the first text content of a tag in an XML fragment (handles CDATA + entities). Tag may contain a colon (e.g. ht:approx_traffic). */
function firstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(stripCdata(m[1])).trim() : null;
}

/** Parse Google Trends daily trending RSS → topic candidates (skip channel header, only process <item> entries). Pure function. */
export function parseTrendsRss(xml: string): TrendTopic[] {
  const blocks = xml.split(/<item>/i).slice(1); // first segment is the channel header, discard it
  const out: TrendTopic[] = [];
  for (const block of blocks) {
    const body = block.split(/<\/item>/i)[0];
    const title = firstTag(body, "title");
    if (!title) continue;
    out.push({
      title,
      traffic: firstTag(body, "ht:approx_traffic") || undefined,
      context: firstTag(body, "ht:news_item_title") || undefined,
    });
  }
  return out;
}

/** Fetch trending topic candidates for a region; falls back to US for invalid regions, returns [] on network failure (non-blocking). */
export async function fetchTrendingTopics(geo = "US", opts: { limit?: number } = {}): Promise<TrendTopic[]> {
  const g = /^[a-z]{2}$/i.test(geo) ? geo.toUpperCase() : "US";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://trends.google.com/trending/rss?geo=${g}`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const topics = parseTrendsRss(await res.text()).filter((t) => /^[\x20-\x7E]+$/.test(t.title));
    return opts.limit ? topics.slice(0, opts.limit) : topics;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a region code (falls back to US for invalid values). */
export function normalizeGeo(geo: string | null | undefined): string {
  return geo && /^[a-z]{2}$/i.test(geo) ? geo.toUpperCase() : "US";
}

// ---------------------------------------------------------------------------
// Hot-value helpers
// ---------------------------------------------------------------------------

/** Format a raw hot value into a compact English reading: 11504605 → "11.5M", 1700000000 → "1.7B", 2500 → "2.5K". */
export function formatHotValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const fmt = (v: number) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  if (n >= 1e9) return `${fmt(n / 1e9)}B`;
  if (n >= 1e6) return `${fmt(n / 1e6)}M`;
  if (n >= 1e3) return `${fmt(n / 1e3)}K`;
  return String(Math.round(n));
}

// ---------------------------------------------------------------------------
// Trend categorization — keyword classifier over titles (works for any source)
// ---------------------------------------------------------------------------
// A keyword classifier over titles is honest and testable, and works for any
// source. Unmatched titles stay visible under "all" only.

export type TrendCategoryId =
  | "game"
  | "sports"
  | "car"
  | "tech"
  | "food"
  | "fashion"
  | "pets"
  | "ent"
  | "life"
  | "society";

/** Category ids in display order (chips render in this order after "all"). */
export const TREND_CATEGORY_IDS: TrendCategoryId[] = [
  "ent",
  "food",
  "tech",
  "game",
  "sports",
  "fashion",
  "car",
  "pets",
  "life",
  "society",
];

// Match order ≠ display order: specific verticals first so e.g. "Fortnite x Marvel collab"
// hits game before ent, and generic society verbs ("responds") only catch leftovers.
const CATEGORY_RULES: Array<[TrendCategoryId, RegExp]> = [
  ["game", /\b(game|gaming|esports|fortnite|minecraft|roblox|valorant|league of legends|call of duty|steam|xbox|playstation|ps5|nintendo|switch|gta)\b/i],
  ["sports", /\b(match|final|semifinal|champions?|championship|team|player|football|soccer|nba|nfl|mlb|nhl|basketball|baseball|tennis|golf|olympics?|world cup|ufc|f1|marathon|fitness|yoga|cycling)\b/i],
  ["car", /\b(car|cars|ev|electric vehicle|tesla|ford|toyota|honda|bmw|recall|test drive|auto show|gas prices?|charging)\b/i],
  ["tech", /\b(phone|iphone|apple|google|samsung|android|chip|ai|openai|chatgpt|robot|drone|satellite|rocket|spacex|nasa|app|software|startup|gadget)\b/i],
  ["food", /\b(food|recipe|coffee|boba|restaurant|snack|pizza|burger|bbq|dessert|drink|beer|wine|tea|cooking)\b/i],
  ["fashion", /\b(fashion|outfit|style|makeup|lipstick|foundation|skincare|beauty|hair|nails|perfume|handbag|sneakers?|streetwear)\b/i],
  ["pets", /\b(cat|cats|kitten|dog|dogs|puppy|pet|pets|panda|zoo)\b/i],
  ["ent", /\b(movie|film|tv show|series|season|trailer|concert|tour|festival|album|song|music video|actor|actress|director|celebrity|premiere|box office|award|oscars?|grammys?|emmys?|netflix)\b/i],
  ["life", /\b(weather|storm|hurricane|heat ?wave|snow|holiday|vacation|travel|flight|airport|train|subway|daylight saving)\b/i],
  ["society", /\b(police|investigation|accident|crash|killed|court|lawsuit|arrested|charged|responds|apolog(y|izes)|scandal|fine|earthquake|flood|wildfire|explosion|fire|missing|rescue|election|protest)\b/i],
];

/** Classify a trend title into a creator-facing category; unmatched → null (shown only under "all"). Pure function. */
export function classifyTrendTitle(title: string): TrendCategoryId | null {
  for (const [id, re] of CATEGORY_RULES) {
    if (re.test(title)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Daily-persona topic picking — "one a day" without a scheduler
// ---------------------------------------------------------------------------

export interface DailyPick {
  topic: TrendTopic;
  /** true when the pick actually matched the persona keywords; false = fell back to the top-ranked trend */
  matched: boolean;
}

/**
 * Pick today's topic for a persona: score every trend by how many persona
 * keywords its title contains (whitespace/comma separated), tie-break by board
 * rank. No keyword hits at all → fall back to the top-ranked trend with
 * matched=false so the UI can say so honestly. Pure function.
 */
export function pickDailyTrend(topics: TrendTopic[], personaKeywords: string): DailyPick | null {
  if (topics.length === 0) return null;
  const keywords = personaKeywords
    .split(/[\s,\uff0c\u3001;\uff1b]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  let best: TrendTopic | null = null;
  let bestScore = 0;
  for (const tp of topics) {
    const title = tp.title.toLowerCase();
    const score = keywords.reduce((acc, k) => acc + (title.includes(k) ? 1 : 0), 0);
    if (score > bestScore || (score === bestScore && score > 0 && best && (tp.rank ?? 999) < (best.rank ?? 999))) {
      best = tp;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) return { topic: best, matched: true };
  const top = [...topics].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];
  return { topic: top, matched: false };
}

// ---------------------------------------------------------------------------
// Shared TTL cache — free endpoints must not be hit once per page view
// ---------------------------------------------------------------------------

export const TRENDS_CACHE_TTL_MS = 10 * 60 * 1000;

const trendsCache = new Map<string, { at: number; value: unknown }>();

/** True when a cached value is "empty" (no topics) — empty results are not cached so transient failures retry quickly. */
function isEmptyResult(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  const topics = (value as { topics?: unknown })?.topics;
  return Array.isArray(topics) && topics.length === 0;
}

/**
 * Memoize a trends fetcher under a key for TRENDS_CACHE_TTL_MS.
 * `now` is injectable for tests; empty results pass through uncached.
 */
export async function cachedTrends<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlMs?: number; now?: () => number } = {}
): Promise<T> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? TRENDS_CACHE_TTL_MS;
  const hit = trendsCache.get(key);
  if (hit && now() - hit.at < ttl) return hit.value as T;
  const value = await fetcher();
  if (!isEmptyResult(value)) trendsCache.set(key, { at: now(), value });
  return value;
}

/** Test helper: reset the shared cache between cases. */
export function clearTrendsCache(): void {
  trendsCache.clear();
}
