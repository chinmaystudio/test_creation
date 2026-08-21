CREATE TABLE `ai_generation_logs` (
	`id` varchar(64) NOT NULL,
	`teacherId` int NOT NULL,
	`testId` varchar(64),
	`provider` varchar(100) NOT NULL,
	`requestPayload` longtext NOT NULL,
	`responsePayload` longtext NOT NULL,
	`status` enum('pending_review','partially_approved','approved','discarded') NOT NULL DEFAULT 'pending_review',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_generation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attempt_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attemptId` varchar(64) NOT NULL,
	`questionId` int NOT NULL,
	`answer` longtext NOT NULL,
	`markedForReview` boolean NOT NULL DEFAULT false,
	`awardedMarks` double,
	`savedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attempt_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `attempt_answer_uq` UNIQUE(`attemptId`,`questionId`)
);
--> statement-breakpoint
CREATE TABLE `classroom_members` (
	`classroomId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('teacher','student') NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classroom_members_classroomId_userId_pk` PRIMARY KEY(`classroomId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `classrooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proctoring_events` (
	`id` varchar(64) NOT NULL,
	`attemptId` varchar(64) NOT NULL,
	`testId` varchar(64) NOT NULL,
	`studentId` int NOT NULL,
	`eventType` enum('face_missing','multiple_faces','tab_switch','fullscreen_exit','unknown_face','focus_change') NOT NULL,
	`severity` enum('low','medium','high') NOT NULL,
	`confidence` double,
	`metadata` longtext NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proctoring_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` int NOT NULL,
	`position` int NOT NULL,
	`text` longtext NOT NULL,
	`isCorrect` boolean NOT NULL DEFAULT false,
	CONSTRAINT `question_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `question_option_order_uq` UNIQUE(`questionId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`subject` varchar(200) NOT NULL,
	`type` enum('mcq','multiple_select','true_false','fill_blank','short_answer','long_answer','numerical','coding') NOT NULL,
	`questionText` longtext NOT NULL,
	`imageKey` varchar(500),
	`codeSnippet` longtext,
	`correctAnswer` longtext NOT NULL,
	`explanation` longtext,
	`marks` double NOT NULL,
	`negativeMarks` double NOT NULL DEFAULT 0,
	`difficulty` enum('easy','medium','hard') NOT NULL,
	`topic` varchar(200) NOT NULL,
	`learningObjective` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `test_assignments` (
	`testId` varchar(64) NOT NULL,
	`studentId` int NOT NULL,
	`accessPinHash` varchar(255),
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `test_assignments_testId_studentId_pk` PRIMARY KEY(`testId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `test_attempts` (
	`id` varchar(64) NOT NULL,
	`testId` varchar(64) NOT NULL,
	`studentId` int NOT NULL,
	`status` enum('in_progress','submitted','reviewed','expired') NOT NULL DEFAULT 'in_progress',
	`startedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`submittedAt` timestamp,
	`score` double,
	`percentage` double,
	`integrityScore` double,
	`reviewedAt` timestamp,
	CONSTRAINT `test_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `test_questions` (
	`testId` varchar(64) NOT NULL,
	`questionId` int NOT NULL,
	`position` int NOT NULL,
	CONSTRAINT `test_questions_testId_questionId_pk` PRIMARY KEY(`testId`,`questionId`),
	CONSTRAINT `test_question_order_uq` UNIQUE(`testId`,`position`)
);
--> statement-breakpoint
CREATE TABLE `test_settings` (
	`testId` varchar(64) NOT NULL,
	`config` longtext NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `test_settings_testId` PRIMARY KEY(`testId`)
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` varchar(64) NOT NULL,
	`creatorId` int NOT NULL,
	`classroomId` varchar(64),
	`name` varchar(250) NOT NULL,
	`description` longtext,
	`subject` varchar(200) NOT NULL,
	`topic` varchar(200),
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'medium',
	`instructions` longtext,
	`totalMarks` double NOT NULL DEFAULT 0,
	`status` enum('draft','scheduled','live','completed','archived') NOT NULL DEFAULT 'draft',
	`bannerKey` varchar(500),
	`logoKey` varchar(500),
	`securityConfig` longtext NOT NULL,
	`scheduledStart` timestamp,
	`scheduledEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','teacher','student') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `ai_generation_logs` ADD CONSTRAINT `ai_generation_logs_teacherId_users_id_fk` FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_generation_logs` ADD CONSTRAINT `ai_generation_logs_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempt_answers` ADD CONSTRAINT `attempt_answers_attemptId_test_attempts_id_fk` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempt_answers` ADD CONSTRAINT `attempt_answers_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classroom_members` ADD CONSTRAINT `classroom_members_classroomId_classrooms_id_fk` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classroom_members` ADD CONSTRAINT `classroom_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_attemptId_test_attempts_id_fk` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_assignments` ADD CONSTRAINT `test_assignments_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_assignments` ADD CONSTRAINT `test_assignments_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_attempts` ADD CONSTRAINT `test_attempts_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_attempts` ADD CONSTRAINT `test_attempts_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_questions` ADD CONSTRAINT `test_questions_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_questions` ADD CONSTRAINT `test_questions_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `test_settings` ADD CONSTRAINT `test_settings_testId_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tests` ADD CONSTRAINT `tests_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tests` ADD CONSTRAINT `tests_classroomId_classrooms_id_fk` FOREIGN KEY (`classroomId`) REFERENCES `classrooms`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_generation_teacher_idx` ON `ai_generation_logs` (`teacherId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `classroom_members_user_idx` ON `classroom_members` (`userId`);--> statement-breakpoint
CREATE INDEX `classrooms_owner_idx` ON `classrooms` (`ownerId`);--> statement-breakpoint
CREATE INDEX `proctoring_attempt_idx` ON `proctoring_events` (`attemptId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `questions_owner_idx` ON `questions` (`ownerId`);--> statement-breakpoint
CREATE INDEX `questions_search_idx` ON `questions` (`ownerId`,`subject`,`topic`);--> statement-breakpoint
CREATE INDEX `test_assignments_student_idx` ON `test_assignments` (`studentId`);--> statement-breakpoint
CREATE INDEX `attempts_student_status_idx` ON `test_attempts` (`studentId`,`status`);--> statement-breakpoint
CREATE INDEX `attempts_test_status_idx` ON `test_attempts` (`testId`,`status`);--> statement-breakpoint
CREATE INDEX `tests_creator_status_idx` ON `tests` (`creatorId`,`status`);--> statement-breakpoint
CREATE INDEX `tests_classroom_idx` ON `tests` (`classroomId`);