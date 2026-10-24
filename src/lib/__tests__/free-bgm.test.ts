import { describe, it, expect } from "vitest";
import { moodQueryForCategory, moodQueryForMood } from "@/lib/free-bgm";

describe("moodQueryForCategory (category → music mood search term)", () => {
  it("each category maps to a different mood", () => {
    expect(moodQueryForCategory("beauty")).toBe("upbeat fashion pop instrumental");
    expect(moodQueryForCategory("food")).toBe("warm cozy acoustic background");
    expect(moodQueryForCategory("home")).toBe("calm relaxing acoustic background");
    expect(moodQueryForCategory("fashion")).toBe("upbeat trendy pop instrumental");
  });

  it("digital and tech are synonyms (both map to tech)", () => {
    expect(moodQueryForCategory("digital")).toBe("energetic electronic tech background");
    expect(moodQueryForCategory("tech")).toBe(moodQueryForCategory("digital"));
  });

  it("case-insensitive, trims whitespace", () => {
    expect(moodQueryForCategory("BEAUTY")).toBe("upbeat fashion pop instrumental");
    expect(moodQueryForCategory("  Food  ")).toBe("warm cozy acoustic background");
  });

  it("unknown / empty / null / undefined fall back to generic ambient", () => {
    expect(moodQueryForCategory("does not exist")).toBe("ambient background music");
    expect(moodQueryForCategory("")).toBe("ambient background music");
    expect(moodQueryForCategory(null)).toBe("ambient background music");
    expect(moodQueryForCategory(undefined)).toBe("ambient background music");
    expect(moodQueryForCategory("other")).toBe("ambient background music");
  });
});

describe("moodQueryForMood (user-selected music mood → search term)", () => {
  it("each mood maps to a different search term", () => {
    expect(moodQueryForMood("upbeat")).toContain("upbeat");
    expect(moodQueryForMood("chill")).toContain("chill");
    expect(moodQueryForMood("energetic")).toContain("energetic");
    expect(moodQueryForMood("emotional")).toContain("emotional");
  });
  it("case-insensitive", () => {
    expect(moodQueryForMood("UPBEAT")).toBe(moodQueryForMood("upbeat"));
  });
  it("none / unknown / empty fall back to generic ambient", () => {
    expect(moodQueryForMood("none")).toBe("ambient background music");
    expect(moodQueryForMood("")).toBe("ambient background music");
    expect(moodQueryForMood(null)).toBe("ambient background music");
    expect(moodQueryForMood("xyz")).toBe("ambient background music");
  });
});
