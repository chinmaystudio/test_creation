import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function query(req: Request, name: string) {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}

export function registerAuthRoutes(app: Express) {
  app.get("/health", (_req, res) => res.status(200).json({ ok: true, auth: "supabase-handoff" }));

  app.get("/api/auth/handoff", async (req: Request, res: Response) => {
    const token = query(req, "token");
    const redirect = query(req, "redirect") || "/";
    if (!token) return res.status(400).json({ error: "handoff token is required" });
    const identity = await sdk.verifyHandoff(token);
    if (!identity) {
      console.error("[Handoff] Invalid or expired handoff token received.");
      return res.status(401).json({ error: "handoff token is invalid or expired" });
    }
    const user = await db.upsertHandoffUser({ openId: identity.userId, email: identity.email, name: identity.name, role: identity.role }).catch(e => {
      console.error("[Handoff] Database upsert failed:", e);
      return undefined;
    });
    if (!user) {
      console.error("[Handoff] Failed to retrieve or create user in portal database.");
      return res.status(503).json({ error: "portal database is unavailable" });
    }
    const session = await sdk.signSession(identity, ONE_YEAR_MS);
    res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
    return res.redirect(302, safeRedirect);
  });

  app.post("/api/auth/dev", async (req: Request, res: Response) => {
    if (!ENV.devAuthEnabled) return res.status(404).json({ error: "not found" });
    const identity = {
      userId: String(req.body?.userId || "local-dev-user"),
      email: String(req.body?.email || "dev@example.com"),
      name: String(req.body?.name || "Local Developer"),
      role: (req.body?.role === "student" ? "student" : "teacher") as "teacher" | "student",
    };
    const user = await db.upsertHandoffUser({ openId: identity.userId, email: identity.email, name: identity.name, role: identity.role });
    if (!user) return res.status(503).json({ error: "portal database is unavailable" });
    const session = await sdk.signSession(identity, ONE_YEAR_MS);
    res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    return res.json({ ok: true, user: { email: identity.email, role: identity.role } });
  });
}
