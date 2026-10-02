CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_token_hash_unique` ON `accounts` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_account_date` ON `transactions` (`account_id`,`date`);