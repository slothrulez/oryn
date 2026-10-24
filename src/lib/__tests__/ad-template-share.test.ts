import { describe, it, expect } from "vitest";
import {
  AD_TEMPLATE_SHARE_KIND,
  AD_TEMPLATE_SHARE_VERSION,
  AD_TEMPLATE_PACK_KIND,
  exportAdTemplateShare,
  parseAdTemplateShare,
  exportAdTemplatePack,
  parseAdTemplateShareAny,
  encodeStoredAdTemplate,
  decodeStoredAdTemplate,
  getAdTemplate,
  AD_TEMPLATES,
  CUSTOM_AD_TEMPLATE_ID,
  type AdTemplate,
} from "@/lib/ad-templates";

/**
 * Template economy (v0.8.77): recipes travel as a small JSON envelope. Export must
 * round-trip through import; imports are clamped to the preset vocabularies and
 * screened against the ad-law lexicon — hits surface as warnings only (a recipe is
 * a creative directive, not published copy; the hard gate scans the finished
 * video's actual voiceover/captions at compose time). A shared file must never
 * crash the pipeline with unknown preset ids.
 */

const builtin = AD_TEMPLATES[0];

describe("export/import round trip", () => {
  it("export envelope has kind/version and no id; import fully restores recipe fields", () => {
    const text = exportAdTemplateShare(builtin);
    const doc = JSON.parse(text);
    expect(doc.kind).toBe(AD_TEMPLATE_SHARE_KIND);
    expect(doc.version).toBe(AD_TEMPLATE_SHARE_VERSION);
    expect(doc.template.id).toBeUndefined();

    const result = parseAdTemplateShare(text);
    expect(result.error).toBeUndefined();
    const tpl = result.template!;
    // importer mints its own id; every recipe field must survive the round trip
    expect(tpl.id).toBe(CUSTOM_AD_TEMPLATE_ID);
    expect(tpl.name).toEqual(builtin.name);
    expect(tpl.styleType).toBe(builtin.styleType);
    expect(tpl.videoMode).toBe(builtin.videoMode);
    expect(tpl.look).toBe(builtin.look);
    expect(tpl.cameraPlan).toEqual(builtin.cameraPlan);
    expect(tpl.compose.captionPreset).toBe(builtin.compose.captionPreset);
    expect(tpl.scriptHint.en).toBe(builtin.scriptHint.en);
  });

  it("all 391+ library templates round-trip losslessly (guards against future field drift)", () => {
    for (const tpl of AD_TEMPLATES) {
      const result = parseAdTemplateShare(exportAdTemplateShare(tpl));
      expect(result.template, `template ${tpl.id} should round-trip`).toBeTruthy();
      expect(result.template!.cameraPlan).toEqual(tpl.cameraPlan);
    }
  });
});

describe("import validation and compliance screening", () => {
  const wrap = (template: unknown) =>
    JSON.stringify({ kind: AD_TEMPLATE_SHARE_KIND, version: AD_TEMPLATE_SHARE_VERSION, template });

  it("bad JSON / wrong kind / too-new version / non-object template each report their own error code", () => {
    expect(parseAdTemplateShare("{oops").error).toBe("invalid_json");
    expect(parseAdTemplateShare(JSON.stringify({ kind: "other", version: 1, template: {} })).error).toBe("wrong_kind");
    expect(
      parseAdTemplateShare(JSON.stringify({ kind: AD_TEMPLATE_SHARE_KIND, version: 999, template: {} })).error
    ).toBe("unsupported_version");
    expect(parseAdTemplateShare(wrap("not-an-object")).error).toBe("invalid_template");
  });

  it("unknown preset ids are clamped to safe defaults instead of erroring (cross-version compatibility)", () => {
    const result = parseAdTemplateShare(
      wrap({
        name: { en: "Future" },
        styleType: "style_from_the_future",
        videoMode: "hologram",
        look: "nonexistent_look",
        cameraPlan: { hook: "warp_drive" },
      })
    );
    const tpl = result.template!;
    expect(tpl.styleType).toBe("pain-point");
    expect(tpl.videoMode).toBe("product_closeup");
    expect(tpl.look).toBe("daylight_clean");
    expect(Object.keys(tpl.cameraPlan).length).toBeGreaterThanOrEqual(2); // fallback plan injected
  });

  it("ad-law term hits only warn, never block (templates are creative directives; the hard gate is on the final video; guardrail phrasing always matches literally)", () => {
    const result = parseAdTemplateShare(
      wrap({ name: { en: "Wellness" }, scriptHint: { en: "Never say it cures anything or gives results in 3 days; last day sale tonight" } })
    );
    expect(result.error).toBeUndefined();
    expect(result.template).toBeTruthy();
    expect(result.warnings).toEqual(expect.arrayContaining(["cures", "results in 3 days", "last day"]));
  });
});

