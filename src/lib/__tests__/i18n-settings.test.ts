import { describe, it, expect } from "vitest";
import { settings } from "@/lib/i18n/messages/settings";

/** Settings copy is English-only: required keys exist and contain no CJK characters. */
describe("settings i18n (English-only)", () => {
  const en = settings.en as Record<string, string>;
  it("connectFailed exists", () => {
    expect(en.connectFailed).toBeTruthy();
  });
  it("no locale other than en", () => {
    expect(Object.keys(settings)).toEqual(["en"]);
  });
  it("English values contain no CJK characters", () => {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === "string") expect(/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(v), k).toBe(false);
    }
  });
});
