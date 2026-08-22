import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getSql } from "./db";
import { ENV } from "./_core/env";

const questionSchema = z.object({
  type: z.enum(["mcq", "multiple_select", "true_false", "fill_blank", "short_answer", "long_answer", "numerical", "coding"]),
  questionText: z.string().min(1).max(10000),
  options: z.array(z.object({ text: z.string().min(1).max(4000), isCorrect: z.boolean() })).default([]),
  correctAnswer: z.string().max(10000),
  explanation: z.string().max(10000).optional().nullable(),
  marks: z.number().min(0).max(1000),
  negativeMarks: z.number().min(0).max(1000).default(0),
});

const classroomInput = z.object({ classroomId: z.string().uuid() });

type SharedSql = NonNullable<ReturnType<typeof getSql>>;

function requireSql(): SharedSql {
  const sql = getSql();
  if (!sql) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shared Supabase database is unavailable." });
  return sql;
}

function identityCandidates(user: { openId?: string | null; email?: string | null; id?: number | null }) {
  return [user.openId, user.email, user.id == null ? null : String(user.id)].filter(Boolean) as string[];
}

async function assertTeacher(sql: SharedSql, user: any, classroomId: string) {
  const candidates = identityCandidates(user);
  const rows = await sql`SELECT id, name, subject FROM public.classrooms WHERE id = ${classroomId}::uuid AND user_id::text = ANY(${candidates}::text[]) LIMIT 1`;
  if (!rows[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this classroom." });
  return rows[0];
}

async function getStudent(sql: SharedSql, user: any, classroomId: string) {
  const candidates = identityCandidates(user);
  const rows = await sql`SELECT id, name, email, classroom_id FROM public.students WHERE classroom_id = ${classroomId}::uuid AND (user_id::text = ANY(${candidates}::text[]) OR (email IS NOT NULL AND email = ${user.email ?? ""})) LIMIT 1`;
  if (!rows[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You are not enrolled in this classroom." });
  return rows[0];
}

export const sharedClassroomRouter = router({
  context: protectedProcedure.input(classroomInput).query(async ({ ctx, input }) => {
    const sql = requireSql();
    let role: "teacher" | "student";
    let identity: any;
    try {
      identity = await assertTeacher(sql, ctx.user, input.classroomId);
      role = "teacher";
    } catch {
      identity = await getStudent(sql, ctx.user, input.classroomId);
      role = "student";
    }
    const tests = role === "teacher"
      ? await sql`SELECT id, title, subject, duration_mins, total_marks, questions, proctoring_enabled, status, created_at, scheduled_start, scheduled_end FROM public.tests WHERE classroom_id = ${input.classroomId}::uuid ORDER BY created_at DESC`
      : await sql`SELECT id, title, subject, duration_mins, total_marks, questions, proctoring_enabled, status, created_at, scheduled_start, scheduled_end FROM public.tests WHERE classroom_id = ${input.classroomId}::uuid AND status IN ('published','live') AND EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = ${identity.id}::text AND s.classroom_id = public.tests.classroom_id) ORDER BY created_at DESC`;
    const visibleTests = role === "teacher" ? tests : tests.map((test: any) => ({ ...test, questions: (Array.isArray(test.questions) ? test.questions : []).map(({ correctAnswer: _correctAnswer, explanation: _explanation, ...question }: any) => question) }));
    return { role, classroom: identity, tests: visibleTests };
  }),

  create: protectedProcedure.input(z.object({
    classroomId: z.string().uuid(), title: z.string().min(3).max(250), subject: z.string().min(1).max(200),
    durationMins: z.number().int().min(1).max(480), totalMarks: z.number().min(0).max(10000),
    questions: z.array(questionSchema).min(1).max(500), proctoringEnabled: z.boolean().default(true),
    publish: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const sql = requireSql();
    await assertTeacher(sql, ctx.user, input.classroomId);
    const id = crypto.randomUUID();
    await sql`INSERT INTO public.tests (id, classroom_id, title, subject, duration_mins, total_marks, questions, proctoring_enabled, status, created_by) VALUES (${id}::uuid, ${input.classroomId}::uuid, ${input.title}, ${input.subject}, ${input.durationMins}, ${input.totalMarks}, ${JSON.stringify(input.questions)}::jsonb, ${input.proctoringEnabled}, ${input.publish ? "published" : "draft"}, ${ctx.user.openId ?? ctx.user.email ?? String(ctx.user.id)})`;
    return { id };
  }),

  startAttempt: protectedProcedure.input(z.object({ classroomId: z.string().uuid(), testId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const sql = requireSql();
    const student = await getStudent(sql, ctx.user, input.classroomId);
    const tests = await sql`SELECT id, title, duration_mins, total_marks, questions, proctoring_enabled, status FROM public.tests WHERE id = ${input.testId}::uuid AND classroom_id = ${input.classroomId}::uuid AND status IN ('published','live') LIMIT 1`;
    const test = tests[0];
    if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "This test is not available for your classroom." });
    const existing = await sql`SELECT id, status FROM public.attempts WHERE test_id = ${input.testId}::uuid AND student_id = ${student.id}::text AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1`;
    if (existing[0]) {
      const safeTest = { ...test, questions: (Array.isArray(test.questions) ? test.questions : []).map(({ correctAnswer: _correctAnswer, explanation: _explanation, ...question }: any) => question) };
      return { attemptId: existing[0].id, test: safeTest };
    }
    const attemptId = crypto.randomUUID();
    await sql`INSERT INTO public.attempts (id, test_id, student_id, status, answers, violations, started_at) VALUES (${attemptId}::uuid, ${input.testId}::uuid, ${student.id}::text, 'in_progress', '{}'::jsonb, '[]'::jsonb, now())`;
    const safeTest = { ...test, questions: (Array.isArray(test.questions) ? test.questions : []).map(({ correctAnswer: _correctAnswer, explanation: _explanation, ...question }: any) => question) };
    return { attemptId, test: safeTest };
  }),

  verifyFace: protectedProcedure.input(z.object({ attemptId: z.string().uuid(), imageDataUrl: z.string().min(32).max(8_000_000) })).mutation(async ({ ctx, input }) => {
    const sql = requireSql();
    const attempts = await sql`SELECT a.id, a.test_id, a.student_id, t.classroom_id, t.proctoring_enabled FROM public.attempts a JOIN public.tests t ON t.id = a.test_id WHERE a.id = ${input.attemptId}::uuid AND a.status = 'in_progress' LIMIT 1`;
    const attempt = attempts[0];
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Active attempt not found." });
    const student = await getStudent(sql, ctx.user, String(attempt.classroom_id));
    if (String(student.id) !== String(attempt.student_id)) throw new TRPCError({ code: "FORBIDDEN", message: "Attempt identity mismatch." });
    if (!attempt.proctoring_enabled) return { verified: true, state: "DISABLED" as const };
    if (!ENV.mlProctoringUrl || !ENV.mlProctoringApiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Face proctoring service is not configured." });
    const match = input.imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "A JPEG, PNG, or WebP image is required." });
    const body = new FormData();
    body.append("classroom_id", String(attempt.classroom_id));
    body.append("session_id", String(attempt.id));
    body.append("capture_mode", "manual");
    body.append("target_student_id", String(student.id));
    body.append("file", new Blob([Buffer.from(match[2], "base64")], { type: match[1] }), "proctoring.jpg");
    const response = await fetch(`${ENV.mlProctoringUrl.replace(/\/$/, "")}/ai/v1/proctoring/exam-frame`, { method: "POST", headers: { "X-AI-Service-Secret": ENV.mlProctoringApiKey }, body });
    if (!response.ok) throw new TRPCError({ code: "TIMEOUT", message: "Face proctoring service is temporarily unavailable." });
    const result = await response.json() as { verified?: boolean; state?: string; similarity?: number; reason?: string };
    if (!result.verified) {
      await sql`UPDATE public.attempts SET violations = violations || ${JSON.stringify([{ type: result.state ?? "UNKNOWN_FACE", reason: result.reason ?? "Face could not be verified", at: new Date().toISOString() }])}::jsonb WHERE id = ${input.attemptId}::uuid`;
    }
    return result;
  }),

  submit: protectedProcedure.input(z.object({ attemptId: z.string().uuid(), answers: z.record(z.string(), z.unknown()) })).mutation(async ({ ctx, input }) => {
    const sql = requireSql();
    const rows = await sql`SELECT a.id, a.student_id, a.test_id, t.classroom_id, t.title, t.total_marks, t.questions FROM public.attempts a JOIN public.tests t ON t.id = a.test_id WHERE a.id = ${input.attemptId}::uuid AND a.status = 'in_progress' LIMIT 1`;
    const attempt = rows[0];
    if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Active attempt not found." });
    const student = await getStudent(sql, ctx.user, String(attempt.classroom_id));
    if (String(student.id) !== String(attempt.student_id)) throw new TRPCError({ code: "FORBIDDEN", message: "Attempt identity mismatch." });
    const questions = Array.isArray(attempt.questions) ? attempt.questions : [];
    let score = 0;
    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i] as any;
      const answer = input.answers[String(i)];
      if (answer != null && JSON.stringify(answer) === JSON.stringify(question.correctAnswer)) score += Number(question.marks ?? 0);
    }
    const percentage = Number(attempt.total_marks) > 0 ? (score / Number(attempt.total_marks)) * 100 : 0;
    await sql`UPDATE public.attempts SET status = 'submitted', answers = ${JSON.stringify(input.answers)}::jsonb, score = ${score}, submitted_at = now(), finished_at = now() WHERE id = ${input.attemptId}::uuid`;
    await sql`INSERT INTO public.test_submissions (test_id, student_id, student_name, marks_obtained, total_marks, percentage, answers, proctoring_violations) VALUES (${attempt.test_id}::uuid, ${student.id}::text, ${student.name}, ${score}, ${attempt.total_marks}, ${percentage}, ${JSON.stringify(input.answers)}::jsonb, COALESCE((SELECT violations FROM public.attempts WHERE id = ${input.attemptId}::uuid), '[]'::jsonb))`;
    return { score, percentage };
  }),
});
