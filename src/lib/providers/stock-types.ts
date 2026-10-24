/**
 * Multi-source media engine — shared types, normalized candidates, and utility functions across all stock sources
 *
 * Design: stock sources follow a "search + download" model (unlike the AIProvider's async task-polling model).
 * Each source (Pexels/Pixabay/Openverse…) normalizes its own response into a common StockCandidate,
 * which is then downloaded to data/uploads, recorded in the assets table, and consumed by the composer as an ordinary video/image/audio segment.
 */

/** IDs of integrated stock sources (local = project-bundled B-roll pool; nasa/archive = public-domain archive footage, must be selected explicitly) */
export type StockSourceId =
  | "pexels"
  | "pixabay"
  | "openverse"
  | "wikimedia"
  | "local"
  | "nasa"
  | "archive"
  | "coverr"
  | "jamendo"
  | "freesound";

export type StockMediaType = "video" | "image" | "audio";
export type StockOrientation = "portrait" | "landscape" | "square";

/** Unified media candidate (all sources normalize into this structure) */
export interface StockCandidate {
  source: StockSourceId;
  mediaType: StockMediaType;
  /** Source-internal id (Openverse and others use string ids, so the type is widened to string|number) */
  id: string | number;
  /** Direct URL for the selected quality tier (used for downloading) */
  downloadUrl: string;
  /** Source detail page URL (for compliance attribution) */
  pageUrl: string;
  /** Author name (for attribution) */
  author: string;
  /** Author profile URL */
  authorUrl: string;
  /** License type (varies by source; e.g. "Pexels" / "Pixabay Content License" / "cc-by-2.0") */
  license: string;
  /** Link to the license description (available for CC sources) */
  licenseUrl?: string;
  /** Ready-to-use attribution text (provided by Openverse and others; used directly when exporting credits) */
  attributionText?: string;
  /** Whether attribution is legally required (true for CC BY, BY-SA, etc.) */
  requiresAttribution?: boolean;
  /** Pixel dimensions (absent for audio) */
  width?: number;
  height?: number;
  /** Duration in seconds for video/audio; undefined for images */
  durationSec?: number;
  /** Preview image URL */
  previewImage?: string;
  /** Title / alt text from the source (feeds keyword + semantic matching; absent on some sources) */
  title?: string;
  /** Tag list from the source (feeds keyword + semantic matching) */
  tags?: string[];
}

/** Stock source metadata (used by the frontend to display available sources and whether a key is required) */
export interface StockSourceMeta {
  id: StockSourceId;
  label: string;
  /** Whether the source is fully usable without an API key (critical for zero-config onboarding) */
  keyless: boolean;
  mediaTypes: StockMediaType[];
  /** URL to sign up for a free API key */
  signupUrl?: string;
  /** Environment variable name the server reads the key from */
  envKey?: string;
  /** One-line description */
  note?: string;
  /** Whether this source participates in default aggregate searches (source="all"); defaults to true. Archive sources (two-step retrieval, documentary/scientific content) are set to false and must be selected explicitly to avoid slowing down automatic footage matching */
  aggregate?: boolean;
}

/** Registry of integrated stock sources (used by the frontend to render source selection; keyless sources appear first) */
export const STOCK_SOURCES: StockSourceMeta[] = [
  {
    id: "openverse",
    label: "Openverse",
    keyless: true,
    mediaTypes: ["image", "audio"],
    signupUrl: "https://api.openverse.org/",
    envKey: "OPENVERSE_TOKEN",
    note: "No key needed; CC-licensed images + music/SFX, the zero-setup pick for beginners (no video)",
  },
  {
    id: "wikimedia",
    label: "Wikimedia Commons",
    keyless: true,
    mediaTypes: ["image", "video", "audio"],
    signupUrl: "https://commons.wikimedia.org/",
    note: "No key; CC/public-domain images + video + audio; the only keyless video source (real B-roll) + free BGM, direct downloads",
  },
  {
    id: "pexels",
    label: "Pexels",
    keyless: false,
    mediaTypes: ["video", "image"],
    signupUrl: "https://www.pexels.com/api/",
    envKey: "PEXELS_API_KEY",
    note: "Free key; high-quality commercial-use video + images",
  },
  {
    id: "pixabay",
    label: "Pixabay",
    keyless: false,
    mediaTypes: ["video", "image"],
    signupUrl: "https://pixabay.com/api/docs/",
    envKey: "PIXABAY_API_KEY",
    note: "Free key; video + images, the main supplementary source for real product footage",
  },
  {
    id: "coverr",
    label: "Coverr",
    keyless: false,
    mediaTypes: ["video"],
    signupUrl: "https://coverr.co/developers",
    envKey: "COVERR_API_KEY",
    note: "Free key (2000 requests/hour); curated real footage that feels less stock-like; API content requires Coverr attribution (added to credits automatically)",
  },
  {
    id: "jamendo",
    label: "Jamendo music",
    keyless: false,
    mediaTypes: ["audio"],
    signupUrl: "https://devportal.jamendo.com/",
    envKey: "JAMENDO_CLIENT_ID",
    note: "Free key; huge CC music BGM library, filtered to commercial-use CC-BY only (NC/ND/SA excluded, attribution added to credits automatically)",
  },
  {
    id: "freesound",
    label: "Freesound SFX",
    keyless: false,
    mediaTypes: ["audio"],
    signupUrl: "https://freesound.org/apiv2/apply/",
    envKey: "FREESOUND_API_KEY",
    note: "Free key; 500k+ sound effects (unboxing/clicks/ambience), filtered to commercial-use CC0/CC-BY, using 128kbps HQ preview links",
  },
  {
    id: "local",
    label: "Local media",
    keyless: true,
    mediaTypes: ["video", "image"],
    note: "Use your own uploaded footage/B-roll from the project; no network or key needed",
  },
  {
    id: "nasa",
    label: "NASA image library",
    keyless: true,
    mediaTypes: ["video", "image"],
    aggregate: false,
    note: "No key; public-domain Earth/space/science footage (best for documentary/science topics), opt-in",
  },
  {
    id: "archive",
    label: "Internet Archive",
    keyless: true,
    mediaTypes: ["video", "image"],
    aggregate: false,
    note: "No key; public-domain historical film/documentary footage (publicdomain license enforced, commercial use OK), opt-in",
  },
];

