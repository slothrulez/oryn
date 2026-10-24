import { describe, it, expect } from "vitest";
import { parseRangeHeader } from "@/lib/http-range";

describe("parseRangeHeader (HTTP Range header parsing)", () => {
  const SIZE = 1000;

  it("no Range header → null (whole file 200)", () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
    expect(parseRangeHeader(undefined, SIZE)).toBeNull();
    expect(parseRangeHeader("", SIZE)).toBeNull();
  });

  it("bytes=0-99 → inclusive start/end", () => {
    expect(parseRangeHeader("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
  });

  it("open-ended bytes=100- → to the end of the file", () => {
    expect(parseRangeHeader("bytes=100-", SIZE)).toEqual({ start: 100, end: SIZE - 1 });
  });

  it("suffix bytes=-500 → the last 500 bytes", () => {
    expect(parseRangeHeader("bytes=-500", SIZE)).toEqual({ start: 500, end: SIZE - 1 });
  });

  it("suffix longer than the file → start clamps to 0", () => {
    expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual({ start: 0, end: SIZE - 1 });
  });

  it("start > end → invalid (416)", () => {
    expect(parseRangeHeader("bytes=200-100", SIZE)).toBe("unsatisfiable");
  });

  it("start >= size → unsatisfiable (416)", () => {
    expect(parseRangeHeader("bytes=1000-", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=1500-2000", SIZE)).toBe("unsatisfiable");
  });

  it("end beyond the file size → clamps to size-1", () => {
    expect(parseRangeHeader("bytes=900-9999", SIZE)).toEqual({ start: 900, end: SIZE - 1 });
  });

  it("malformed header → invalid (416)", () => {
    expect(parseRangeHeader("bytes=-", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=abc-def", SIZE)).toBe("unsatisfiable");
    expect(parseRangeHeader("items=0-100", SIZE)).toBe("unsatisfiable");
    // Multi-range is not supported by this parser
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toBe("unsatisfiable");
  });

  it("zero-byte file → no range is satisfiable", () => {
    expect(parseRangeHeader("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=-100", 0)).toBe("unsatisfiable");
  });

  it("suffix bytes=-0 → unsatisfiable (416)", () => {
    expect(parseRangeHeader("bytes=-0", SIZE)).toBe("unsatisfiable");
  });
});
