import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  aiGenerationLogs,
  attemptAnswers,
  classrooms,
  proctoringAttemptStates,
  proctoringEvents,
  questionOptions,
  questions,
  testAssignments,
  testAttempts,
  testQuestions,
  testSettings,
  tests,
  users,
} from "../../drizzle/schema";
import {
  DEFAULT_SECURITY_CONFIGURATION,
  DEFAULT_TEST_CONFIGURATION,
  QUESTION_TYPES,
  TEST_STATUSES,
  type SecurityConfiguration,
  type TestConfiguration,
} from "../../shared/assessment";
import { getDb } from "../db";
import { aiProvider } from "../services/aiProvider";
import { calculateIntegrityScore } from "../services/integrity";
import { isAttemptExpired, validatePublication } from "../services/assessmentLifecycle";
import { analyzeMlFeatures, finalizeMlBaseline, isMlProctoringConfigured, mlServiceHealth, startMlBaseline, updateMlBaseline, type MlFeatureVector } from "../services/mlProctoringClient";
import { directBrowserSeverity, serviceFailureBlocksAttempt, timedAttemptEligibility } from "../services/proctoringPolicy";
import { storagePut } from "../storage";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const teacherProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "teacher" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teacher access is required." });
  }
  return next({ ctx });
});

const studentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "student") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Student access is required." });
  }
  return next({ ctx });
});

const questionTypeSchema = z.enum(QUESTION_TYPES);
const testConfigurationSchema = z.object({
  durationMinutes: z.number().int().min(1).max(480),
  passingPercentage: z.number().min(0).max(100),
  attemptLimit: z.number().int().min(1).max(10),
  navigationMode: z.enum(["sequential", "free"]),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  negativeMarking: z.boolean(),
  autoSubmit: z.boolean(),
  allowBackNavigation: z.boolean(),
  showResultsImmediately: z.boolean(),
  showCorrectAnswers: z.boolean(),
  allowAnswerReview: z.boolean(),
  adaptiveAssessment: z.boolean(),
});

const securityConfigurationSchema = z.object({
  cameraMonitoring: z.boolean(),
  faceVerification: z.boolean(),
  tabSwitchDetection: z.boolean(),
  fullscreenMode: z.boolean(),
  copyPasteRestriction: z.boolean(),
  multipleFaceDetection: z.boolean(),
  unknownFaceDetection: z.boolean(),
  suspiciousBehaviourLogging: z.boolean(),
  aiProctoringEnabled: z.boolean(),
  proctoringFailurePolicy: z.enum(["block", "warn", "fallback_browser_signals", "manual_review"]),
  proctoringSamplingHz: z.number().int().min(1).max(5),
  baselineSeconds: z.number().int().min(5).max(90),
  minimumEventSeconds: z.number().int().min(1).max(60),
  eventCooldownSeconds: z.number().int().min(3).max(300),
  storeEvidenceSnapshots: z.boolean(),
});

const mlFeatureVectorSchema = z.object({
  facePresent: z.boolean().optional(), faceCount: z.number().int().min(0).max(10).optional(),
  faceBboxArea: z.number().min(0).max(1).optional(), faceCenterX: z.number().min(0).max(1).optional(), faceCenterY: z.number().min(0).max(1).optional(),
  headPoseYaw: z.number().min(-180).max(180).optional(), headPosePitch: z.number().min(-180).max(180).optional(), headPoseRoll: z.number().min(-180).max(180).optional(),
  gazeHorizontal: z.number().min(-1).max(1).optional(), gazeVertical: z.number().min(-1).max(1).optional(), landmarkStability: z.number().min(0).max(1).optional(),
  faceQuality: z.number().min(0).max(1).optional(), frameQuality: z.number().min(0).max(1).optional(), movementScore: z.number().min(0).max(1).optional(), provider: z.string().min(1).max(80).optional(),
}).strict();

const questionInputSchema = z.object({
  type: questionTypeSchema,
  questionText: z.string().min(3).max(10000),
  imageKey: z.string().max(500).optional().nullable(),
  codeSnippet: z.string().max(20000).optional().nullable(),
  correctAnswer: z.string().max(10000),
  explanation: z.string().max(10000).optional().nullable(),
  marks: z.number().min(0.25).max(100),
  negativeMarks: z.number().min(0).max(100).default(0),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().min(1).max(200),
  learningObjective: z.string().max(500).optional().nullable(),
  options: z.array(z.object({ text: z.string().min(1).max(4000), isCorrect: z.boolean() })).default([]),
});

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
  return db;
}

function classroomIdForContext(ctx: { session?: { classroomId?: string } | null }, requested?: string | null): string | null {
  const requestedId = typeof requested === "string" && requested.trim() ? requested.trim() : null;
  const sessionId = typeof ctx.session?.classroomId === "string" && ctx.session.classroomId.trim() ? ctx.session.classroomId.trim() : null;
  if (requestedId && sessionId && requestedId !== sessionId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This assessment must stay within the classroom that opened the portal." });
  }
  return requestedId || sessionId;
}

function parseConfig<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ownedTest(testId: string, teacherId: number) {
  const db = requireDb(await getDb());
  const [test] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.id, testId), eq(tests.creatorId, teacherId)))
    .limit(1);
  if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found." });
  return { db, test };
}

async function activeStudentAttempt(attemptId: string, studentId: number, allowCalibrating = false) {
  const db = requireDb(await getDb());
  const [attempt] = await db.select().from(testAttempts).where(and(eq(testAttempts.id, attemptId), eq(testAttempts.studentId, studentId))).limit(1);
  if (!attempt || (attempt.status !== "in_progress" && (!allowCalibrating || attempt.status !== "calibrating"))) throw new TRPCError({ code: "BAD_REQUEST", message: "Active attempt not found." });
  const [test] = await db.select().from(tests).where(eq(tests.id, attempt.testId)).limit(1);
  if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found." });
  return { db, attempt, test, security: parseConfig<SecurityConfiguration>(test.securityConfig, DEFAULT_SECURITY_CONFIGURATION) };
}

