import { describe, it, expect } from "vitest";
import { stylePrompts, styleNameMap, styleFormGroups, type ScriptStyleType } from "@/lib/script-engine/prompts";
import { validateCharacters } from "@/lib/script-engine/generator";
import { assignCharacterVoices } from "@/lib/character-voices";
import type { ScriptCharacter } from "@/lib/db/schema";

describe("ten-style system (story/object/talking-head/scene forms)", () => {
  const nonCustom = (Object.keys(styleNameMap) as ScriptStyleType[]).filter((s) => s !== "custom");

  it("every non-custom style has a prompt and display name", () => {
    for (const s of nonCustom) {
      expect(stylePrompts[s as Exclude<ScriptStyleType, "custom">]?.length, s).toBeGreaterThan(100);
      expect(styleNameMap[s].length, s).toBeGreaterThan(0);
    }
  });

  it("form groups cover every non-custom style exactly once", () => {
    const grouped = styleFormGroups.flatMap((g) => g.styles);
    expect([...grouped].sort()).toEqual([...nonCustom].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("dialogue styles (drama/interview/product_pov) all require characters output", () => {
    for (const s of ["drama", "interview", "product_pov"] as const) {
      expect(stylePrompts[s], s).toContain("characters");
      expect(stylePrompts[s], s).toContain("characterId");
    }
  });

  it("non-dialogue styles do not force characters (unboxing is explicitly single-person with no characters)", () => {
    expect(stylePrompts.unboxing).toMatch(/no characters|without characters|omit characters|characters: none/i);
  });
});

describe("validateCharacters (LLM character array parsing)", () => {
  it("valid arrays keep fields, invalid entries are dropped, capped at 4", () => {
    const raw = [
      { id: "char_a", name: "Mia", gender: "female", persona: "sharp-tongued", appearance: "long straight black hair" },
      { id: "", name: "No ID" },
      { id: "char_b", name: "Big Joe", gender: "male" },
      "not-an-object",
      { id: "c3", name: "Three" },
      { id: "c4", name: "Four" },
      { id: "c5", name: "Five" },
    ];
    const out = validateCharacters(raw)!;
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ id: "char_a", name: "Mia", gender: "female", persona: "sharp-tongued", appearance: "long straight black hair" });
    expect(out[1].gender).toBe("male");
  });

  it("unknown gender falls back to female; empty/non-array → undefined", () => {
    expect(validateCharacters([{ id: "a", name: "x", gender: "robot" }])![0].gender).toBe("female");
    expect(validateCharacters([])).toBeUndefined();
    expect(validateCharacters("nope")).toBeUndefined();
  });
});

describe("assignCharacterVoices (free multi-voice assignment)", () => {
  const cast = (n: number, gender: "female" | "male"): ScriptCharacter[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${gender}_${i}`, name: `Character ${i}`, gender }));

  it("same-gender characters get distinct voices", () => {
    const m = assignCharacterVoices(cast(3, "female"));
    expect(new Set(m.values()).size).toBe(3);
  });

  it("deterministic: the same cast assigns the same voices twice (re-rendering keeps voices)", () => {
    const c = [...cast(2, "female"), ...cast(2, "male")];
    expect([...assignCharacterVoices(c)]).toEqual([...assignCharacterVoices(c)]);
  });

  it("the female pool does not start with the default narrator voice (dialogue characters must not share the narrator's voice)", () => {
    const m = assignCharacterVoices(cast(1, "female"));
    expect([...m.values()][0]).not.toBe("en-US-AvaNeural");
  });

  it("mixed genders use their own pools; duplicate ids are assigned once", () => {
    const c: ScriptCharacter[] = [
      { id: "a", name: "A", gender: "female" },
      { id: "b", name: "B", gender: "male" },
      { id: "a", name: "A2", gender: "female" },
    ];
    const m = assignCharacterVoices(c);
    expect(m.size).toBe(2);
    expect(m.get("a")).toMatch(/Jenny|Sonia|Natasha/);
    expect(m.get("b")).toMatch(/Guy|Christopher|Ryan/);
  });
});
