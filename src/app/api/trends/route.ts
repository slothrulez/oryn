import { NextRequest, NextResponse } from "next/server";
import { cachedTrends, fetchTrendingTopics, normalizeGeo } from "@/lib/trends";

/**
 * GET /api/trends — "what should I post today" trending topics, no API key needed.
 * `?geo=US` (default US): Google Trends daily RSS.
 * Results go through a 10-minute in-memory cache per geo; fetch failure returns an empty
 * list without throwing.
 */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 50) : 20;
  const geo = normalizeGeo(sp.get("geo"));
  const all = await cachedTrends(`geo:${geo}`, () => fetchTrendingTopics(geo));
  const topics = all.slice(0, limit);
  return NextResponse.json({ source: "google", geo, count: topics.length, topics });
}
