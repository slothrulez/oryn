/**
 * API error helpers: routes return English error text.
 */
import { NextResponse } from "next/server";

/** Minimal shape we need — works for NextRequest and the standard Request. */
interface HasHeaders {
  headers: { get(name: string): string | null };
}

/** Error string for the request. */
export function errText(_req: HasHeaders, en: string): string {
  return en;
}

/**
 * Build an error JSON response. Use for the common `{ error }`-only case.
 * For responses that carry extra fields (e.g. `{ error, projectId }`), use `errText` inline instead.
 */
export function apiError(req: HasHeaders, en: string, status = 400): NextResponse {
  return NextResponse.json({ error: errText(req, en) }, { status });
}
