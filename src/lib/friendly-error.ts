/**
 * Classifies low-level errors into actionable user-facing messages (pure function, unit-testable, locale-aware).
 * In frontend catch blocks, call setError(friendlyError(e, locale)) directly — never expose raw strings
 * like "Failed to fetch" or "401" to the user.
 */
export type ErrorKind = "network" | "auth" | "ratelimit" | "server" | "unknown";

/** Classification only (makes unit-testing the classification logic easier, decoupled from copy) */
export function classifyError(e: unknown): ErrorKind {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (/failed to fetch|networkerror|econnrefused|fetch failed|network request failed|aborted|timeout|etimedout/.test(raw)) return "network";
  if (/\b401\b|\b403\b|unauthorized|forbidden|invalid.*key|api[ _-]?key|missing.*key|key.*invalid/i.test(raw)) return "auth";
  if (/\b429\b|rate.?limit|too many requests|throttl/i.test(raw)) return "ratelimit";
  if (/\b5\d\d\b|server error|internal error|bad gateway|service unavailable/.test(raw)) return "server";
  return "unknown";
}

const MESSAGES: Record<ErrorKind, { en: string }> = {
  network: { en: "Network error — check your connection and try again." },
  auth: { en: "API key invalid or missing — open Settings to configure it." },
  ratelimit: { en: "Rate-limited by the provider — wait a moment and retry." },
  server: { en: "Provider service error — please try again later." },
  unknown: { en: "" },
};

export function friendlyError(e: unknown, locale: "en" = "en"): string {
  const kind = classifyError(e);
  if (kind !== "unknown") return MESSAGES[kind][locale];
  // Unknown error: preserve the raw message (still better than nothing); fall back to a generic message if empty
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return raw || "Something went wrong — please retry.";
}
