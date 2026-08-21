import { describe, expect, it } from "vitest";
import { calculateIntegrityScore } from "./integrity";

describe("calculateIntegrityScore", () => {
  it("retains a perfect score when no review signals were recorded", () => {
    expect(calculateIntegrityScore([])).toBe(100);
  });

  it("weights severity conservatively and reduces low-confidence signals", () => {
    expect(calculateIntegrityScore([
      { severity: "high", confidence: 0.5 },
      { severity: "low", confidence: 1 },
    ])).toBe(90.5);
  });

  it("bounds the review aid between zero and one hundred", () => {
    const events = Array.from({ length: 20 }, () => ({ severity: "high" as const, confidence: 1 }));
    expect(calculateIntegrityScore(events)).toBe(0);
  });
});
