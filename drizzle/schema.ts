import { boolean, double, index, int, longtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "teacher", "student"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const classrooms = mysqlTable("classrooms", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("classrooms_owner_idx").on(table.ownerId)]);

export const classroomMembers = mysqlTable("classroom_members", {
  classroomId: varchar("classroomId", { length: 64 }).notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  membershipRole: mysqlEnum("membershipRole", ["teacher", "student"]).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.classroomId, table.userId] }), index("classroom_members_user_idx").on(table.userId)]);

export const tests = mysqlTable("tests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  creatorId: int("creatorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  classroomId: varchar("classroomId", { length: 64 }).references(() => classrooms.id, { onDelete: "set null" }),
  name: varchar("name", { length: 250 }).notNull(),
  description: longtext("description"),
  subject: varchar("subject", { length: 200 }).notNull(),
  topic: varchar("topic", { length: 200 }),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("medium").notNull(),
  instructions: longtext("instructions"),
  totalMarks: double("totalMarks").default(0).notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "live", "completed", "archived"]).default("draft").notNull(),
  bannerKey: varchar("bannerKey", { length: 500 }),
  logoKey: varchar("logoKey", { length: 500 }),
  securityConfig: longtext("securityConfig").notNull(),
  scheduledStart: timestamp("scheduledStart"),
  scheduledEnd: timestamp("scheduledEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("tests_creator_status_idx").on(table.creatorId, table.status), index("tests_classroom_idx").on(table.classroomId)]);

export const testSettings = mysqlTable("test_settings", {
  testId: varchar("testId", { length: 64 }).primaryKey().references(() => tests.id, { onDelete: "cascade" }),
  config: longtext("config").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const questions = mysqlTable("questions", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 200 }).notNull(),
  type: mysqlEnum("type", ["mcq", "multiple_select", "true_false", "fill_blank", "short_answer", "long_answer", "numerical", "coding"]).notNull(),
  questionText: longtext("questionText").notNull(),
  imageKey: varchar("imageKey", { length: 500 }),
  codeSnippet: longtext("codeSnippet"),
  correctAnswer: longtext("correctAnswer").notNull(),
  explanation: longtext("explanation"),
  marks: double("marks").notNull(),
  negativeMarks: double("negativeMarks").default(0).notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(),
  topic: varchar("topic", { length: 200 }).notNull(),
  learningObjective: varchar("learningObjective", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("questions_owner_idx").on(table.ownerId), index("questions_search_idx").on(table.ownerId, table.subject, table.topic)]);

export const questionOptions = mysqlTable("question_options", {
  id: int("id").autoincrement().primaryKey(),
  questionId: int("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  position: int("position").notNull(),
  text: longtext("text").notNull(),
  isCorrect: boolean("isCorrect").default(false).notNull(),
}, table => [uniqueIndex("question_option_order_uq").on(table.questionId, table.position)]);

export const testQuestions = mysqlTable("test_questions", {
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  questionId: int("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  position: int("position").notNull(),
}, table => [primaryKey({ columns: [table.testId, table.questionId] }), uniqueIndex("test_question_order_uq").on(table.testId, table.position)]);

export const testAssignments = mysqlTable("test_assignments", {
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessPinHash: varchar("accessPinHash", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.testId, table.studentId] }), index("test_assignments_student_idx").on(table.studentId)]);

export const testAttempts = mysqlTable("test_attempts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["calibrating", "in_progress", "submitted", "reviewed", "expired"]).default("in_progress").notNull(),
  startedAt: timestamp("startedAt").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  submittedAt: timestamp("submittedAt"),
  score: double("score"),
  percentage: double("percentage"),
  integrityScore: double("integrityScore"),
  reviewedAt: timestamp("reviewedAt"),
}, table => [index("attempts_student_status_idx").on(table.studentId, table.status), index("attempts_test_status_idx").on(table.testId, table.status)]);

export const attemptAnswers = mysqlTable("attempt_answers", {
  id: int("id").autoincrement().primaryKey(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().references(() => testAttempts.id, { onDelete: "cascade" }),
  questionId: int("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
  answer: longtext("answer").notNull(),
  markedForReview: boolean("markedForReview").default(false).notNull(),
  awardedMarks: double("awardedMarks"),
  savedAt: timestamp("savedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("attempt_answer_uq").on(table.attemptId, table.questionId)]);

export const proctoringEvents = mysqlTable("proctoring_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().references(() => testAttempts.id, { onDelete: "cascade" }),
  testId: varchar("testId", { length: 64 }).notNull().references(() => tests.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: mysqlEnum("eventType", ["face_missing", "multiple_faces", "tab_switch", "fullscreen_exit", "unknown_face", "focus_change", "head_away", "gaze_deviation", "camera_obstructed", "behavior_anomaly", "service_unavailable"]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high"]).notNull(),
  confidence: double("confidence"),
  anomalyScore: double("anomalyScore"),
  riskScore: double("riskScore"),
  durationSeconds: double("durationSeconds"),
  evidenceKey: varchar("evidenceKey", { length: 500 }),
  modelVersion: varchar("modelVersion", { length: 100 }),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "dismissed", "concern"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  metadata: longtext("metadata").notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, table => [index("proctoring_attempt_idx").on(table.attemptId, table.occurredAt), index("proctoring_student_idx").on(table.studentId, table.occurredAt), index("proctoring_test_idx").on(table.testId, table.occurredAt)]);

export const proctoringAttemptStates = mysqlTable("proctoring_attempt_states", {
  attemptId: varchar("attemptId", { length: 64 }).primaryKey().references(() => testAttempts.id, { onDelete: "cascade" }),
  baseline: longtext("baseline").notNull(),
  temporalState: longtext("temporalState").notNull(),
  modelVersion: varchar("modelVersion", { length: 100 }),
  lastRiskScore: double("lastRiskScore"),
  lastRiskLevel: mysqlEnum("lastRiskLevel", ["low", "medium", "high"]),
  serviceStatus: mysqlEnum("serviceStatus", ["ready", "unavailable", "fallback"]).default("unavailable").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("proctoring_state_risk_idx").on(table.lastRiskLevel, table.updatedAt)]);

export const aiGenerationLogs = mysqlTable("ai_generation_logs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  teacherId: int("teacherId").notNull().references(() => users.id, { onDelete: "cascade" }),
  testId: varchar("testId", { length: 64 }).references(() => tests.id, { onDelete: "set null" }),
  provider: varchar("provider", { length: 100 }).notNull(),
  requestPayload: longtext("requestPayload").notNull(),
  responsePayload: longtext("responsePayload").notNull(),
  status: mysqlEnum("status", ["pending_review", "partially_approved", "approved", "discarded"]).default("pending_review").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ai_generation_teacher_idx").on(table.teacherId, table.createdAt)]);