async function setProctoringState(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, attemptId: string, values: { baseline: Record<string, unknown>; temporalState: Record<string, unknown>; modelVersion?: string | null; lastRiskScore?: number | null; lastRiskLevel?: "low" | "medium" | "high" | null; serviceStatus: "ready" | "unavailable" | "fallback" }) {
  await db.insert(proctoringAttemptStates).values({ attemptId, baseline: JSON.stringify(values.baseline), temporalState: JSON.stringify(values.temporalState), modelVersion: values.modelVersion ?? null, lastRiskScore: values.lastRiskScore ?? null, lastRiskLevel: values.lastRiskLevel ?? null, serviceStatus: values.serviceStatus }).onConflictDoUpdate({ target: proctoringAttemptStates.attemptId, set: { baseline: JSON.stringify(values.baseline), temporalState: JSON.stringify(values.temporalState), modelVersion: values.modelVersion ?? null, lastRiskScore: values.lastRiskScore ?? null, lastRiskLevel: values.lastRiskLevel ?? null, serviceStatus: values.serviceStatus, updatedAt: new Date() } });
}

function normalizeAnswer(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return JSON.stringify([...parsed].map(String).sort());
    return String(parsed).trim().toLocaleLowerCase();
  } catch {
    return value.trim().toLocaleLowerCase();
  }
}

async function calculateAttemptResult(attemptId: string) {
  const db = requireDb(await getDb());
  const [attempt] = await db.select().from(testAttempts).where(eq(testAttempts.id, attemptId)).limit(1);
  if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });

  const linkedQuestions = await db
    .select({ question: questions, ordering: testQuestions.position })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .where(eq(testQuestions.testId, attempt.testId))
    .orderBy(asc(testQuestions.position));
  const savedAnswers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));
  const byQuestion = new Map(savedAnswers.map(answer => [answer.questionId, answer]));

  let score = 0;
  let totalMarks = 0;
  for (const item of linkedQuestions) {
    const question = item.question;
    totalMarks += question.marks;
    const answer = byQuestion.get(question.id);
    const objective = ["mcq", "multiple_select", "true_false", "fill_blank", "numerical"].includes(question.type);
    if (!answer || !objective) continue;
    const isCorrect = normalizeAnswer(answer.answer) === normalizeAnswer(question.correctAnswer);
    const awardedMarks = isCorrect ? question.marks : -Math.min(question.negativeMarks, question.marks);
    score += awardedMarks;
    await db.update(attemptAnswers).set({ awardedMarks }).where(eq(attemptAnswers.id, answer.id));
  }

  const events = await db
    .select({ severity: proctoringEvents.severity, confidence: proctoringEvents.confidence })
    .from(proctoringEvents)
    .where(eq(proctoringEvents.attemptId, attemptId));
  const integrityScore = calculateIntegrityScore(events);
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  await db
    .update(testAttempts)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      score: Math.max(0, score),
      percentage: Math.max(0, percentage),
      integrityScore,
    })
    .where(eq(testAttempts.id, attemptId));

  return { score: Math.max(0, score), percentage: Math.max(0, percentage), integrityScore };
}

