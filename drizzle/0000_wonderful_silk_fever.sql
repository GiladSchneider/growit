CREATE TABLE `distribution_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`distribution_id` integer NOT NULL,
	`tier_type` text NOT NULL,
	`recipient_type` text NOT NULL,
	`investor_id` integer,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`distribution_id`) REFERENCES `distributions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `allocations_distribution_idx` ON `distribution_allocations` (`distribution_id`);--> statement-breakpoint
CREATE TABLE `distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`waterfall_snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text
);
--> statement-breakpoint
CREATE TABLE `investors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`investment_date` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waterfall_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`pref_rate_bps` integer,
	`investor_split_bps` integer
);
