CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_object_key_unique` ON `receipts` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_receipts_account_transaction` ON `receipts` (`account_id`,`transaction_id`);