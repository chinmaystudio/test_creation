CREATE TABLE `proctoring_attempt_states` (
	`attemptId` varchar(64) NOT NULL,
	`baseline` longtext NOT NULL,
	`temporalState` longtext NOT NULL,
	`modelVersion` varchar(100),
	`lastRiskScore` double,
	`lastRiskLevel` enum('low','medium','high'),
	`serviceStatus` enum('ready','unavailable','fallback') NOT NULL DEFAULT 'unavailable',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proctoring_attempt_states_attemptId` PRIMARY KEY(`attemptId`)
);
--> statement-breakpoint
ALTER TABLE `proctoring_events` MODIFY COLUMN `eventType` enum('face_missing','multiple_faces','tab_switch','fullscreen_exit','unknown_face','focus_change','head_away','gaze_deviation','camera_obstructed','behavior_anomaly','service_unavailable') NOT NULL;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `anomalyScore` double;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `riskScore` double;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `durationSeconds` double;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `evidenceKey` varchar(500);--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `modelVersion` varchar(100);--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `reviewStatus` enum('pending','dismissed','concern') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `proctoring_attempt_states` ADD CONSTRAINT `proctoring_attempt_states_attemptId_test_attempts_id_fk` FOREIGN KEY (`attemptId`) REFERENCES `test_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `proctoring_state_risk_idx` ON `proctoring_attempt_states` (`lastRiskLevel`,`updatedAt`);--> statement-breakpoint
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `proctoring_student_idx` ON `proctoring_events` (`studentId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `proctoring_test_idx` ON `proctoring_events` (`testId`,`occurredAt`);