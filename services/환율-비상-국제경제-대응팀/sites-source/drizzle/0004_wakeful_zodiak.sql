CREATE TABLE `benchmark_cases` (
	`run_id` text NOT NULL,
	`case_no` integer NOT NULL,
	`label` text NOT NULL,
	`answers` text NOT NULL,
	`expected_score` integer NOT NULL,
	`expected_breakdown` text NOT NULL,
	`ai_score` integer,
	`ai_result` text,
	`confidence` text,
	`review_required` integer DEFAULT 0 NOT NULL,
	`error` text,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `benchmark_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`total_count` integer DEFAULT 50 NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`model` text NOT NULL,
	`metrics` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
