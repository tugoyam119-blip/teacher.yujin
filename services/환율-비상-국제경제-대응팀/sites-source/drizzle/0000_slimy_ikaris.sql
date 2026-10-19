CREATE TABLE `attempts` (
	`student_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_name` text DEFAULT '' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'progress' NOT NULL,
	`current_step` integer DEFAULT 1 NOT NULL,
	`auto_score` integer DEFAULT 0 NOT NULL,
	`teacher_score` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`submitted_at` integer,
	`submission_type` text
);
--> statement-breakpoint
CREATE TABLE `roster` (
	`student_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_name` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`duration_minutes` integer DEFAULT 50 NOT NULL,
	`started_at` integer,
	`paused_at` integer,
	`paused_seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
