import { boolean, doublePrecision, index, integer, text, pgEnum, pgTable, primaryKey, timestamp, uniqueIndex, varchar, uuid } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const roleEnum = pgEnum("tc_role", ["user", "admin", "teacher", "student"]);
export const users = pgTable("tc_users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Supabase identity UUID from the NeuroClass signed handoff. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const classrooms = pgTable("tc_classrooms", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: integer("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("classrooms_owner_idx").on(table.ownerId)]);

export const membershipRoleEnum = pgEnum("tc_membershipRole", ["teacher", "student"]);
export const classroomMembers = pgTable("tc_classroom_members", {
  classroomId: varchar("classroomId", { length: 64 }).notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  membershipRole: membershipRoleEnum("membershipRole").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.classroomId, table.userId] }), index("classroom_members_user_idx").on(table.userId)]);

export const testDifficultyEnum = pgEnum("tc_testDifficulty", ["easy", "medium", "hard"]);
export const testStatusEnum = pgEnum("tc_testStatus", ["draft", "scheduled", "live", "completed", "archived"]);
export const tests = pgTable("tc_tests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  creatorId: integer("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  classroomId: varchar("classroomId", { length: 64 }).references(() => classrooms.id, { onDelete: "set null" }),
  name: varchar("name", { length: 250 }).notNull(),
  description: text("description"),
  subject: varchar("subject", { length: 200 }).notNull(),
  topic: varchar("topic", { length: 200 }),
  difficulty: testDifficultyEnum("difficulty").default("medium").notNull(),
  instructions: text("instructions"),
  totalMarks: doublePrecision("totalMarks").default(0).notNull(),
  status: testStatusEnum("status").default("draft").notNull(),
  bannerKey: varchar("bannerKey", { length: 500 }),
  logoKey: varchar("logoKey", { length: 500 }),
  securityConfig: text("securityConfig").notNull(),
  scheduledStart: timestamp("scheduledStart"),
  scheduledEnd: timestamp("scheduledEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("tests_creator_status_idx").on(table.creatorId, table.status), index("tests_classroom_idx").on(table.classroomId)]);

export const testSettings = pgTable("tc_test_settings", {
  testId: varchar("testId", { length: 64 }).primaryKey().references(() => tests.id, { onDelete: "cascade" }),
  config: text("config").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const questionTypeEnum = pgEnum("tc_questionType", ["mcq", "multiple_select", "true_false", "fill_blank", "short_answer", "long_answer", "numerical", "coding"]);
export const questions = pgTable("tc_questions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ownerId: integer("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 200 }).notNull(),
  type: questionTypeEnum("type").notNull(),
  questionText: text("questionText").notNull(),
  imageKey: varchar("imageKey", { length: 500 }),
  codeSnippet: text("codeSnippet"),
  correctAnswer: text("correctAnswer").notNull(),
  explanation: text("explanation"),
  marks: doublePrecision("marks").notNull(),
  negativeMarks: doublePrecision("negativeMarks").default(0).notNull(),
  difficulty: testDifficultyEnum("difficulty").notNull(),
  topic: varchar("topic", { length: 200 }).notNull(),
  learningObjective: varchar("learningObjective", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("questions_owner_idx").on(table.ownerId), index("questions_search_idx").on(table.ownerId, table.subject, table.topic)]);

export const questionOptions = pgTable("tc_question_options", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  questionId: integer("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  isCorrect: boolean("isCorrect").default(false).notNull(),
}, table => [uniqueIndex("question_option_order_uq").on(table.questionId, table.position)]);

export const testQuestions = pgTable("tc_test_questions", {
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  questionId: integer("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, table => [primaryKey({ columns: [table.testId, table.questionId] }), uniqueIndex("test_question_order_uq").on(table.testId, table.position)]);

export const testAssignments = pgTable("tc_test_assignments", {
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: integer("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessPinHash: varchar("accessPinHash", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.testId, table.studentId] }), index("test_assignments_student_idx").on(table.studentId)]);

export const attemptStatusEnum = pgEnum("tc_attemptStatus", ["calibrating", "in_progress", "submitted", "reviewed", "expired"]);
export const testAttempts = pgTable("tc_test_attempts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: integer("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: attemptStatusEnum("status").default("in_progress").notNull(),
  startedAt: timestamp("startedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  submittedAt: timestamp("submittedAt"),
  score: doublePrecision("score"),
  percentage: doublePrecision("percentage"),
  integrityScore: doublePrecision("integrityScore"),
  reviewedAt: timestamp("reviewedAt"),
}, table => [index("attempts_student_status_idx").on(table.studentId, table.status), index("attempts_test_status_idx").on(table.testId, table.status)]);

export const attemptAnswers = pgTable("tc_attempt_answers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().references(() => testAttempts.id, { onDelete: "cascade" }),
  questionId: integer("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  markedForReview: boolean("markedForReview").default(false).notNull(),
  awardedMarks: doublePrecision("awardedMarks"),
  savedAt: timestamp("savedAt").defaultNow().notNull(),
}, table => [uniqueIndex("attempt_answer_uq").on(table.attemptId, table.questionId)]);

export const eventTypeEnum = pgEnum("tc_eventType", ["face_missing", "multiple_faces", "tab_switch", "fullscreen_exit", "unknown_face", "focus_change", "head_away", "gaze_deviation", "camera_obstructed", "behavior_anomaly", "service_unavailable"]);
export const severityEnum = pgEnum("tc_severity", ["low", "medium", "high"]);
export const reviewStatusEnum = pgEnum("tc_reviewStatus", ["pending", "dismissed", "concern"]);
export const proctoringEvents = pgTable("tc_proctoring_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().references(() => testAttempts.id, { onDelete: "cascade" }),
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: integer("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: eventTypeEnum("eventType").notNull(),
  severity: severityEnum("severity").notNull(),
  confidence: doublePrecision("confidence"),
  anomalyScore: doublePrecision("anomalyScore"),
  riskScore: doublePrecision("riskScore"),
  durationSeconds: doublePrecision("durationSeconds"),
  evidenceKey: varchar("evidenceKey", { length: 500 }),
  modelVersion: varchar("modelVersion", { length: 100 }),
  reviewStatus: reviewStatusEnum("reviewStatus").default("pending").notNull(),
  reviewedBy: integer("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  metadata: text("metadata").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, table => [index("proctoring_attempt_idx").on(table.attemptId, table.occurredAt), index("proctoring_student_idx").on(table.studentId, table.occurredAt), index("proctoring_test_idx").on(table.testId, table.occurredAt)]);

export const serviceStatusEnum = pgEnum("tc_serviceStatus", ["ready", "unavailable", "fallback"]);
export const proctoringAttemptStates = pgTable("tc_proctoring_attempt_states", {
  attemptId: varchar("attemptId", { length: 64 }).primaryKey().references(() => testAttempts.id, { onDelete: "cascade" }),
  baseline: text("baseline").notNull(),
  temporalState: text("temporalState").notNull(),
  modelVersion: varchar("modelVersion", { length: 100 }),
  lastRiskScore: doublePrecision("lastRiskScore"),
  lastRiskLevel: severityEnum("lastRiskLevel"),
  serviceStatus: serviceStatusEnum("serviceStatus").default("unavailable").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("proctoring_state_risk_idx").on(table.lastRiskLevel, table.updatedAt)]);

export const aiGenerationStatusEnum = pgEnum("tc_aiGenerationStatus", ["pending_review", "partially_approved", "approved", "discarded"]);
export const aiGenerationLogs = pgTable("tc_ai_generation_logs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  teacherId: integer("teacherId").notNull().references(() => users.id, { onDelete: "cascade" }),
  testId: varchar("testId", { length: 64 }).references(() => tests.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 100 }).notNull(),
  requestPayload: text("requestPayload").notNull(),
  responsePayload: text("responsePayload").notNull(),
  status: aiGenerationStatusEnum("status").default("pending_review").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ai_generation_teacher_idx").on(table.teacherId, table.createdAt)]);