describe("multi-template pack sharing (pack envelope)", () => {
  it("pack export envelope has pack kind and strips each id; import restores every recipe", () => {
    const picks = AD_TEMPLATES.slice(0, 3);
    const text = exportAdTemplatePack(picks);
    const doc = JSON.parse(text);
    expect(doc.kind).toBe(AD_TEMPLATE_PACK_KIND);
    expect(doc.version).toBe(AD_TEMPLATE_SHARE_VERSION);
    expect(doc.templates).toHaveLength(3);
    expect(doc.templates.every((t: { id?: string }) => t.id === undefined)).toBe(true);

    const result = parseAdTemplateShareAny(text);
    expect(result.error).toBeUndefined();
    expect(result.templates).toHaveLength(3);
    result.templates!.forEach((tpl, i) => {
      expect(tpl.name).toEqual(picks[i].name);
      expect(tpl.cameraPlan).toEqual(picks[i].cameraPlan);
      expect(tpl.compose.captionPreset).toBe(picks[i].compose.captionPreset);
    });
  });

  it("the unified entry point also accepts a single-template envelope (returns 1 template)", () => {
    const result = parseAdTemplateShareAny(exportAdTemplateShare(AD_TEMPLATES[0]));
    expect(result.error).toBeUndefined();
    expect(result.templates).toHaveLength(1);
    expect(result.templates![0].styleType).toBe(AD_TEMPLATES[0].styleType);
  });

  it("pack error codes: wrong kind / too-new version / empty list or all non-objects → invalid_template", () => {
    expect(parseAdTemplateShareAny(JSON.stringify({ kind: "other", version: 1, templates: [] })).error).toBe("wrong_kind");
    expect(
      parseAdTemplateShareAny(JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 999, templates: [{}] })).error
    ).toBe("unsupported_version");
    expect(
      parseAdTemplateShareAny(JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 1, templates: [] })).error
    ).toBe("invalid_template");
    expect(
      parseAdTemplateShareAny(JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 1, templates: ["a", 42, null] })).error
    ).toBe("invalid_template");
  });

  it("non-object entries are dropped; remaining valid entries import normally", () => {
    const good = JSON.parse(exportAdTemplateShare(AD_TEMPLATES[1])).template;
    const result = parseAdTemplateShareAny(
      JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 1, templates: ["junk", good, null] })
    );
    expect(result.error).toBeUndefined();
    expect(result.templates).toHaveLength(1);
    expect(result.templates![0].name).toEqual(AD_TEMPLATES[1].name);
  });

  it("warnings are deduped across entries (two entries both hit cures, reported once)", () => {
    const risky = { name: { en: "W" }, scriptHint: { en: "never claim it cures anything" } };
    const result = parseAdTemplateShareAny(
      JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 1, templates: [risky, risky] })
    );
    expect(result.templates).toHaveLength(2);
    expect(result.warnings!.filter((w) => w === "cures")).toHaveLength(1);
  });

  it("packs over 100 templates are truncated to the cap (defends against hostile large files)", () => {
    const one = JSON.parse(exportAdTemplateShare(AD_TEMPLATES[0])).template;
    const result = parseAdTemplateShareAny(
      JSON.stringify({ kind: AD_TEMPLATE_PACK_KIND, version: 1, templates: Array(120).fill(one) })
    );
    expect(result.templates).toHaveLength(100);
  });
});

describe("encodeStoredAdTemplate inlines 'my templates'", () => {
  it("built-in templates store an id; non-built-in ids (my templates) inline JSON and decode back to the recipe", () => {
    expect(encodeStoredAdTemplate(builtin)).toBe(builtin.id);

    const mine: AdTemplate = { ...builtin, id: "3f2b7a9c-0000-4000-8000-000000000001" };
    const stored = encodeStoredAdTemplate(mine);
    expect(stored.startsWith("custom:")).toBe(true);
    const decoded = decodeStoredAdTemplate(stored)!;
    expect(decoded.styleType).toBe(builtin.styleType);
    expect(decoded.cameraPlan).toEqual(builtin.cameraPlan);
    // sanity: the bare uuid would have been unresolvable via the builtin lookup
    expect(getAdTemplate(mine.id)).toBeUndefined();
  });
});
