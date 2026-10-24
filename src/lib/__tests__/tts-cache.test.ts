import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { ttsCacheKey, readTtsCache, writeTtsCache } from "@/lib/tts-cache";

// paths.ts resolves getDataDir() from APP_DATA_DIR at call time, so pointing it at a
// temp dir redirects all cache I/O away from the real data/ directory for this file.
const origData = process.env.APP_DATA_DIR;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "oryn-ttscache-"));
  process.env.APP_DATA_DIR = dir;
});

afterAll(async () => {
  if (origData === undefined) delete process.env.APP_DATA_DIR;
  else process.env.APP_DATA_DIR = origData;
  await rm(dir, { recursive: true, force: true });
});

describe("ttsCacheKey content-addressed key", () => {
  it("same input gives the same key, a 40-character sha1 hex", () => {
    const parts = { provider: "edge", voice: "en-US-AriaNeural", rate: "+0%", text: "Hello world" };
    const k1 = ttsCacheKey(parts);
    const k2 = ttsCacheKey({ ...parts });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{40}$/);
  });

  it("key insertion order does not affect the key (canonical JSON sorting)", () => {
    expect(ttsCacheKey({ a: 1, b: "x", text: "t" })).toBe(ttsCacheKey({ text: "t", b: "x", a: 1 }));
  });

  it("any field change → key changes", () => {
    const base = { provider: "atlas", model: "xai/tts-v1", voice: "eve", speed: 1, text: "hi" };
    const k = ttsCacheKey(base);
    expect(ttsCacheKey({ ...base, provider: "nova" })).not.toBe(k);
    expect(ttsCacheKey({ ...base, model: "xai/tts-v2" })).not.toBe(k);
    expect(ttsCacheKey({ ...base, voice: "adam" })).not.toBe(k);
    expect(ttsCacheKey({ ...base, speed: 1.2 })).not.toBe(k);
    expect(ttsCacheKey({ ...base, text: "hi!" })).not.toBe(k);
    // Adding a new meaningful field also changes the key
    expect(ttsCacheKey({ ...base, baseUrl: "https://api.example.com" })).not.toBe(k);
  });

  it("undefined / null / '' are equivalent to a missing field (providers default all three, producing the same audio)", () => {
    const k = ttsCacheKey({ voice: "eve", text: "hi" });
    expect(ttsCacheKey({ voice: "eve", text: "hi", speed: undefined })).toBe(k);
    expect(ttsCacheKey({ voice: "eve", text: "hi", speed: null })).toBe(k);
    expect(ttsCacheKey({ voice: "eve", text: "hi", speed: "" })).toBe(k);
  });

  it("value types matter: the number 1 and the string '1' give different keys", () => {
    expect(ttsCacheKey({ speed: 1, text: "t" })).not.toBe(ttsCacheKey({ speed: "1", text: "t" }));
  });
});

describe("readTtsCache / writeTtsCache read and write", () => {
  it("reads back the same bytes after writing; the file lands at <data>/cache/tts/<key>.mp3", async () => {
    const key = ttsCacheKey({ provider: "edge", voice: "v", text: "round-trip" });
    const data = randomBytes(2048);
    await writeTtsCache(key, data);
    const back = await readTtsCache(key);
    expect(back).not.toBeNull();
    expect(Buffer.compare(back!, data)).toBe(0);
    const onDisk = await readFile(join(dir, "cache", "tts", `${key}.mp3`));
    expect(Buffer.compare(onDisk, data)).toBe(0);
  });

  it("unwritten key → null (a miss does not throw)", async () => {
    expect(await readTtsCache(ttsCacheKey({ text: "never-written" }))).toBeNull();
  });

  it("audio under 100 bytes is not cached (the write is skipped, reading returns null)", async () => {
    const key = ttsCacheKey({ text: "tiny" });
    await writeTtsCache(key, Buffer.from("short"));
    expect(await readTtsCache(key)).toBeNull();
  });

  it("invalid keys (path traversal/non-hex characters) are silently rejected without throwing", async () => {
    await expect(writeTtsCache("../evil", randomBytes(2048))).resolves.toBeUndefined();
    expect(await readTtsCache("../evil")).toBeNull();
    expect(await readTtsCache("a/b")).toBeNull();
  });

  it("repeated writes to the same key overwrite (idempotent under content addressing)", async () => {
    const key = ttsCacheKey({ text: "overwrite" });
    const d1 = randomBytes(1024);
    const d2 = randomBytes(1024);
    await writeTtsCache(key, d1);
    await writeTtsCache(key, d2);
    const back = await readTtsCache(key);
    expect(Buffer.compare(back!, d2)).toBe(0);
  });
});
