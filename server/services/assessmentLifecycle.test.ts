import { describe, expect, it } from "vitest";
import { isAttemptExpired, validatePublication } from "./assessmentLifecycle";

describe("assessment lifecycle validation", () => {
  it("requires an approved question before publishing", () => {
    expect(validatePublication("now", 0, null, null)).toBe("Add at least one approved question before publishing.");
  });

  it("requires a valid window for scheduled assessments", () => {
    expect(validatePublication("schedule", 2, null, null)).toBe("Set a start and end time before scheduling.");
    expect(validatePublication("schedule", 2, new Date("2026-08-20T10:00:00Z"), new Date("2026-08-20T09:00:00Z"))).toBe("The scheduled end time must be after the start time.");
  });

  it("accepts a publishable live or scheduled test", () => {
    expect(validatePublication("now", 1, null, null)).toBeNull();
    expect(validatePublication("schedule", 1, new Date("2026-08-20T09:00:00Z"), new Date("2026-08-20T10:00:00Z"))).toBeNull();
  });
});

describe("server-authoritative attempt expiry", () => {
  it("treats the exact deadline as expired", () => {
    const deadline = new Date("2026-08-20T10:00:00Z");
    expect(isAttemptExpired(deadline, new Date("2026-08-20T09:59:59Z"))).toBe(false);
    expect(isAttemptExpired(deadline, deadline)).toBe(true);
  });
});
