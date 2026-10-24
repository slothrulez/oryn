import { describe, it, expect } from "vitest";
import { checkAdCompliance, checkScriptCompliance } from "@/lib/ad-compliance";

describe("checkAdCompliance (ad-claim risk scan)", () => {
  it("flags absolute claims", () => {
    const terms = checkAdCompliance("This is the world's best gadget, number one, 100% guaranteed").map((x) => x.term);
    expect(terms).toContain("world's best");
    expect(terms).toContain("number one");
    expect(terms).toContain("100% guaranteed");
  });

  it("flags medical / false efficacy claims", () => {
    const terms = checkAdCompliance("Cures acne with instant results, clinically proven").map((x) => x.term);
    expect(terms).toContain("cures");
    expect(terms).toContain("instant results");
    expect(terms).toContain("clinically proven");
  });

  it("flags claims that need certification (med)", () => {
    const v = checkAdCompliance("all natural, no additives formula");
    expect(v.map((x) => x.term)).toEqual(expect.arrayContaining(["all natural", "no additives"]));
    expect(v.find((x) => x.term === "all natural")?.severity).toBe("med");
  });

  it("dedupes and puts high severity first", () => {
    const v = checkAdCompliance("number one, number one, all natural, world's best");
    expect(v.filter((x) => x.term === "number one").length).toBe(1);
    expect(v[0].severity).toBe("high");
  });

  it("compliant copy has no hits (no false positives)", () => {
    expect(checkAdCompliance("These tissues are soft and gentle, great value to stock up, people rebuy them")).toEqual([]);
  });

  it("empty / null text", () => {
    expect(checkAdCompliance("")).toEqual([]);
    expect(checkAdCompliance(null as unknown as string)).toEqual([]);
  });

  it("every hit carries a suggestion", () => {
    for (const v of checkAdCompliance("number one cures all natural")) expect(v.suggestion.length).toBeGreaterThan(0);
  });
});

describe("checkScriptCompliance (whole-script scan)", () => {
  it("scans voiceover + overlays and dedupes the summary", () => {
    const shots = [
      { voiceover: "the number one gadget", textOverlay: { text: "100% guaranteed" } },
      { voiceover: "cures acne", textOverlay: null },
    ];
    const terms = checkScriptCompliance(shots).map((x) => x.term);
    expect(terms).toContain("number one");
    expect(terms).toContain("100% guaranteed");
    expect(terms).toContain("cures");
  });

  it("empty script has no hits", () => {
    expect(checkScriptCompliance([])).toEqual([]);
  });
});

describe("price absolutes + false urgency", () => {
  it("price absolute: lowest price ever is reported once", () => {
    const hits = checkAdCompliance("Lowest price ever today, go!");
    expect(hits.map((x) => x.term)).toEqual(["lowest price ever"]);
    expect(hits[0].category).toBe("Absolute claim");
    expect(hits[0].severity).toBe("high");
  });

  it("all-time low / best-selling of all time are absolute claims", () => {
    const terms = checkAdCompliance("An all-time low for the best-selling of all time").map((x) => x.term);
    expect(terms).toContain("all-time low");
    expect(terms).toContain("best-selling of all time");
  });

  it("false urgency: last day / price goes up tomorrow → med warning with a provability hint", () => {
    const hits = checkAdCompliance("Last day — the price goes up tomorrow");
    const urgency = hits.filter((x) => x.category === "False urgency");
    expect(urgency.map((x) => x.term)).toEqual(expect.arrayContaining(["last day", "price goes up tomorrow"]));
    for (const u of urgency) {
      expect(u.severity).toBe("med");
      expect(u.suggestion).toContain("provable");
    }
  });

  it("normal promo copy is not flagged (relative wording / real dates)", () => {
    expect(checkAdCompliance("This one is really popular, and the sale ends this Sunday")).toEqual([]);
  });
});
