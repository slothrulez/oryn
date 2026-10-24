import { describe, expect, it } from "vitest";
import { applyCaptionReplacements, findTranscriptPhrase, validateCaptionReplacements } from "@/lib/transcript-corrections";
import { DEFAULT_TRANSCRIPT_EDIT_PLAN, remapKeptWords, transcriptWordsToCues, type TranscriptDocument } from "@/lib/transcript-editor";
const document: TranscriptDocument = { version: 1, language: "en", text: "smart travel mug", duration: 8, model: "test", device: "wasm", createdAt: "test", words: [{ id: "a", text: "smart", start: 1, end: 2 }, { id: "b", text: "travel", start: 2, end: 3 }, { id: "c", text: "mug", start: 3, end: 4 }], segments: [], silenceRanges: [] };
describe("versioned caption corrections", () => {
  it("finds phrases across word boundaries and preserves the surrounding token text", () => {
    expect(findTranscriptPhrase(document, "travel mug")).toEqual([{ wordIds: ["b", "c"], text: "travel mug", from: 0, to: 10, start: 2, end: 4 }]);
    expect(findTranscriptPhrase(document, "[")).toEqual([]);
  });
  it("keeps corrected phrase timing and original transcript intact", () => {
    const plan = { ...DEFAULT_TRANSCRIPT_EDIT_PLAN, captionReplacements: [{ wordIds: ["a", "b"], text: "Travel" }] };
    const output = remapKeptWords(document, [{ start: 0.5, end: 6 }], plan);
    expect(output[0]).toMatchObject({ text: "Travel", start: 0.5, end: 2.5 });
    expect(document.words[0].text).toBe("smart");
    expect(transcriptWordsToCues(document, [{ start: 0.5, end: 6 }], plan)[0].text).toContain("Travel");
  });
  it("skips corrections if a group is deleted or cut apart", () => {
    const plan = { ...DEFAULT_TRANSCRIPT_EDIT_PLAN, captionReplacements: [{ wordIds: ["a", "b"], text: "Travel" }] };
    expect(remapKeptWords(document, [{ start: 2, end: 6 }], plan)[0].text).toBe("travel");
    expect(remapKeptWords(document, [{ start: 0, end: 1.5 }, { start: 1.6, end: 6 }], plan).map((word) => word.text)).not.toContain("Travel");
  });
  it.each([
    [{ wordIds: ["b", "a"], text: "x" }], [{ wordIds: ["a", "c"], text: "x" }],
    [{ wordIds: ["a", "a"], text: "x" }], [{ wordIds: ["missing"], text: "x" }],
    [{ wordIds: ["a"], text: "" }], [{ wordIds: ["a"], text: "x".repeat(241) }],
    [{ wordIds: ["a"], text: "x" }, { wordIds: ["a"], text: "y" }],
  ])("rejects invalid or overlapping groups: %j", (...entries) => {
    expect(() => validateCaptionReplacements(entries, new Set(["a", "b", "c"]))).toThrow("INVALID_CAPTION_REPLACEMENTS");
  });
  it("does not mutate words when a correction has missing IDs", () => {
    expect(applyCaptionReplacements(document.words, [{ wordIds: ["a", "missing"], text: "x" }])).toEqual(document.words);
  });
  it("search remains bounded for very long transcripts", () => {
    const long = { ...document, words: Array.from({ length: 20000 }, (_, i) => ({ id: `w${i}`, text: "Hi", start: i, end: i + 1 })) };
    expect(findTranscriptPhrase(long, "Hi", 1000)).toHaveLength(1000);
  });
});
