import { describe, it, expect } from "vitest";
import {
  buildAssetRows,
  pendingShotCount,
  pendingNonProductShotCount,
  shouldOfferStockFill,
  needsImageModelWarning,
  type SavedAssetRow,
} from "@/lib/assets-view";
import type { Shot } from "@/lib/db/schema";
import type { VideoControlSummary } from "@/lib/video-control-plan";

// Create a minimal usable shot
function shot(partial: Partial<Shot> & { shotId: number }): Shot {
  return {
    shotId: partial.shotId,
    type: partial.type ?? "hook",
    duration: partial.duration ?? 3,
    description: partial.description ?? `shot ${partial.shotId}`,
    camera: partial.camera ?? "static",
    visualSource: partial.visualSource ?? "ai_generate",
    transition: partial.transition ?? "ffmpeg_fade",
    voiceover: partial.voiceover ?? "",
    prompt: partial.prompt ?? "",
    stockKeywords: partial.stockKeywords,
  };
}

describe("buildAssetRows", () => {
  it("stored, ready assets → ready with a thumbnail, passing assetType through", () => {
    const shots = [shot({ shotId: 1, visualSource: "ai_generate" })];
    const saved: SavedAssetRow[] = [
      { shotId: 1, filePath: "/api/files/p1/stock/a.jpg", status: "done", type: "stock_footage" },
    ];
    const rows = buildAssetRows(shots, saved, []);
    expect(rows[0].status).toBe("done");
    expect(rows[0].thumbnailUrl).toBe("/api/files/p1/stock/a.jpg");
    expect(rows[0].assetType).toBe("stock_footage");
    expect(rows[0].isVideo).toBeUndefined(); // image assets are not video
  });

  it("video assets (mp4) → marked isVideo, thumbnail uses the static preview instead of the mp4", () => {
    const shots = [shot({ shotId: 1, visualSource: "ai_generate" })];
    const saved: SavedAssetRow[] = [
      {
        shotId: 1,
        filePath: "/api/files/p1/stock/clip.mp4",
        thumbnailPath: "https://cdn/preview.jpg",
        status: "done",
        type: "stock_footage",
      },
    ];
    const rows = buildAssetRows(shots, saved, []);
    expect(rows[0].isVideo).toBe(true);
    expect(rows[0].thumbnailUrl).toBe("https://cdn/preview.jpg"); // use preview image, not the mp4 itself as <img>
  });

  it("video asset without a preview → isVideo still true, thumbnail falls back to the file itself", () => {
    const shots = [shot({ shotId: 1 })];
    const saved: SavedAssetRow[] = [
      { shotId: 1, filePath: "/api/files/p1/x.webm", status: "done", type: "stock_footage" },
    ];
    const rows = buildAssetRows(shots, saved, []);
    expect(rows[0].isVideo).toBe(true);
    expect(rows[0].thumbnailUrl).toBe("/api/files/p1/x.webm");
  });

  it("stored assets that are not ready (status not done) do not count as ready", () => {
    const shots = [shot({ shotId: 1 })];
    const saved: SavedAssetRow[] = [{ shotId: 1, filePath: "/x.jpg", status: "pending" }];
    const rows = buildAssetRows(shots, saved, []);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].thumbnailUrl).toBeUndefined();
  });

  it("product-photo shots → ready immediately with the first product image", () => {
    const shots = [shot({ shotId: 1, visualSource: "product_image" })];
    const rows = buildAssetRows(shots, [], ["/uploads/prod.jpg"]);
    expect(rows[0].status).toBe("done");
    expect(rows[0].thumbnailUrl).toBe("/uploads/prod.jpg");
  });

  it("plain AI shots without assets → pending", () => {
    const shots = [shot({ shotId: 1, visualSource: "ai_generate" })];
    const rows = buildAssetRows(shots, [], []);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].thumbnailUrl).toBeUndefined();
  });

  it("stored assets override the product image (generated wins over the product-photo fallback)", () => {
    const shots = [shot({ shotId: 1, visualSource: "product_image" })];
    const saved: SavedAssetRow[] = [
      { shotId: 1, filePath: "/api/files/p1/a.png", status: "done", type: "ai_generated" },
    ];
    const rows = buildAssetRows(shots, saved, ["/uploads/prod.jpg"]);
    expect(rows[0].thumbnailUrl).toBe("/api/files/p1/a.png");
    expect(rows[0].assetType).toBe("ai_generated");
  });

  it("when a shot keeps multiple candidates only the active asset is used, not a newer unselected candidate", () => {
    const rows = buildAssetRows([shot({ shotId: 1 })], [
      { id: "chosen", shotId: 1, filePath: "/api/files/p/chosen.png", status: "done", type: "ai_generated", selected: true, createdAt: 1 },
      { id: "newer", shotId: 1, filePath: "/api/files/p/newer.png", status: "done", type: "ai_generated", selected: false, createdAt: 2 },
    ], []);
    expect(rows[0]).toMatchObject({ assetId: "chosen", thumbnailUrl: "/api/files/p/chosen.png" });
  });

  it.each(["failed", "generating", "pending"])("when the current asset is %s it does not wrongly show an unselected old render", (status) => {
    const rows = buildAssetRows([shot({ shotId: 1 })], [
      { id: "old", shotId: 1, filePath: "/api/files/p/old.png", status: "done", selected: false },
      { id: "current", shotId: 1, status, selected: true },
    ], []);
    expect(rows[0].status).toBe(status);
    expect(rows[0].thumbnailUrl).toBeUndefined();
  });

  it("when only unselected historical versions exist, empty shots can still be filled", () => {
    const rows = buildAssetRows([shot({ shotId: 1 })], [
      { shotId: 1, filePath: "/api/files/p/old.png", status: "done", selected: false },
    ], []);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].thumbnailUrl).toBeUndefined();
  });

  it("video assets restore the real tail frame and generation-control summary", () => {
    const generationPlan = {
      version: 1 as const,
      strategy: "reference-pack" as const,
      mode: "video-to-video" as const,
      referenceRoles: ["keyframe", "character"],
      referenceCount: 2,
      audioMode: "native" as const,
      voiceoverBound: true,
      warnings: [],
    } satisfies VideoControlSummary;
    const rows = buildAssetRows([shot({ shotId: 1 })], [{
      shotId: 1,
      filePath: "/api/files/p/clip.mp4",
      thumbnailPath: "/api/files/p/key.png",
      lastFrameUrl: "/api/files/p/clip.mp4__last-frame.jpg",
      status: "done",
      type: "ai_generated",
      generationPlan,
    }], []);
    expect(rows[0]).toMatchObject({
      lastFrameUrl: "/api/files/p/clip.mp4__last-frame.jpg",
      generationPlan,
    });
  });
});

