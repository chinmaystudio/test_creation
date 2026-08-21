export type IntegrityEvent = {
  severity: "low" | "medium" | "high";
  confidence: number | null;
};

const severityWeight: Record<IntegrityEvent["severity"], number> = {
  low: 2,
  medium: 6,
  high: 15,
};

/**
 * Produces a conservative review aid rather than a misconduct determination.
 * Low-confidence events have less impact and repeated signals accumulate.
 */
export function calculateIntegrityScore(events: IntegrityEvent[]): number {
  const deduction = events.reduce((total, event) => {
    const confidence = Math.min(1, Math.max(0, event.confidence ?? 0.5));
    return total + severityWeight[event.severity] * confidence;
  }, 0);

  return Math.max(0, Math.round((100 - deduction) * 10) / 10);
}
