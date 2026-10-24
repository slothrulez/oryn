import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "@/lib/circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts closed; opens after the threshold of consecutive failures", () => {
    const b = new CircuitBreaker(2, 1000);
    expect(b.isOpen()).toBe(false);
    b.recordFailure();
    expect(b.isOpen()).toBe(false); // 1 failure, threshold not reached
    b.recordFailure();
    expect(b.isOpen()).toBe(true); // 2nd failure hits threshold → open
  });

  it("a single success resets (clears the failure count and the open state)", () => {
    const b = new CircuitBreaker(2, 1000);
    b.recordFailure();
    b.recordSuccess();
    b.recordFailure();
    expect(b.isOpen()).toBe(false); // after reset only 1 failure accumulated, threshold not reached
  });

  it("automatically half-opens after the cooldown (injected clock)", () => {
    let t = 0;
    const b = new CircuitBreaker(1, 1000, () => t);
    b.recordFailure();
    expect(b.isOpen()).toBe(true);
    t = 999;
    expect(b.isOpen()).toBe(true);
    t = 1001;
    expect(b.isOpen()).toBe(false); // cooldown expired → half-open, allow through
  });
});
