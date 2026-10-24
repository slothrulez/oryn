import { describe, it, expect } from "vitest";
import { buildProductScenePrompt, stripTextDirectives } from "@/lib/product-scene-prompt";
import { QUICK_CUT_COMPOSE_BODY, CINEMATIC_COMPOSE_BODY } from "@/lib/pipeline-runner";
import { parseRerankPicks, REJECT_PICK, type RerankShot } from "@/lib/semantic-match";

describe("product scene prompt", () => {
  it("drops quoted on-screen copy and text-overlay directives", () => {
    const d = "Text overlays showing 'Over 100,000 satisfied customers!' fades over an image of the cup on a counter.";
    const out = stripTextDirectives(d);
    expect(out).not.toContain("100,000");
    expect(out).not.toMatch(/text overlay/i);
    expect(out).toContain("cup on a counter");
  });

  it("locks product fidelity and asks for a new angle on non-hero shots", () => {
    const p = buildProductScenePrompt("Cup on a picnic table", true, "demo");
    expect(p).toContain("exactly unchanged");
    expect(p).toContain("different camera angle");
    expect(p).toMatch(/no added text/i);
  });

  it("lets the reveal stay close to the product photo", () => {
    expect(buildProductScenePrompt("Hero shot", true, "product_reveal")).not.toContain("different camera angle");
  });

  it("omits fidelity wording without a product photo and never emits an empty subject", () => {
    const p = buildProductScenePrompt("'Buy now'", false);
    expect(p).not.toContain("exactly unchanged");
    expect(p).toMatch(/^The product in a clean/);
  });
});

describe("quick cut compose defaults", () => {
  it("applies the ad-grade pack on top of free TTS", () => {
    expect(QUICK_CUT_COMPOSE_BODY).toMatchObject({
      freeTts: { enabled: true },
      captionPreset: "bold",
      freeBgm: true,
      bgmDuck: true,
      productCard: true,
      crossfade: true,
    });
    expect(QUICK_CUT_COMPOSE_BODY).not.toHaveProperty("hookCard");
    expect(CINEMATIC_COMPOSE_BODY).toMatchObject({ bgmDuck: "tight", hookCard: true, cutSfx: true, productCard: true });
  });
});

describe("semantic rerank rejection", () => {
  it("keeps -1 picks so off-topic shots fall back to the product photo", () => {
    const shots: RerankShot[] = [{ shotId: 1, text: "juicer", candidates: [{ title: "pigeons" }] }];
    const picks = parseRerankPicks('[{"shotId":1,"pick":-1}]', shots);
    expect(picks?.get(1)).toBe(REJECT_PICK);
  });
});
