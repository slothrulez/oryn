import { describe, it, expect } from "vitest";
import { buildAigcMetadataArgs } from "@/lib/compliance-metadata";

describe("buildAigcMetadataArgs (implicit AIGC marker metadata)", () => {
  it("contains all three elements: AI-generated label + service provider + content id", () => {
    const s = buildAigcMetadataArgs({ contentId: "proj-123" });
    expect(s).toContain("AIGC=1");
    expect(s).toContain("Content=AI");
    expect(s).toContain("Oryn"); // default service provider
    expect(s).toContain("proj-123"); // content production id
    expect(s).toContain("-metadata comment=");
    expect(s).toContain("-metadata copyright=");
    expect(s).toContain("-metadata description=");
  });

  it("deterministic: same input, same output", () => {
    expect(buildAigcMetadataArgs({ contentId: "x" })).toBe(buildAigcMetadataArgs({ contentId: "x" }));
  });

  it("a custom service provider takes effect", () => {
    expect(buildAigcMetadataArgs({ contentId: "x", serviceProvider: "My Brand" })).toContain("My Brand");
  });

  it("strips shell-injection characters (double quotes/$/backslash/backtick/newline)", () => {
    const s = buildAigcMetadataArgs({ contentId: 'a"b$c`d\\e\nf', serviceProvider: 'p$q' });
    expect(s).toContain("abcdef"); // remaining characters after dangerous chars are stripped
    expect(s).not.toContain("$");
    expect(s).not.toContain("`");
    expect(s).not.toContain("\\");
  });

  it("empty / missing contentId falls back to unknown", () => {
    expect(buildAigcMetadataArgs({ contentId: "" })).toContain("unknown");
  });
});
