export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Starts the explicit local-development login flow. In production, the parent
// NeuroClass application supplies a signed handoff and no client-side provider
// or bearer token is used.
export const startLogin = async () => {
  if (import.meta.env.DEV) {
    await fetch("/api/auth/dev", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
    window.location.reload();
    return;
  }
  window.parent?.postMessage({ type: "NEUROCLASS_AUTH_REQUIRED" }, "*");
};
