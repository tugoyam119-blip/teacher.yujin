CREATE TABLE `teacher_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`openai_api_key` text,
	`model` text DEFAULT 'gpt-5.6-luna' NOT NULL,
	`updated_at` integer NOT NULL
);