export const assessmentRouter = router({
  uploads: router({
    image: teacherProcedure.input(z.object({
      filename: z.string().min(1).max(128),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      dataUrl: z.string().min(32).max(8_000_000),
    })).mutation(async ({ ctx, input }) => {
      const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!match || match[1] !== input.contentType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a PNG, JPEG, or WebP image." });
      }
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Images must be smaller than 5 MB." });
      }
      const extension = input.contentType.split("/")[1];
      const object = await storagePut(`assessment-branding/${ctx.user.id}/${nanoid()}.${extension}`, bytes, input.contentType);
      return object;
    }),
  }),
  assessments: router({
    summary: teacherProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const rows = await db.select({ status: tests.status }).from(tests).where(eq(tests.creatorId, ctx.user.id));
      return {
        total: rows.length,
        drafts: rows.filter(item => item.status === "draft").length,
        scheduled: rows.filter(item => item.status === "scheduled").length,
        active: rows.filter(item => item.status === "live").length,
        completed: rows.filter(item => item.status === "completed").length,
      };
    }),
    listMine: teacherProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const rows = await db
        .select({ test: tests, settings: testSettings, classroomName: classrooms.name })
        .from(tests)
        .leftJoin(testSettings, eq(testSettings.testId, tests.id))
        .leftJoin(classrooms, eq(classrooms.id, tests.classroomId))
        .where(eq(tests.creatorId, ctx.user.id))
        .orderBy(desc(tests.createdAt));
      return Promise.all(rows.map(async row => {
        const [count] = await db.select({ value: sql<number>`count(*)` }).from(testQuestions).where(eq(testQuestions.testId, row.test.id));
        return { ...row, questionCount: Number(count?.value ?? 0) };
      }));
    }),
    getForTeacher: teacherProcedure.input(z.object({ testId: z.string().min(1) })).query(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      const linked = await db
        .select({ question: questions, position: testQuestions.position })
        .from(testQuestions)
        .innerJoin(questions, eq(testQuestions.questionId, questions.id))
        .where(eq(testQuestions.testId, test.id))
        .orderBy(asc(testQuestions.position));
      const withOptions = await Promise.all(linked.map(async item => ({
        ...item,
        options: await db.select().from(questionOptions).where(eq(questionOptions.questionId, item.question.id)).orderBy(asc(questionOptions.position)),
      })));
      return { test, settings, questions: withOptions };
    }),
    create: teacherProcedure
      .input(z.object({
        name: z.string().min(3).max(250),
        description: z.string().max(5000).optional().nullable(),
        subject: z.string().min(1).max(200),
        classroomId: z.string().max(64).optional().nullable(),
        topic: z.string().max(200).optional().nullable(),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        instructions: z.string().max(10000).optional().nullable(),
        totalMarks: z.number().min(0).max(10000).default(0),
        bannerKey: z.string().max(500).optional().nullable(),
        logoKey: z.string().max(500).optional().nullable(),
        scheduledStart: z.date().nullable().optional(),
        scheduledEnd: z.date().nullable().optional(),
        configuration: testConfigurationSchema.partial().optional(),
        security: securityConfigurationSchema.partial().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = requireDb(await getDb());
        const id = nanoid();
        await db.insert(tests).values({
          id,
          creatorId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          subject: input.subject,
          classroomId: classroomIdForContext(ctx, input.classroomId),
          topic: input.topic ?? null,
          difficulty: input.difficulty,
          instructions: input.instructions ?? null,
          totalMarks: input.totalMarks,
          bannerKey: input.bannerKey ?? null,
          logoKey: input.logoKey ?? null,
          scheduledStart: input.scheduledStart ?? null,
          scheduledEnd: input.scheduledEnd ?? null,
          securityConfig: JSON.stringify({ ...DEFAULT_SECURITY_CONFIGURATION, ...input.security }),
        });
        await db.insert(testSettings).values({
          testId: id,
          config: JSON.stringify({ ...DEFAULT_TEST_CONFIGURATION, ...input.configuration }),
        });
        return { id };
      }),
    update: teacherProcedure
      .input(z.object({
        testId: z.string().min(1),
        name: z.string().min(3).max(250).optional(),
        description: z.string().max(5000).nullable().optional(),
        subject: z.string().min(1).max(200).optional(),
        topic: z.string().max(200).nullable().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        instructions: z.string().max(10000).nullable().optional(),
        totalMarks: z.number().min(0).max(10000).optional(),
        classroomId: z.string().max(64).nullable().optional(),
        scheduledStart: z.date().nullable().optional(),
        scheduledEnd: z.date().nullable().optional(),
        configuration: testConfigurationSchema.partial().optional(),
        security: securityConfigurationSchema.partial().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, test } = await ownedTest(input.testId, ctx.user.id);
        const [existingSettings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
        const update = { ...input };
        delete (update as { testId?: string }).testId;
        if ("classroomId" in update) update.classroomId = classroomIdForContext(ctx, update.classroomId);
        delete (update as { configuration?: unknown }).configuration;
        delete (update as { security?: unknown }).security;
        if (Object.keys(update).length > 0) await db.update(tests).set(update).where(eq(tests.id, test.id));
        if (input.configuration) {
          await db.update(testSettings).set({ config: JSON.stringify({ ...parseConfig<TestConfiguration>(existingSettings?.config, DEFAULT_TEST_CONFIGURATION), ...input.configuration }) }).where(eq(testSettings.testId, test.id));
        }
        if (input.security) {
          await db.update(tests).set({ securityConfig: JSON.stringify({ ...parseConfig<SecurityConfiguration>(test.securityConfig, DEFAULT_SECURITY_CONFIGURATION), ...input.security }) }).where(eq(tests.id, test.id));
        }
        return { success: true };
      }),
    attachQuestion: teacherProcedure.input(z.object({ testId: z.string(), questionId: z.number().int().positive(), position: z.number().int().min(0).optional() })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const [question] = await db.select().from(questions).where(and(eq(questions.id, input.questionId), eq(questions.ownerId, ctx.user.id))).limit(1);
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });
      const existing = await db.select({ position: testQuestions.position }).from(testQuestions).where(eq(testQuestions.testId, test.id));
      const position = input.position ?? (existing.length ? Math.max(...existing.map(item => item.position)) + 1 : 0);
      await db.insert(testQuestions).values({ testId: test.id, questionId: input.questionId, position }).onConflictDoUpdate({ target: [testQuestions.testId, testQuestions.questionId], set: { position } });
      return { success: true };
    }),
    detachQuestion: teacherProcedure.input(z.object({ testId: z.string(), questionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const { db } = await ownedTest(input.testId, ctx.user.id);
      await db.delete(testQuestions).where(and(eq(testQuestions.testId, input.testId), eq(testQuestions.questionId, input.questionId)));
      return { success: true };
    }),
    reorderQuestions: teacherProcedure.input(z.object({ testId: z.string(), questionIds: z.array(z.number().int().positive()).min(1) })).mutation(async ({ ctx, input }) => {
      const { db } = await ownedTest(input.testId, ctx.user.id);
      await Promise.all(input.questionIds.map((questionId, position) => db.update(testQuestions).set({ position }).where(and(eq(testQuestions.testId, input.testId), eq(testQuestions.questionId, questionId)))));
      return { success: true };
    }),
    duplicate: teacherProcedure.input(z.object({ testId: z.string() })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const id = nanoid();
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      await db.insert(tests).values({ ...test, id, name: `${test.name} — Copy`, status: "draft", scheduledStart: null, scheduledEnd: null, createdAt: new Date(), updatedAt: new Date() });
      await db.insert(testSettings).values({ testId: id, config: settings?.config ?? JSON.stringify(DEFAULT_TEST_CONFIGURATION) });
      const attached = await db.select().from(testQuestions).where(eq(testQuestions.testId, test.id));
      if (attached.length) await db.insert(testQuestions).values(attached.map(item => ({ ...item, testId: id })));
      return { id };
    }),
    publish: teacherProcedure.input(z.object({ testId: z.string(), mode: z.enum(["now", "schedule"]) })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const attached = await db.select({ id: testQuestions.questionId }).from(testQuestions).where(eq(testQuestions.testId, test.id));
      const publicationError = validatePublication(input.mode, attached.length, test.scheduledStart, test.scheduledEnd);
      if (publicationError) throw new TRPCError({ code: "BAD_REQUEST", message: publicationError });
      const classroomId = test.classroomId || classroomIdForContext(ctx, null);
      if (!test.classroomId && classroomId) {
        await db.update(tests).set({ classroomId }).where(eq(tests.id, test.id));
      }
      await db.update(tests).set({ status: input.mode === "schedule" ? "scheduled" : "live" }).where(eq(tests.id, test.id));
      return { success: true, classroomId };
    }),
    archive: teacherProcedure.input(z.object({ testId: z.string() })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      await db.update(tests).set({ status: "archived" }).where(eq(tests.id, test.id));
      return { success: true };
    }),
    remove: teacherProcedure.input(z.object({ testId: z.string() })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      if (test.status === "live") throw new TRPCError({ code: "BAD_REQUEST", message: "Archive a live assessment rather than deleting it." });
      await db.delete(tests).where(eq(tests.id, test.id));
      return { success: true };
    }),
  }),
  questions: router({
    listBank: teacherProcedure.input(z.object({ subject: z.string().optional(), topic: z.string().optional(), difficulty: z.enum(["easy", "medium", "hard"]).optional(), type: questionTypeSchema.optional() }).optional()).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const conditions = [eq(questions.ownerId, ctx.user.id)];
      if (input?.subject) conditions.push(eq(questions.subject, input.subject));
      if (input?.topic) conditions.push(eq(questions.topic, input.topic));
      if (input?.difficulty) conditions.push(eq(questions.difficulty, input.difficulty));
      if (input?.type) conditions.push(eq(questions.type, input.type));
      const records = await db.select().from(questions).where(and(...conditions)).orderBy(desc(questions.updatedAt));
      const questionIds = records.map(question => question.id);
      const linked = questionIds.length ? await db
        .select({ questionId: testQuestions.questionId })
        .from(testQuestions)
        .innerJoin(tests, eq(tests.id, testQuestions.testId))
        .where(and(eq(tests.creatorId, ctx.user.id), inArray(testQuestions.questionId, questionIds))) : [];
      const used = new Set(linked.map(item => item.questionId));
      return records.map(question => ({ ...question, usedInTests: used.has(question.id) }));
    }),
    create: teacherProcedure.input(questionInputSchema.extend({ subject: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const { options, ...questionInput } = input;
      const result = await db.insert(questions).values({ ...questionInput, ownerId: ctx.user.id }).returning({ id: questions.id });
      const questionId = Number(result[0].id);
      if (options.length) await db.insert(questionOptions).values(options.map((option, position) => ({ questionId, position, ...option })));
      return { id: questionId };
    }),
    update: teacherProcedure.input(questionInputSchema.partial().extend({ questionId: z.number().int().positive(), options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).optional() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [existing] = await db.select().from(questions).where(and(eq(questions.id, input.questionId), eq(questions.ownerId, ctx.user.id))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });
      const { questionId, options, ...update } = input;
      if (Object.keys(update).length) await db.update(questions).set(update).where(eq(questions.id, questionId));
      if (options) {
        await db.delete(questionOptions).where(eq(questionOptions.questionId, questionId));
        if (options.length) await db.insert(questionOptions).values(options.map((option, position) => ({ questionId, position, ...option })));
      }
      return { success: true };
    }),
    remove: teacherProcedure.input(z.object({ questionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      await db.delete(questions).where(and(eq(questions.id, input.questionId), eq(questions.ownerId, ctx.user.id)));
      return { success: true };
    }),
    duplicate: teacherProcedure.input(z.object({ questionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [source] = await db.select().from(questions).where(and(eq(questions.id, input.questionId), eq(questions.ownerId, ctx.user.id))).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found." });
      const { id: _ignore, ...sourceWithoutId } = source;
      const result = await db.insert(questions).values({ ...sourceWithoutId, questionText: `${source.questionText} (Copy)`, createdAt: new Date(), updatedAt: new Date() }).returning({ id: questions.id });
      const questionId = Number(result[0].id);
      const sourceOptions = await db.select().from(questionOptions).where(eq(questionOptions.questionId, source.id));
      if (sourceOptions.length) await db.insert(questionOptions).values(sourceOptions.map(option => ({ questionId, position: option.position, text: option.text, isCorrect: option.isCorrect })));
      return { id: questionId };
    }),
    generateCandidates: teacherProcedure.input(z.object({
      testId: z.string().optional(),
      subject: z.string().min(1).max(200),
      topic: z.string().min(1).max(200),
      gradeLevel: z.string().min(1).max(100),
      difficulty: z.enum(["easy", "medium", "hard"]),
      count: z.number().int().min(1).max(15),
      questionTypes: z.array(questionTypeSchema).min(1),
      marksPerQuestion: z.number().min(0.25).max(100),
      learningObjective: z.string().min(3).max(500),
      generationMode: z.enum(["material_format", "knowledge_base"]).default("material_format"),
      formatPlan: z.string().max(1000).optional(),
      referenceMaterial: z.string().max(50000).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (input.testId) await ownedTest(input.testId, ctx.user.id);
      const candidates = await aiProvider.generateQuestions(input);
      const db = requireDb(await getDb());
      await db.insert(aiGenerationLogs).values({
        id: nanoid(),
        teacherId: ctx.user.id,
        testId: input.testId ?? null,
        provider: "built-in-ai-provider",
        requestPayload: JSON.stringify(input),
        responsePayload: JSON.stringify(candidates),
        status: "pending_review",
      });
      return { candidates, reviewRequired: true };
    }),
  }),
  studentTests: router({
    list: studentProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      const classroomId = ctx.session?.classroomId;
      if (classroomId) {
        return db
          .select({ test: tests, settings: testSettings, teacherName: users.name })
          .from(tests)
          .leftJoin(testSettings, eq(testSettings.testId, tests.id))
          .leftJoin(users, eq(users.id, tests.creatorId))
          .where(and(eq(tests.classroomId, classroomId), inArray(tests.status, ["live", "scheduled"])))
          .orderBy(asc(tests.scheduledStart));
      }
      return db
        .select({ test: tests, settings: testSettings, teacherName: users.name })
        .from(testAssignments)
        .innerJoin(tests, eq(testAssignments.testId, tests.id))
        .leftJoin(testSettings, eq(testSettings.testId, tests.id))
        .leftJoin(users, eq(users.id, tests.creatorId))
        .where(eq(testAssignments.studentId, ctx.user.id))
        .orderBy(asc(tests.scheduledStart));
    }),
  }),
    attempts: router({
    start: studentProcedure.input(z.object({ testId: z.string().min(1), preflight: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [test] = await db.select().from(tests).where(eq(tests.id, input.testId)).limit(1);
      if (ctx.session?.classroomId) {
        if (!test || test.classroomId !== ctx.session.classroomId) throw new TRPCError({ code: "FORBIDDEN", message: "This assessment is not available in your classroom." });
      } else {
        const [assignment] = await db.select().from(testAssignments).where(and(eq(testAssignments.testId, input.testId), eq(testAssignments.studentId, ctx.user.id))).limit(1);
        if (!assignment) throw new TRPCError({ code: "FORBIDDEN", message: "This assessment is not assigned to you." });
      }
      if (!test || test.status !== "live") throw new TRPCError({ code: "BAD_REQUEST", message: "This assessment is not currently available." });
      const security = parseConfig<SecurityConfiguration>(test.securityConfig, DEFAULT_SECURITY_CONFIGURATION);
      if (security.aiProctoringEnabled && serviceFailureBlocksAttempt(security, (await mlServiceHealth()).ready)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This protected assessment cannot start because its required AI proctoring service is unavailable." });
      }
      const now = new Date();
      if (test.scheduledStart && now < test.scheduledStart) throw new TRPCError({ code: "BAD_REQUEST", message: "The assessment has not started." });
      if (test.scheduledEnd && now > test.scheduledEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "The assessment window has closed." });
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      const config = parseConfig<TestConfiguration>(settings?.config, DEFAULT_TEST_CONFIGURATION);
      const existing = await db.select().from(testAttempts).where(and(eq(testAttempts.testId, test.id), eq(testAttempts.studentId, ctx.user.id))).orderBy(desc(testAttempts.startedAt));
      const active = existing.find(item => item.status === "in_progress" || item.status === "calibrating");
      if (active) return { attemptId: active.id, expiresAt: active.expiresAt, resumed: active.status === "in_progress", preflight: active.status === "calibrating" };
      if (existing.filter(item => item.status === "submitted").length >= config.attemptLimit) throw new TRPCError({ code: "FORBIDDEN", message: "The attempt limit has been reached." });
      const expiresAt = new Date(Math.min(now.getTime() + config.durationMinutes * 60_000, test.scheduledEnd?.getTime() ?? Number.MAX_SAFE_INTEGER));
      const attemptId = nanoid();
      const preflight = Boolean(input.preflight) || security.aiProctoringEnabled;
      await db.insert(testAttempts).values({ id: attemptId, testId: test.id, studentId: ctx.user.id, status: preflight ? "calibrating" : "in_progress", startedAt: now, expiresAt });
      return { attemptId, expiresAt, resumed: false, preflight };
    }),
    begin: studentProcedure.input(z.object({ attemptId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const { db, attempt, test } = await activeStudentAttempt(input.attemptId, ctx.user.id, true);
      if (attempt.status === "in_progress") return { attemptId: attempt.id, expiresAt: attempt.expiresAt, resumed: true };
      const security = parseConfig<SecurityConfiguration>(test.securityConfig, DEFAULT_SECURITY_CONFIGURATION);
      if (security.aiProctoringEnabled) {
        const [proctoringState] = await db.select().from(proctoringAttemptStates).where(eq(proctoringAttemptStates.attemptId, attempt.id)).limit(1);
        const baseline = parseConfig<{ finalized?: boolean }>(proctoringState?.baseline, {});
        const eligibility = timedAttemptEligibility(security, Boolean(baseline.finalized));
        if (!eligibility.allowed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: eligibility.reason ?? "Proctoring baseline is required." });
        if (eligibility.fallback) {
          await setProctoringState(db, attempt.id, { baseline: parseConfig<Record<string, unknown>>(proctoringState?.baseline, {}), temporalState: parseConfig<Record<string, unknown>>(proctoringState?.temporalState, {}), modelVersion: proctoringState?.modelVersion, lastRiskScore: proctoringState?.lastRiskScore, lastRiskLevel: proctoringState?.lastRiskLevel, serviceStatus: "fallback" });
        }
      }
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      const config = parseConfig<TestConfiguration>(settings?.config, DEFAULT_TEST_CONFIGURATION);
      const now = new Date();
      const expiresAt = new Date(Math.min(now.getTime() + config.durationMinutes * 60_000, test.scheduledEnd?.getTime() ?? Number.MAX_SAFE_INTEGER));
      await db.update(testAttempts).set({ status: "in_progress", startedAt: now, expiresAt }).where(eq(testAttempts.id, attempt.id));
      return { attemptId: attempt.id, expiresAt, resumed: false };
    }),
    getActive: studentProcedure.input(z.object({ attemptId: z.string().min(1) })).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [attempt] = await db.select().from(testAttempts).where(and(eq(testAttempts.id, input.attemptId), eq(testAttempts.studentId, ctx.user.id))).limit(1);
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
      if (attempt.status === "in_progress" && isAttemptExpired(attempt.expiresAt)) {
        await calculateAttemptResult(attempt.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "This attempt expired and was submitted by the server." });
      }
      if (attempt.status !== "in_progress") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This attempt is already closed." });
      }
      const [test] = await db.select().from(tests).where(eq(tests.id, attempt.testId)).limit(1);
      if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found." });
      const linked = await db.select({ question: questions, position: testQuestions.position }).from(testQuestions).innerJoin(questions, eq(testQuestions.questionId, questions.id)).where(eq(testQuestions.testId, test.id)).orderBy(asc(testQuestions.position));
      const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
      const answerByQuestion = new Map(answers.map(item => [item.questionId, item]));
      const studentQuestions = await Promise.all(linked.map(async item => ({
        id: item.question.id,
        type: item.question.type,
        questionText: item.question.questionText,
        imageKey: item.question.imageKey,
        codeSnippet: item.question.codeSnippet,
        marks: item.question.marks,
        topic: item.question.topic,
        position: item.position,
        options: (await db.select({ id: questionOptions.id, text: questionOptions.text, position: questionOptions.position }).from(questionOptions).where(eq(questionOptions.questionId, item.question.id)).orderBy(asc(questionOptions.position))),
        answer: answerByQuestion.get(item.question.id)?.answer ?? "",
        markedForReview: Boolean(answerByQuestion.get(item.question.id)?.markedForReview),
      })));
      const security = parseConfig<SecurityConfiguration>(test.securityConfig, DEFAULT_SECURITY_CONFIGURATION);
      const providerConfigured = security.aiProctoringEnabled && isMlProctoringConfigured();
      return { attempt, test: { id: test.id, name: test.name, instructions: test.instructions, subject: test.subject, security, proctoringProvider: { faceSignalsAvailable: providerConfigured, reason: providerConfigured ? "Feature-vector proctoring is configured. Camera capability still depends on your browser." : security.aiProctoringEnabled ? "This assessment requests AI proctoring, but the ML service URL and key have not been configured yet." : "AI proctoring is not enabled for this assessment." } }, questions: studentQuestions };
    }),
    saveAnswer: studentProcedure.input(z.object({ attemptId: z.string(), questionId: z.number().int().positive(), answer: z.string().max(20000), markedForReview: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [attempt] = await db.select().from(testAttempts).where(and(eq(testAttempts.id, input.attemptId), eq(testAttempts.studentId, ctx.user.id))).limit(1);
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
      if (attempt.status !== "in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "This attempt is locked." });
      if (isAttemptExpired(attempt.expiresAt)) {
        await calculateAttemptResult(attempt.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Time expired; the attempt was submitted." });
      }
      const [linked] = await db.select().from(testQuestions).where(and(eq(testQuestions.testId, attempt.testId), eq(testQuestions.questionId, input.questionId))).limit(1);
      if (!linked) throw new TRPCError({ code: "FORBIDDEN", message: "Question is not part of this assessment." });
      await db.insert(attemptAnswers).values({ attemptId: attempt.id, questionId: input.questionId, answer: input.answer, markedForReview: input.markedForReview }).onConflictDoUpdate({ target: [attemptAnswers.attemptId, attemptAnswers.questionId], set: { answer: input.answer, markedForReview: input.markedForReview, savedAt: new Date() } });
      return { savedAt: new Date() };
    }),
    submit: studentProcedure.input(z.object({ attemptId: z.string() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [attempt] = await db.select().from(testAttempts).where(and(eq(testAttempts.id, input.attemptId), eq(testAttempts.studentId, ctx.user.id))).limit(1);
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "Attempt not found." });
      if (attempt.status === "submitted") return { score: attempt.score, percentage: attempt.percentage, integrityScore: attempt.integrityScore, alreadySubmitted: true };
      const result = await calculateAttemptResult(attempt.id);
      return { ...result, alreadySubmitted: false };
    }),
  }),
  proctoring: router({
    health: publicProcedure.query(async () => {
      return { configured: isMlProctoringConfigured(), ...(await mlServiceHealth()) };
    }),
    record: studentProcedure.input(z.object({
      attemptId: z.string(), eventType: z.enum(["tab_switch", "fullscreen_exit", "focus_change"]), metadata: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ ctx, input }) => {
      const { db, attempt } = await activeStudentAttempt(input.attemptId, ctx.user.id);
      await db.insert(proctoringEvents).values({ id: nanoid(), attemptId: attempt.id, testId: attempt.testId, studentId: ctx.user.id, eventType: input.eventType, severity: directBrowserSeverity(input.eventType), confidence: 1, metadata: JSON.stringify({ source: "browser", ...input.metadata }) });
      return { accepted: true };
    }),
    baselineStart: studentProcedure.input(z.object({ attemptId: z.string() })).mutation(async ({ ctx, input }) => {
      const { db, attempt, security } = await activeStudentAttempt(input.attemptId, ctx.user.id, true);
      if (!security.aiProctoringEnabled) return { enabled: false, ready: false, reason: "AI proctoring is not enabled for this assessment." };
      const health = await mlServiceHealth();
      if (!health.ready) {
        if (serviceFailureBlocksAttempt(security, false)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This protected assessment requires the configured AI proctoring service, which is unavailable." });
        await setProctoringState(db, attempt.id, { baseline: {}, temporalState: {}, serviceStatus: security.proctoringFailurePolicy === "fallback_browser_signals" ? "fallback" : "unavailable" });
        return { enabled: true, ready: false, reason: health.reason, policy: security.proctoringFailurePolicy };
      }
      const baseline = await startMlBaseline(attempt.id);
      await setProctoringState(db, attempt.id, { baseline, temporalState: {}, modelVersion: health.modelVersion, serviceStatus: "ready" });
      return { enabled: true, ready: true, baseline, baselineSeconds: security.baselineSeconds, samplingHz: security.proctoringSamplingHz };
    }),
    baselineUpdate: studentProcedure.input(z.object({ attemptId: z.string(), features: mlFeatureVectorSchema })).mutation(async ({ ctx, input }) => {
      const { db, attempt, security } = await activeStudentAttempt(input.attemptId, ctx.user.id, true);
      if (!security.aiProctoringEnabled || !isMlProctoringConfigured()) return { ready: false };
      const [stored] = await db.select().from(proctoringAttemptStates).where(eq(proctoringAttemptStates.attemptId, attempt.id)).limit(1);
      if (!stored) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start a proctoring baseline before updating it." });
      const baseline = await updateMlBaseline(attempt.id, parseConfig<Record<string, unknown>>(stored.baseline, {}), input.features as MlFeatureVector);
      await setProctoringState(db, attempt.id, { baseline, temporalState: parseConfig<Record<string, unknown>>(stored.temporalState, {}), modelVersion: stored.modelVersion, lastRiskScore: stored.lastRiskScore, lastRiskLevel: stored.lastRiskLevel, serviceStatus: "ready" });
      return { ready: true, baseline };
    }),
    baselineFinalize: studentProcedure.input(z.object({ attemptId: z.string(), features: mlFeatureVectorSchema })).mutation(async ({ ctx, input }) => {
      const { db, attempt, security } = await activeStudentAttempt(input.attemptId, ctx.user.id, true);
      if (!security.aiProctoringEnabled || !isMlProctoringConfigured()) return { ready: false, baselineReady: false };
      const [stored] = await db.select().from(proctoringAttemptStates).where(eq(proctoringAttemptStates.attemptId, attempt.id)).limit(1);
      if (!stored) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start a proctoring baseline before finalizing it." });
      
      const currentBaseline = parseConfig<Record<string, unknown>>(stored.baseline, {});
      // Idempotency: if already finalized, return success immediately
      if (currentBaseline.finalized) {
        return { ready: true, baselineReady: true, baseline: currentBaseline, alreadyFinalized: true };
      }
      
      try {
        const baseline = await finalizeMlBaseline(attempt.id, currentBaseline, input.features as MlFeatureVector);
        await setProctoringState(db, attempt.id, { baseline, temporalState: parseConfig<Record<string, unknown>>(stored.temporalState, {}), modelVersion: stored.modelVersion, lastRiskScore: stored.lastRiskScore, lastRiskLevel: stored.lastRiskLevel, serviceStatus: "ready" });
        return { ready: true, baselineReady: Boolean(baseline.finalized), baseline };
      } catch (e) {
        // If the service is unreachable but we already have some baseline data, don't fail the exam start
        // Just return what we have so the student can proceed if the policy allows
        console.error("[baselineFinalize] Failed to finalize ML baseline:", e);
        return { ready: false, baselineReady: false, baseline: currentBaseline, error: String(e) };
      }
    }),
    analyze: studentProcedure.input(z.object({ attemptId: z.string(), features: mlFeatureVectorSchema, faceVerified: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const { db, attempt, security } = await activeStudentAttempt(input.attemptId, ctx.user.id);
      if (!security.aiProctoringEnabled) return { accepted: false, status: "disabled" as const };
      const health = await mlServiceHealth();
      if (!health.ready) {
        if (serviceFailureBlocksAttempt(security, false)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This protected assessment requires the configured AI proctoring service, which is unavailable." });
        const [latestFailure] = await db.select({ occurredAt: proctoringEvents.occurredAt }).from(proctoringEvents).where(and(eq(proctoringEvents.attemptId, attempt.id), eq(proctoringEvents.eventType, "service_unavailable"))).orderBy(desc(proctoringEvents.occurredAt)).limit(1);
        if (!latestFailure || Date.now() - latestFailure.occurredAt.getTime() > 60_000) await db.insert(proctoringEvents).values({ id: nanoid(), attemptId: attempt.id, testId: attempt.testId, studentId: ctx.user.id, eventType: "service_unavailable", severity: "low", confidence: 1, metadata: JSON.stringify({ policy: security.proctoringFailurePolicy, reason: health.reason }) });
        await setProctoringState(db, attempt.id, { baseline: {}, temporalState: {}, serviceStatus: security.proctoringFailurePolicy === "fallback_browser_signals" ? "fallback" : "unavailable" });
        return { accepted: false, status: "unavailable" as const, policy: security.proctoringFailurePolicy };
      }
      const [stored] = await db.select().from(proctoringAttemptStates).where(eq(proctoringAttemptStates.attemptId, attempt.id)).limit(1);
      if (!stored) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete the baseline calibration before starting AI analysis." });
      const response = await analyzeMlFeatures({ attemptId: attempt.id, studentId: ctx.user.id, baseline: parseConfig<Record<string, unknown>>(stored.baseline, {}), temporalState: parseConfig<Record<string, unknown>>(stored.temporalState, {}), features: input.features as MlFeatureVector, faceVerified: input.faceVerified, policy: { baselineSeconds: security.baselineSeconds, minimumEventSeconds: security.minimumEventSeconds, eventCooldownSeconds: security.eventCooldownSeconds } });
      if (response.events.length) await db.insert(proctoringEvents).values(response.events.map(event => ({ id: nanoid(), attemptId: attempt.id, testId: attempt.testId, studentId: ctx.user.id, eventType: event.event_type, severity: event.severity, confidence: event.confidence, anomalyScore: response.anomaly_score, riskScore: response.risk_score, durationSeconds: event.duration_seconds, modelVersion: response.model_version, metadata: JSON.stringify({ evidence: event.evidence, source: "ml_feature_analysis", modelVersion: response.model_version }) })));
      await setProctoringState(db, attempt.id, { baseline: response.baseline, temporalState: response.temporal_state, modelVersion: response.model_version, lastRiskScore: response.risk_score, lastRiskLevel: response.risk_level, serviceStatus: "ready" });
      return { accepted: true, riskScore: response.risk_score, riskLevel: response.risk_level, baselineReady: response.baseline_ready };
    }),
    timeline: teacherProcedure.input(z.object({ testId: z.string(), attemptId: z.string().optional() })).query(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const conditions = [eq(proctoringEvents.testId, test.id)];
      if (input.attemptId) conditions.push(eq(proctoringEvents.attemptId, input.attemptId));
      return db.select({ event: proctoringEvents, student: users }).from(proctoringEvents).innerJoin(users, eq(users.id, proctoringEvents.studentId)).where(and(...conditions)).orderBy(desc(proctoringEvents.occurredAt));
    }),
    reviewEvent: teacherProcedure.input(z.object({ eventId: z.string(), status: z.enum(["dismissed", "concern"]) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [event] = await db.select({ event: proctoringEvents, test: tests }).from(proctoringEvents).innerJoin(tests, eq(tests.id, proctoringEvents.testId)).where(eq(proctoringEvents.id, input.eventId)).limit(1);
      if (!event || event.test.creatorId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "Proctoring event not found." });
      await db.update(proctoringEvents).set({ reviewStatus: input.status, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(proctoringEvents.id, event.event.id));
      return { success: true };
    }),
  }),
  results: router({
    release: teacherProcedure.input(z.object({ testId: z.string(), released: z.boolean() })).mutation(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      const config = parseConfig<TestConfiguration>(settings?.config, DEFAULT_TEST_CONFIGURATION);
      await db.update(testSettings).set({ config: JSON.stringify({ ...config, resultsReleased: input.released }) }).where(eq(testSettings.testId, test.id));
      return { released: input.released };
    }),
    forTeacher: teacherProcedure.input(z.object({ testId: z.string() })).query(async ({ ctx, input }) => {
      const { db, test } = await ownedTest(input.testId, ctx.user.id);
      const attempts = await db.select({ attempt: testAttempts, student: users }).from(testAttempts).innerJoin(users, eq(users.id, testAttempts.studentId)).where(and(eq(testAttempts.testId, test.id), eq(testAttempts.status, "submitted"))).orderBy(desc(testAttempts.percentage));
      const percentages = attempts.map(item => item.attempt.percentage ?? 0).sort((a, b) => a - b);
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, test.id)).limit(1);
      const config = parseConfig<TestConfiguration>(settings?.config, DEFAULT_TEST_CONFIGURATION);
      const average = percentages.length ? percentages.reduce((sum, item) => sum + item, 0) / percentages.length : 0;
      const median = percentages.length ? percentages[Math.floor(percentages.length / 2)] : 0;
      const passed = percentages.filter(item => item >= config.passingPercentage).length;
      const questionList = await db.select().from(testQuestions).where(eq(testQuestions.testId, test.id)).orderBy(asc(testQuestions.position));
      const analytics = await Promise.all(questionList.map(async item => {
        const [question] = await db.select().from(questions).where(eq(questions.id, item.questionId)).limit(1);
        const answers = await db.select().from(attemptAnswers).where(inArray(attemptAnswers.attemptId, attempts.map(entry => entry.attempt.id).length ? attempts.map(entry => entry.attempt.id) : ["__none__"]));
        const relevant = answers.filter(answer => answer.questionId === item.questionId);
        const correct = relevant.filter(answer => (answer.awardedMarks ?? 0) > 0).length;
        return { questionId: item.questionId, questionText: question?.questionText ?? "Question", topic: question?.topic ?? "", correctPercentage: attempts.length ? (correct / attempts.length) * 100 : 0, skippedPercentage: attempts.length ? ((attempts.length - relevant.length) / attempts.length) * 100 : 0, responseCount: relevant.length };
      }));
      const insights = analytics.filter(item => item.responseCount > 0 && item.correctPercentage < 40).map(item => `Learners may need support with ${item.topic || "this concept"}; ${Math.round(item.correctPercentage)}% answered the related question correctly.`);
      return {
        test,
        metrics: { average, highest: percentages.at(-1) ?? 0, lowest: percentages[0] ?? 0, median, passRate: percentages.length ? (passed / percentages.length) * 100 : 0, attemptCount: attempts.length },
        attempts,
        questionAnalytics: analytics,
        insights,
      };
    }),
    forStudent: studentProcedure.input(z.object({ testId: z.string() })).query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [attempt] = await db.select().from(testAttempts).where(and(eq(testAttempts.testId, input.testId), eq(testAttempts.studentId, ctx.user.id), eq(testAttempts.status, "submitted"))).orderBy(desc(testAttempts.submittedAt)).limit(1);
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND", message: "No submitted attempt was found for this assessment." });
      const [test] = await db.select().from(tests).where(eq(tests.id, input.testId)).limit(1);
      const [settings] = await db.select().from(testSettings).where(eq(testSettings.testId, input.testId)).limit(1);
      if (!test) throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found." });
      const config = parseConfig<TestConfiguration>(settings?.config, DEFAULT_TEST_CONFIGURATION);
      const visible = config.showResultsImmediately || config.resultsReleased;
      if (!visible) return { visible: false, test: { name: test.name, subject: test.subject } };
      const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attempt.id));
      const questionIds = answers.map(answer => answer.questionId);
      const linkedQuestions = questionIds.length ? await db.select().from(questions).where(inArray(questions.id, questionIds)) : [];
      const byQuestion = new Map(linkedQuestions.map(question => [question.id, question]));
      const topicScores = new Map<string, { possible: number; awarded: number }>();
      answers.forEach(answer => {
        const question = byQuestion.get(answer.questionId);
        if (!question) return;
        const current = topicScores.get(question.topic) ?? { possible: 0, awarded: 0 };
        current.possible += question.marks;
        current.awarded += Math.max(0, answer.awardedMarks ?? 0);
        topicScores.set(question.topic, current);
      });
      return {
        visible: true,
        test: { name: test.name, subject: test.subject, totalMarks: test.totalMarks },
        attempt,
        feedbackAllowed: config.showCorrectAnswers || config.allowAnswerReview,
        topicPerformance: Array.from(topicScores.entries()).map(([topic, values]) => ({ topic, percentage: values.possible ? (values.awarded / values.possible) * 100 : 0 })),
      };
    }),
  }),
});
