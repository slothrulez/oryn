import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { classifyMaterial, scoreByFilename, scanLocalMaterials } from "@/lib/providers/local-stock";
import { downloadStockFile } from "@/lib/providers/stock-types";
import { searchStock } from "@/lib/providers/stock-registry";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oryn-local-"));
  await writeFile(join(dir, "kitchen_pour_over.mp4"), "v1");
  await writeFile(join(dir, "city_night.mov"), "v2");
  await writeFile(join(dir, "product_shot.jpg"), "img");
  await writeFile(join(dir, "notes.txt"), "ignore"); // not a media file, should be ignored
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("classifyMaterial", () => {
  it("recognizes video/images, otherwise null (case-insensitive)", () => {
    expect(classifyMaterial("a.mp4")).toBe("video");
    expect(classifyMaterial("a.MOV")).toBe("video");
    expect(classifyMaterial("a.png")).toBe("image");
    expect(classifyMaterial("a.txt")).toBeNull();
    expect(classifyMaterial("noext")).toBeNull();
  });
});

describe("scoreByFilename", () => {
  it("counts token overlap between the file name and search terms", () => {
    expect(scoreByFilename("kitchen_pour_over.mp4", "pour over coffee")).toBe(2); // matches: pour + over
    expect(scoreByFilename("city_night.mov", "pour over")).toBe(0);
  });
});

describe("scanLocalMaterials", () => {
  it("filters non-media, video first, sorted by relevance", async () => {
    const c = await scanLocalMaterials(dir, "pour over");
    expect(c.length).toBe(3); // txt filtered out
    expect(c.every((x) => x.source === "local")).toBe(true);
    expect(c[0].id).toBe("kitchen_pour_over.mp4"); // video priority + hits pour/over → ranked first
    expect(c[0].mediaType).toBe("video");
    expect(c[c.length - 1].mediaType).toBe("image"); // images ranked after videos
  });
  it("perPage truncation + missing directory → []", async () => {
    expect((await scanLocalMaterials(dir, "x", { perPage: 1 })).length).toBe(1);
    expect(await scanLocalMaterials(join(dir, "nope"), "x")).toEqual([]);
  });
  it("audio requests → [] (local does not support audio)", async () => {
    expect(await scanLocalMaterials(dir, "x", { mediaType: "audio" })).toEqual([]);
  });
});

describe("registry: searchStock('local')", () => {
  it("with localDir → scans the pool; without localDir → [] (not involved)", async () => {
    expect((await searchStock("local", "pour over", { localDir: dir })).length).toBe(3);
    expect(await searchStock("local", "pour over", {})).toEqual([]);
  });
});

describe("downloadStockFile local copy branch", () => {
  it("absolute-path assets are copied into the target directory", async () => {
    const out = await mkdtemp(join(tmpdir(), "oryn-out-"));
    try {
      const { filePath, bytes } = await downloadStockFile(join(dir, "kitchen_pour_over.mp4"), out, "copied_clip", "video");
      expect(filePath.endsWith("copied_clip.mp4")).toBe(true);
      expect(bytes).toBe(2); // "v1"
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
