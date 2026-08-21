import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextWithRole(role: "user" | "admin" | "teacher" | "student"): TrpcContext {
  return {
    user: {
      id: 11,
      openId: `role-${role}`,
      name: "Role test user",
      email: `${role}@example.test`,
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("assessment role boundaries", () => {
  it("rejects generic users from teacher assessment procedures", async () => {
    const caller = appRouter.createCaller(contextWithRole("user"));
    await expect(caller.assessments.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects teachers from student-only assessment procedures", async () => {
    const caller = appRouter.createCaller(contextWithRole("teacher"));
    await expect(caller.studentTests.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects generic users from proctoring event submission", async () => {
    const caller = appRouter.createCaller(contextWithRole("user"));
    await expect(caller.proctoring.record({
      attemptId: "attempt_1",
      eventType: "tab_switch",
      severity: "low",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
