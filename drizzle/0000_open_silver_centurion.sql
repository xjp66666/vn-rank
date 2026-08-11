CREATE TABLE `daily_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_date` text NOT NULL,
	`rank` integer NOT NULL,
	`canonical_key` text NOT NULL,
	`consensus_score` real NOT NULL,
	`source_count` integer NOT NULL,
	`item_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_daily_rankings_date_rank` ON `daily_rankings` (`snapshot_date`,`rank`);--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`snapshot_date` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`vndb_count` integer DEFAULT 0 NOT NULL,
	`bangumi_count` integer DEFAULT 0 NOT NULL,
	`erogamescape_count` integer DEFAULT 0 NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `source_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_date` text NOT NULL,
	`source` text NOT NULL,
	`source_rank` integer NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`score` real NOT NULL,
	`votes` integer NOT NULL,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_source_entries_date_source_rank` ON `source_entries` (`snapshot_date`,`source`,`source_rank`);