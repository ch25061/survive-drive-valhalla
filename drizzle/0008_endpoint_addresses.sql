CREATE TABLE `endpoint_address_cache` (
	`point_key` text PRIMARY KEY NOT NULL,
	`result_json` text NOT NULL,
	`acquired_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `endpoint_geocoder_rate` (
	`service` text PRIMARY KEY NOT NULL,
	`last_started_ms` integer NOT NULL
);
