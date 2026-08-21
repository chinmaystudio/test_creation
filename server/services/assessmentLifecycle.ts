export function isAttemptExpired(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function validatePublication(
  mode: "now" | "schedule",
  questionCount: number,
  scheduledStart: Date | null,
  scheduledEnd: Date | null
): string | null {
  if (questionCount < 1) return "Add at least one approved question before publishing.";
  if (mode === "schedule" && (!scheduledStart || !scheduledEnd)) return "Set a start and end time before scheduling.";
  if (mode === "schedule" && scheduledStart && scheduledEnd && scheduledStart >= scheduledEnd) return "The scheduled end time must be after the start time.";
  return null;
}
