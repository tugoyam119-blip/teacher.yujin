CREATE TABLE IF NOT EXISTS `class_sessions` (
	`class_name` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`duration_minutes` integer DEFAULT 45 NOT NULL,
	`started_at` integer,
	`exam_started_at` integer,
	`paused_at` integer,
	`paused_seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `grade_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` text NOT NULL,
	`event_type` text DEFAULT 'teacher_grade' NOT NULL,
	`auto_score` integer DEFAULT 0 NOT NULL,
	`ai_score` integer,
	`extra_penalty` integer DEFAULT 0 NOT NULL,
	`provisional_score` integer,
	`teacher_score` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `makeup_roster` (
	`student_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_name` text NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `makeup_rounds` (
	`class_name` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`duration_minutes` integer DEFAULT 45 NOT NULL,
	`opened_at` integer,
	`exam_started_at` integer,
	`closed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_visits` (
	`student_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_name` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`login_count` integer DEFAULT 0 NOT NULL,
	`last_phase` text DEFAULT 'preview' NOT NULL
);
