import { describe, it, expect } from "vitest";
import { isBlockedIp, assertPublicUrl } from "@/lib/ssrf-guard";

describe("isBlockedIp", () => {
  it("blocks private/loopback/link-local/reserved IPv4", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it("allows public IPv4 (including just outside 172.16/12 and 100.64/10)", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "192.167.0.1", "100.63.0.1", "13.107.21.200"]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  it("IPv6: loopback/link-local/ULA/mapped private blocked, public allowed", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12::1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("invalid IPs are always blocked", () => {
    expect(isBlockedIp("notanip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});

describe("assertPublicUrl (IP literals, no DNS needed)", () => {
  it("private/metadata/loopback IPs throw", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
    await expect(assertPublicUrl("http://10.0.0.5:6379/")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
  });

  it("non-http/https protocols throw", async () => {
    await expect(assertPublicUrl("ftp://8.8.8.8/")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("not a url")).rejects.toThrow();
  });

  it("public IP literals pass", async () => {
    await expect(assertPublicUrl("http://8.8.8.8/")).resolves.toBeUndefined();
  });
});