describe("pendingShotCount", () => {
  it("counts pending shots", () => {
    const rows = buildAssetRows(
      [shot({ shotId: 1 }), shot({ shotId: 2, visualSource: "product_image" }), shot({ shotId: 3 })],
      [],
      ["/p.jpg"],
    );
    // shot1/shot3 are pending; shot2 is ready via product image
    expect(pendingShotCount(rows)).toBe(2);
  });
});

describe("pendingNonProductShotCount", () => {
  it("counts only shots that are pending and not product photos", () => {
    const rows = buildAssetRows(
      [
        shot({ shotId: 1, visualSource: "ai_generate" }), // pending b-roll
        shot({ shotId: 2, visualSource: "product_image" }), // ready via product image
        shot({ shotId: 3, visualSource: "ai_generate" }), // pending b-roll
      ],
      [],
      ["/p.jpg"],
    );
    expect(pendingNonProductShotCount(rows)).toBe(2);
  });
});

describe("shouldOfferStockFill", () => {
  // two ai_generate shots with no assets → both are pending non-product B-roll
  const brollRows = buildAssetRows([shot({ shotId: 1 }), shot({ shotId: 2 })], [], []);

  it("topic projects → always offered (even with an image model configured, free stock is their first path)", () => {
    expect(shouldOfferStockFill(brollRows, "topic", true)).toBe(true);
  });

  it("commerce project, no image model, pending B-roll → offered (so keyless users can still get visuals)", () => {
    expect(shouldOfferStockFill(brollRows, "product", false)).toBe(true);
  });

  it("commerce project with an image model → not offered (uses AI generation, avoids redundant entry points)", () => {
    expect(shouldOfferStockFill(brollRows, "product", true)).toBe(false);
  });

  it("commerce project where all shots are ready product photos → not offered (free stock should not cover product images)", () => {
    const rows = buildAssetRows([shot({ shotId: 1, visualSource: "product_image" })], [], ["/p.jpg"]);
    expect(shouldOfferStockFill(rows, "product", false)).toBe(false);
  });

  it("no shots → not offered", () => {
    expect(shouldOfferStockFill([], "topic", false)).toBe(false);
  });
});

describe("needsImageModelWarning", () => {
  it("image model configured → no hint", () => {
    const rows = buildAssetRows([shot({ shotId: 1, visualSource: "ai_generate" })], [], []);
    expect(needsImageModelWarning(rows, true)).toBe(false);
  });

  it("no model, AI shots awaiting images → hint", () => {
    const rows = buildAssetRows([shot({ shotId: 1, visualSource: "ai_generate" })], [], []);
    expect(needsImageModelWarning(rows, false)).toBe(true);
  });

  it("no model, all AI shots generated → no hint (avoids contradicting 'ready')", () => {
    const saved: SavedAssetRow[] = [
      { shotId: 1, filePath: "/api/files/p/reel1.png", status: "done", type: "ai_generated" },
    ];
    const rows = buildAssetRows([shot({ shotId: 1, visualSource: "ai_generate" })], saved, []);
    expect(needsImageModelWarning(rows, false)).toBe(false);
  });

  it("no model, only product-photo shots (no AI generation) → no hint", () => {
    const rows = buildAssetRows([shot({ shotId: 1, visualSource: "product_image" })], [], ["/p.jpg"]);
    expect(needsImageModelWarning(rows, false)).toBe(false);
  });
});
