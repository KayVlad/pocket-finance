CREATE TABLE `budget_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_category_account_kind_name` ON `budget_categories` (`account_id`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `username` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `accent` text DEFAULT '#2dd4bf' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `categories_initialized` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);