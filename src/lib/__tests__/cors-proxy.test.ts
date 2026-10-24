import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * Local-tool CORS (v0.8.79): /api/* reflects localhost origins only, so browser
 * pages on other local ports (the infinite-canvas Oryn node) can call us,
 * while a remote malicious page — whose origin can never be localhost — still
 * hits the browser's same-origin wall. These tests pin that security boundary.
 */

const url = "http://localhost:3457/api/health";

describe("CORS proxy security boundary", () => {
  it("localhost origin on any port: preflight 204 + headers echoed exactly", () => {
    const res = proxy(
      new NextRequest(url, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3800", "access-control-request-headers": "content-type" },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3800");
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
  });

  it("127.0.0.1 origin is allowed too (headers added on plain requests)", () => {
    const res = proxy(new NextRequest(url, { method: "GET", headers: { origin: "http://127.0.0.1:5173" } }));
    expect(res.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
  });

  it("non-localhost origin: zero CORS headers (the browser wall stays intact)", () => {
    for (const origin of ["https://evil.example.com", "http://localhost.evil.com", "http://sub.localhost:3800"]) {
      const res = proxy(new NextRequest(url, { method: "GET", headers: { origin } }));
      expect(res.headers.get("access-control-allow-origin"), `origin ${origin} should not be allowed`).toBeNull();
    }
  });

  it("same-origin/no-Origin requests are unaffected", () => {
    const res = proxy(new NextRequest(url, { method: "GET" }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
