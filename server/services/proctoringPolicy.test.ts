import { describe, expect, it } from "vitest";
import { DEFAULT_SECURITY_CONFIGURATION } from "../../shared/assessment";
import { directBrowserSeverity, serviceFailureBlocksAttempt, timedAttemptEligibility } from "./proctoringPolicy";

describe("proctoring policy", () => {
  it("blocks a protected attempt only when the teacher selected the block policy", () => {
    expect(serviceFailureBlocksAttempt({ ...DEFAULT_SECURITY_CONFIGURATION, aiProctoringEnabled: true, proctoringFailurePolicy: "block" }, false)).toBe(true);
    expect(serviceFailureBlocksAttempt({ ...DEFAULT_SECURITY_CONFIGURATION, aiProctoringEnabled: true, proctoringFailurePolicy: "warn" }, false)).toBe(false);
  });

  it("derives browser-signal severity on the server rather than trusting the browser", () => {
    expect(directBrowserSeverity("tab_switch")).toBe("medium");
    expect(directBrowserSeverity("fullscreen_exit")).toBe("low");
  });

  it("requires calibration only when the teacher selected the block policy", () => {
    const blocked = { ...DEFAULT_SECURITY_CONFIGURATION, aiProctoringEnabled: true, proctoringFailurePolicy: "block" as const };
    const fallback = { ...DEFAULT_SECURITY_CONFIGURATION, aiProctoringEnabled: true, proctoringFailurePolicy: "fallback_browser_signals" as const };
    expect(timedAttemptEligibility(blocked, false)).toMatchObject({ allowed: false, fallback: false });
    expect(timedAttemptEligibility(blocked, true)).toMatchObject({ allowed: true, fallback: false });
    expect(timedAttemptEligibility(fallback, false)).toMatchObject({ allowed: true, fallback: true });
  });
});
