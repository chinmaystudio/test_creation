import type { SecurityConfiguration } from "../../shared/assessment";

export function proctoringFailureAction(security: SecurityConfiguration) {
  if (!security.aiProctoringEnabled) return "disabled" as const;
  return security.proctoringFailurePolicy;
}

export function directBrowserSeverity(eventType: "tab_switch" | "fullscreen_exit" | "focus_change") {
  return eventType === "tab_switch" ? "medium" as const : "low" as const;
}

export function serviceFailureBlocksAttempt(security: SecurityConfiguration, serviceReady: boolean) {
  return security.aiProctoringEnabled && !serviceReady && security.proctoringFailurePolicy === "block";
}

export function timedAttemptEligibility(security: SecurityConfiguration, baselineFinalized: boolean) {
  if (!security.aiProctoringEnabled || baselineFinalized) return { allowed: true, fallback: false, reason: null } as const;
  if (security.proctoringFailurePolicy === "block") return { allowed: false, fallback: false, reason: "Complete the required proctoring baseline before this examination timer can start." } as const;
  return { allowed: true, fallback: true, reason: "Baseline unavailable; continue under the teacher-selected fallback policy." } as const;
}