/** Maximum download size per file (80 MB) */
export const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
/** Network request timeout (milliseconds) */
export const REQUEST_TIMEOUT_MS = 30_000;

// ==================== shared pure functions ====================

/** Determine orientation */
export function orientationOf(width: number, height: number): StockOrientation {
  if (height > width) return "portrait";
  if (width > height) return "landscape";
  return "square";
}

/** Filter candidates by duration (images are not filtered) */
export function filterByDuration(
  candidates: StockCandidate[],
  opts: { minSec?: number; maxSec?: number } = {}
): StockCandidate[] {
  const { minSec, maxSec } = opts;
  return candidates.filter((c) => {
    if (c.durationSec == null) return true;
    if (minSec != null && c.durationSec < minSec) return false;
    if (maxSec != null && c.durationSec > maxSec) return false;
    return true;
  });
}

/** Infer file extension from the URL or response headers; fall back to media-type defaults when nothing can be detected (avoids images/audio being saved as .mp4) */
export function inferExtension(url: string, contentType?: string | null, mediaType?: StockMediaType): string {
  const ctMap: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  if (contentType && ctMap[contentType.split(";")[0].trim()]) {
    return ctMap[contentType.split(";")[0].trim()];
  }
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,4})$/);
  if (m?.[1]) return m[1].toLowerCase();
  if (mediaType === "image") return "jpg";
  if (mediaType === "audio") return "mp3";
  return "mp4";
}

// ==================== shared network functions ====================

/** fetch with timeout */
export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Download result */
export interface DownloadResult {
  filePath: string;
  bytes: number;
}

/**
 * Download a direct URL to the specified directory and return save info.
 * Enforces timeout and size limit; the caller is responsible for providing an already-created directory and a file name prefix.
 */
export async function downloadStockFile(
  url: string,
  destDir: string,
  fileBaseName: string,
  mediaType?: StockMediaType
): Promise<DownloadResult> {
  const { writeFile, copyFile, stat } = await import("fs/promises");
  const { join } = await import("path");

  const safeBaseName = fileBaseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "file";

  // local media branch: url is an absolute local path or file:// (constructed exclusively by scanLocalMaterials via readdir from the project pool, never user input);
  // copy directly instead of using network fetch (fetch does not support file paths). Size limit is still enforced, consistent with network downloads.
  if (url.startsWith("/") || url.startsWith("file://")) {
    const srcPath = url.startsWith("file://") ? new URL(url).pathname : url;
    const st = await stat(srcPath);
    if (st.size > MAX_DOWNLOAD_BYTES) throw new Error(`Asset size ${st.size} exceeds the limit ${MAX_DOWNLOAD_BYTES}`);
    const localExt = inferExtension(srcPath, null, mediaType);
    const destPath = join(destDir, `${safeBaseName}.${localExt}`);
    await copyFile(srcPath, destPath);
    return { filePath: destPath, bytes: st.size };
  }

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Asset download failed ${res.status}: ${url}`);

  const contentType = res.headers.get("content-type");
  const declaredLen = Number(res.headers.get("content-length") || 0);
  if (declaredLen && declaredLen > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Asset size ${declaredLen} exceeds the limit ${MAX_DOWNLOAD_BYTES}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Asset size ${buffer.byteLength} exceeds the limit ${MAX_DOWNLOAD_BYTES}`);
  }

  const ext = inferExtension(url, contentType, mediaType);
  // safeBaseName is sanitized at the top of the function (path separators and special characters removed to prevent directory traversal)
  const filePath = join(destDir, `${safeBaseName}.${ext}`);
  // Write-then-rename so a crash mid-write can never leave a half file under the final name —
  // directory scans and caches must only ever see fully-written media.
  const partPath = `${filePath}.part`;
  await writeFile(partPath, buffer);
  const { rename } = await import("fs/promises");
  await rename(partPath, filePath);
  return { filePath, bytes: buffer.byteLength };
}
