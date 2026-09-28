CREATE TABLE `intersection_catalog_pages` (
	`page_id` text PRIMARY KEY NOT NULL,
	`catalog_version` text NOT NULL,
	`center_latitude` real NOT NULL,
	`center_longitude` real NOT NULL,
	`radius_m` real NOT NULL,
	`catalog_json` text NOT NULL,
	`acquired_at` text NOT NULL
);
