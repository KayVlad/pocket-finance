CREATE TABLE `category_years` (
	`account_id` text NOT NULL,
	`year` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_category_year_account` ON `category_years` (`account_id`,`year`);--> statement-breakpoint
CREATE TABLE `year_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`year` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_year_category_account_name` ON `year_categories` (`account_id`,`year`,`kind`,`name`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `disabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `refunded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `from_emergency` integer DEFAULT false NOT NULL;