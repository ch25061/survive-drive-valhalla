CREATE TABLE `honeycomb_cells` (
	`cell_id` text PRIMARY KEY NOT NULL,
	`grid_version` text NOT NULL,
	`q` integer NOT NULL,
	`r` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`polygon_json` text NOT NULL,
	`constructed_at` text NOT NULL
);
