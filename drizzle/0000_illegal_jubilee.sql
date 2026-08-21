CREATE TYPE "public"."tc_aiGenerationStatus" AS ENUM('pending_review', 'partially_approved', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."tc_attemptStatus" AS ENUM('calibrating', 'in_progress', 'submitted', 'reviewed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."tc_eventType" AS ENUM('face_missing', 'multiple_faces', 'tab_switch', 'fullscreen_exit', 'unknown_face', 'focus_change', 'head_away', 'gaze_deviation', 'camera_obstructed', 'behavior_anomaly', 'service_unavailable');--> statement-breakpoint
CREATE TYPE "public"."tc_membershipRole" AS ENUM('teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."tc_questionType" AS ENUM('mcq', 'multiple_select', 'true_false', 'fill_blank', 'short_answer', 'long_answer', 'numerical', 'coding');--> statement-breakpoint
CREATE TYPE "public"."tc_reviewStatus" AS ENUM('pending', 'dismissed', 'concern');--> statement-breakpoint
CREATE TYPE "public"."tc_role" AS ENUM('user', 'admin', 'teacher', 'student');--> statement-breakpoint
CREATE TYPE "public"."tc_serviceStatus" AS ENUM('ready', 'unavailable', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."tc_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."tc_testDifficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."tc_testStatus" AS ENUM('draft', 'scheduled', 'live', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "tc_ai_generation_logs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"teacherId" integer NOT NULL,
	"testId" varchar(64),
	"provider" varchar(100) NOT NULL,
	"requestPayload" text NOT NULL,
	"responsePayload" text NOT NULL,
	"status" "tc_aiGenerationStatus" DEFAULT 'pending_review' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_attempt_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tc_attempt_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attemptId" varchar(64) NOT NULL,
	"questionId" integer NOT NULL,
	"answer" text NOT NULL,
	"markedForReview" boolean DEFAULT false NOT NULL,
	"awardedMarks" double precision,
	"savedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_classroom_members" (
	"classroomId" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"membershipRole" "tc_membershipRole" NOT NULL,
	"joinedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tc_classroom_members_classroomId_userId_pk" PRIMARY KEY("classroomId","userId")
);
--> statement-breakpoint
CREATE TABLE "tc_classrooms" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_proctoring_attempt_states" (
	"attemptId" varchar(64) PRIMARY KEY NOT NULL,
	"baseline" text NOT NULL,
	"temporalState" text NOT NULL,
	"modelVersion" varchar(100),
	"lastRiskScore" double precision,
	"lastRiskLevel" "tc_severity",
	"serviceStatus" "tc_serviceStatus" DEFAULT 'unavailable' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_proctoring_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"attemptId" varchar(64) NOT NULL,
	"testId" varchar(64) NOT NULL,
	"studentId" integer NOT NULL,
	"eventType" "tc_eventType" NOT NULL,
	"severity" "tc_severity" NOT NULL,
	"confidence" double precision,
	"anomalyScore" double precision,
	"riskScore" double precision,
	"durationSeconds" double precision,
	"evidenceKey" varchar(500),
	"modelVersion" varchar(100),
	"reviewStatus" "tc_reviewStatus" DEFAULT 'pending' NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"metadata" text NOT NULL,
	"occurredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_question_options" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tc_question_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"questionId" integer NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"isCorrect" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tc_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ownerId" integer NOT NULL,
	"subject" varchar(200) NOT NULL,
	"type" "tc_questionType" NOT NULL,
	"questionText" text NOT NULL,
	"imageKey" varchar(500),
	"codeSnippet" text,
	"correctAnswer" text NOT NULL,
	"explanation" text,
	"marks" double precision NOT NULL,
	"negativeMarks" double precision DEFAULT 0 NOT NULL,
	"difficulty" "tc_testDifficulty" NOT NULL,
	"topic" varchar(200) NOT NULL,
	"learningObjective" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_test_assignments" (
	"testId" varchar(64) NOT NULL,
	"studentId" integer NOT NULL,
	"accessPinHash" varchar(255),
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tc_test_assignments_testId_studentId_pk" PRIMARY KEY("testId","studentId")
);
--> statement-breakpoint
CREATE TABLE "tc_test_attempts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"testId" varchar(64) NOT NULL,
	"studentId" integer NOT NULL,
	"status" "tc_attemptStatus" DEFAULT 'in_progress' NOT NULL,
	"startedAt" timestamp NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"submittedAt" timestamp,
	"score" double precision,
	"percentage" double precision,
	"integrityScore" double precision,
	"reviewedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "tc_test_questions" (
	"testId" varchar(64) NOT NULL,
	"questionId" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "tc_test_questions_testId_questionId_pk" PRIMARY KEY("testId","questionId")
);
--> statement-breakpoint
CREATE TABLE "tc_test_settings" (
	"testId" varchar(64) PRIMARY KEY NOT NULL,
	"config" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_tests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"creatorId" integer NOT NULL,
	"classroomId" varchar(64),
	"name" varchar(250) NOT NULL,
	"description" text,
	"subject" varchar(200) NOT NULL,
	"topic" varchar(200),
	"difficulty" "tc_testDifficulty" DEFAULT 'medium' NOT NULL,
	"instructions" text,
	"totalMarks" double precision DEFAULT 0 NOT NULL,
	"status" "tc_testStatus" DEFAULT 'draft' NOT NULL,
	"bannerKey" varchar(500),
	"logoKey" varchar(500),
	"securityConfig" text NOT NULL,
	"scheduledStart" timestamp,
	"scheduledEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tc_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tc_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "tc_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tc_users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "tc_ai_generation_logs" ADD CONSTRAINT "tc_ai_generation_logs_teacherId_tc_users_id_fk" FOREIGN KEY ("teacherId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_ai_generation_logs" ADD CONSTRAINT "tc_ai_generation_logs_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_attempt_answers" ADD CONSTRAINT "tc_attempt_answers_attemptId_tc_test_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."tc_test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_attempt_answers" ADD CONSTRAINT "tc_attempt_answers_questionId_tc_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."tc_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_classroom_members" ADD CONSTRAINT "tc_classroom_members_classroomId_tc_classrooms_id_fk" FOREIGN KEY ("classroomId") REFERENCES "public"."tc_classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_classroom_members" ADD CONSTRAINT "tc_classroom_members_userId_tc_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_classrooms" ADD CONSTRAINT "tc_classrooms_ownerId_tc_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_proctoring_attempt_states" ADD CONSTRAINT "tc_proctoring_attempt_states_attemptId_tc_test_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."tc_test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_proctoring_events" ADD CONSTRAINT "tc_proctoring_events_attemptId_tc_test_attempts_id_fk" FOREIGN KEY ("attemptId") REFERENCES "public"."tc_test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_proctoring_events" ADD CONSTRAINT "tc_proctoring_events_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_proctoring_events" ADD CONSTRAINT "tc_proctoring_events_studentId_tc_users_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_proctoring_events" ADD CONSTRAINT "tc_proctoring_events_reviewedBy_tc_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."tc_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_question_options" ADD CONSTRAINT "tc_question_options_questionId_tc_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."tc_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_questions" ADD CONSTRAINT "tc_questions_ownerId_tc_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_assignments" ADD CONSTRAINT "tc_test_assignments_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_assignments" ADD CONSTRAINT "tc_test_assignments_studentId_tc_users_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_attempts" ADD CONSTRAINT "tc_test_attempts_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_attempts" ADD CONSTRAINT "tc_test_attempts_studentId_tc_users_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_questions" ADD CONSTRAINT "tc_test_questions_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_questions" ADD CONSTRAINT "tc_test_questions_questionId_tc_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."tc_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_test_settings" ADD CONSTRAINT "tc_test_settings_testId_tc_tests_id_fk" FOREIGN KEY ("testId") REFERENCES "public"."tc_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_tests" ADD CONSTRAINT "tc_tests_creatorId_tc_users_id_fk" FOREIGN KEY ("creatorId") REFERENCES "public"."tc_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tc_tests" ADD CONSTRAINT "tc_tests_classroomId_tc_classrooms_id_fk" FOREIGN KEY ("classroomId") REFERENCES "public"."tc_classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_teacher_idx" ON "tc_ai_generation_logs" USING btree ("teacherId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answer_uq" ON "tc_attempt_answers" USING btree ("attemptId","questionId");--> statement-breakpoint
CREATE INDEX "classroom_members_user_idx" ON "tc_classroom_members" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "classrooms_owner_idx" ON "tc_classrooms" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "proctoring_state_risk_idx" ON "tc_proctoring_attempt_states" USING btree ("lastRiskLevel","updatedAt");--> statement-breakpoint
CREATE INDEX "proctoring_attempt_idx" ON "tc_proctoring_events" USING btree ("attemptId","occurredAt");--> statement-breakpoint
CREATE INDEX "proctoring_student_idx" ON "tc_proctoring_events" USING btree ("studentId","occurredAt");--> statement-breakpoint
CREATE INDEX "proctoring_test_idx" ON "tc_proctoring_events" USING btree ("testId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "question_option_order_uq" ON "tc_question_options" USING btree ("questionId","position");--> statement-breakpoint
CREATE INDEX "questions_owner_idx" ON "tc_questions" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "questions_search_idx" ON "tc_questions" USING btree ("ownerId","subject","topic");--> statement-breakpoint
CREATE INDEX "test_assignments_student_idx" ON "tc_test_assignments" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "attempts_student_status_idx" ON "tc_test_attempts" USING btree ("studentId","status");--> statement-breakpoint
CREATE INDEX "attempts_test_status_idx" ON "tc_test_attempts" USING btree ("testId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "test_question_order_uq" ON "tc_test_questions" USING btree ("testId","position");--> statement-breakpoint
CREATE INDEX "tests_creator_status_idx" ON "tc_tests" USING btree ("creatorId","status");--> statement-breakpoint
CREATE INDEX "tests_classroom_idx" ON "tc_tests" USING btree ("classroomId");