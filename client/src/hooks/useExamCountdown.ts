import { useEffect, useState } from "react";

export function useExamCountdown(expiresAt: Date | string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  const deadline = expiresAt ? new Date(expiresAt).getTime() : now;
  const remaining = Math.max(0, deadline - now);
  return { remaining, minutes: Math.floor(remaining / 60_000), seconds: Math.floor((remaining % 60_000) / 1000), expired: remaining <= 0 };
}
