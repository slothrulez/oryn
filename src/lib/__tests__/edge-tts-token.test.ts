import { describe, it, expect } from "vitest";
import { secMsGecV2 } from "@/lib/edge-tts-token";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

// Reference values from edge-tts 7.3.1 `generate_sec_ms_gec_v2(ts)`.
describe("secMsGecV2", () => {
  it.each([
    [1792773423.61, "3AEC7B544EE1F1BB-E19FC25F3BC9F9D93E1720D9FC2E6C456132FFB4A07576D031D7E87E7F9D5E6D"],
    [1700000000, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"],
    [0, "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6"],
  ])("matches the reference token at %s", (ts, expected) => {
    expect(secMsGecV2(TOKEN, ts)).toBe(expected);
  });
});
