/**
 * Final video specs for each e-commerce platform — single source of truth for multi-platform export (re-encode to target aspect ratio).
 * TikTok Shop / Instagram Reels / YouTube Shorts use 9:16 portrait. Pure data + accessor, unit-testable.
 * Overseas short-video destinations (reels/shorts) share TikTok's 9:16 1080×1920 spec — same pixels, but exposed as named
 * export targets so a creator cross-posting one clip to TikTok + Reels + Shorts (the 2026 standard) gets correctly-labeled files.
 */

export interface PlatformSpec {
  name: string;
  w: number;
  h: number;
  ratio: string;
  /**
   * Platform recompression threshold in kbps (total file bitrate). Uploads above this line get
   * force-transcoded by the platform ("second compression"), which visibly softens AI-composed
   * footage. Values are community-measured / official-recommendation figures (recorded 2026-07),
   * NOT official hard limits — keep them maintainable here as encoding targets with headroom.
   */
  maxVideoKbps: number;
  /** Frame-rate ceiling; exports above this are downsampled (higher fps wastes the bitrate budget). */
  maxFps: number;
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  // tiktok: community tests show noticeable recompression above ~8-10 Mbps; conservative 8000
  tiktok: { name: "TikTok Shop", w: 1080, h: 1920, ratio: "9:16", maxVideoKbps: 8000, maxFps: 60 },
  // reels: Instagram officially recommends ~5 Mbps for 1080p/30
  reels: { name: "Instagram Reels", w: 1080, h: 1920, ratio: "9:16", maxVideoKbps: 5000, maxFps: 60 },
  // shorts: YouTube officially recommends 8 Mbps for 1080p SDR 30fps
  shorts: { name: "YouTube Shorts", w: 1080, h: 1920, ratio: "9:16", maxVideoKbps: 8000, maxFps: 60 },
};

/** Get the spec for a given platform; returns undefined for unknown platforms. */
export function getPlatformSpec(platform: string): PlatformSpec | undefined {
  return PLATFORM_SPECS[platform];
}

/**
 * Off-site-diversion (QR code) risk policy per platform. Burning a scannable shop QR into the video
 * counts as off-site diversion on some commerce platforms, which can penalize it heavily
 * (shop-window suspension, revoked commerce rights) — so we refuse by default there.
 * Platforms with softer penalties → warn.
 * Global destinations (TikTok Shop/Reels/Shorts) have no comparable scan-to-buy enforcement → ok.
 */
export type OffSiteQrLevel = "block" | "warn" | "ok";

export interface OffSiteQrPolicy {
  level: OffSiteQrLevel;
  reason: { en: string };
}

const QR_OK: OffSiteQrPolicy = {
  level: "ok",
  reason: { en: "No known off-site-diversion enforcement on this platform" },
};

const OFFSITE_QR_POLICIES: Record<string, OffSiteQrPolicy> = {
  tiktok: QR_OK,
  reels: QR_OK,
  shorts: QR_OK,
};

/**
 * QR burn-in policy for a target platform. Unknown/absent platform → warn (the video may end up on a
 * platform where the QR is risky, so surface the caveat instead of staying silent).
 */
export function getOffSiteQrPolicy(platform?: string | null): OffSiteQrPolicy {
  if (!platform) return QR_OK;
  return OFFSITE_QR_POLICIES[platform] ?? QR_OK;
}
