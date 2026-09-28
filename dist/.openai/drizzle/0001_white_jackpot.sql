CREATE TABLE `provider_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`attempt_index` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_attempt_round_index` ON `provider_attempts` (`round_id`,`attempt_index`);--> statement-breakpoint
CREATE TABLE `provider_rounds` (
	`round_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`settings` text NOT NULL,
	`maximum_attempts` integer NOT NULL,
	`created_at` text NOT NULL
);
