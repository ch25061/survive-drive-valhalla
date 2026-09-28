ALTER TABLE `provider_attempts` ADD COLUMN `cell_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_attempt_round_cell` ON `provider_attempts` (`round_id`,`cell_id`) WHERE `cell_id` IS NOT NULL;
