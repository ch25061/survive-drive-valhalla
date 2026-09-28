CREATE TABLE `avm_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`cell_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`subject_profile` text NOT NULL,
	`provider` text NOT NULL,
	`estimate_ppsqft` real NOT NULL,
	`source_kind` text NOT NULL,
	`source_artifact` text NOT NULL,
	`acquired_at` text,
	`cached_at` text NOT NULL,
	`schema_version` text NOT NULL
);
