import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import { ForbiddenError } from "@shared/_core/errors";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

type IdentityPayload = { userId: string; email: string; role: "teacher" | "student" | "admin"; name: string; classroomId?: string };
export type SessionPayload = IdentityPayload & { kind: "portal-session" };
export type HandoffPayload = IdentityPayload & { kind: "neuroclass-handoff"; aud: "test_creation" };

function secret() {
  const value = process.env.PORTAL_HANDOFF_SECRET || ENV.handoffSecret || ENV.cookieSecret;
  if (!value || value.length < 32) throw new Error("PORTAL_HANDOFF_SECRET/JWT_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

export class SDKServer {
  async signHandoff(payload: Omit<HandoffPayload, "kind" | "aud">, expiresInMs = 60_000) {
    return new SignJWT({ ...payload, kind: "neuroclass-handoff" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("neuroclass")
      .setAudience("test_creation")
      .setIssuedAt()
      .setJti(crypto.randomUUID())
      .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
      .sign(secret());
  }

  async verifyHandoff(token: string): Promise<HandoffPayload | null> {
    try {
      const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], issuer: "neuroclass", audience: "test_creation" });
      const value = payload as Record<string, unknown>;
      if (value.kind !== "neuroclass-handoff" || !isNonEmptyString(value.userId) || !isNonEmptyString(value.email) || !isNonEmptyString(value.name) || !["teacher", "student", "admin"].includes(String(value.role))) {
        console.error("[Handoff SDK] Payload validation failed:", value);
        return null;
      }
      return { userId: value.userId, email: value.email, name: value.name, role: value.role as HandoffPayload["role"], classroomId: isNonEmptyString(value.classroomId) ? value.classroomId : undefined, kind: "neuroclass-handoff", aud: "test_creation" };
    } catch (e) {
      console.error("[Handoff SDK] JWT verification failed:", e);
      return null;
    }
  }

  async signSession(identity: IdentityPayload, expiresInMs = ONE_YEAR_MS) {
    return new SignJWT({ ...identity, kind: "portal-session" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
      .sign(secret());
  }

  async verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
      const value = payload as Record<string, unknown>;
      if (value.kind !== "portal-session" || !isNonEmptyString(value.userId) || !isNonEmptyString(value.email) || !isNonEmptyString(value.name) || !["teacher", "student", "admin"].includes(String(value.role))) return null;
      return { userId: value.userId, email: value.email, name: value.name, role: value.role as SessionPayload["role"], classroomId: isNonEmptyString(value.classroomId) ? value.classroomId : undefined, kind: "portal-session" };
    } catch { return null; }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    let token = cookies[COOKIE_NAME];
    if (!token && typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")) token = req.headers.authorization.slice(7);
    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Authentication handoff/session is missing or expired.");
    const user = await db.upsertHandoffUser({ openId: session.userId, email: session.email, name: session.name, role: session.role });
    if (!user) throw ForbiddenError("Portal identity could not be established.");
    return user;
  }
}

export const sdk = new SDKServer();
export type AuthenticatedUser = User;
