# Pocket

A personal finance web app with the familiar rows and columns of a budget spreadsheet. Each category has monthly totals, but every amount is backed by individual transactions with dates, optional notes and receipt photos. Designed for quick entry and a quiet dark-grey interface with a custom accent colour.

## Features

- Annual spreadsheet view and a compact monthly view, with group totals and a cash-flow summary.
- Fixed groups: Income, Emergency fund, Investments, Essential and Personal. Add, rename, reorder, move or delete your own categories.
- Separate category setups for each year. New years inherit the latest earlier setup; edits and deletions affect only the selected year. Deleting a category also deletes its transactions for that year.
- Click a cell to add a transaction or see its history. Double-click a populated category/month cell to replace that category's transactions in every later month of the same year. Notes and flags carry forward; dates adjust for shorter months.
- Search history across all years, or narrow it to the selected period or cell. Combine text search with positive/negative/all and with/without/all receipts filters.
- Optional descriptions (default: `Transaction`), notes, full-refund and emergency-fund checkboxes.
- Receipt photos on new and existing transactions, with downloads beside Edit and a distinct tint for entries that have receipts.
- CSV export and a complete JSON backup/restore, including yearly categories, preferences and receipt photos.
- Username/password login with separate data for every account. First-run setup creates the initial admin. Admins create users and other admins, change roles, reset passwords, disable access and delete accounts. Everyone can change their own password in Settings.

## Run locally

Requirements: **Node.js 22.13 or newer**, npm and Git. Local development uses an emulated Cloudflare D1 database and R2 bucket; no Cloudflare account or API keys are required.

```sh
git clone https://github.com/KayVlad/pocket-finance.git
cd pocket-finance
npm ci
npm run db:setup
npm run dev
```

Open **http://localhost:5173**. On a fresh installation, Pocket asks you to create the first admin with your name, username and password. Setup signs you in and closes permanently once an account is configured. Existing installations keep their accounts and show the sign-in form. There are no default credentials or preloaded personal records.

Admins use **Users** to create users or admins, promote or demote accounts, reset passwords, disable access and permanently delete accounts. Deleting an account removes its finance data and receipt photos. Admins cannot delete or disable themselves or change their own role, which also protects the final active admin during concurrent changes. Admin privileges cover account management; finance data remains scoped to each account.

Everyone can change their password in **Settings** using their current password. Password changes sign out other devices; admin resets, role changes and disabling revoke all sessions for the affected account. If you forget your password, ask another admin to reset it. There is no email recovery service.

Keep the development server running while using the app. Stop it with Ctrl+C. For subsequent runs, use `npm run dev`; you do not need to create another admin. `npm run db:setup` also applies new migrations when you update a checkout initialized through this workflow. It does not target a hosted database.

If a native dependency is missing after installation, try `npm run install:ci`, which reinstalls the locked dependencies using the project's portable install helper.

### Local data

D1 records and R2 receipt files persist together under `.wrangler/state`. Generated tool configuration is under `.sites-runtime`. Both directories are ignored by Git, along with environment files, build output and installed dependencies. Each checkout has its own local data.

Use Settings to download a JSON backup before moving to another computer. Restore it while signed in to the destination account. A restore replaces that account's finance data; it leaves login credentials and other accounts intact. CSV is useful for analysis, but does not contain the receipt image bytes.

The migration command is intended for fresh clones or databases initialized with it. If you have an older database whose SQL migrations were applied manually, reconcile its migration history before running `db:setup`; do not reapply the initial schema over existing tables.

## Fast entry

| Action | Shortcut or gesture |
| --- | --- |
| Add a transaction | `+` or an empty category/month cell |
| Move through fields | `Tab` / `Shift+Tab` |
| Save | `Ctrl+Enter` / `Command+Enter` |
| Close a dialog | `Escape` |
| Accept a confirmation | `Space`, when not typing in a field |
| View previous transactions | Click a populated cell or open History |
| Fill remaining months | Double-click a populated category/month cell and confirm |

Amount receives focus when the entry form opens. A description is optional. Forward fill replaces existing transactions in the target cells, including their attached receipts; receipts from the source cell are not duplicated.

## How totals work

Amounts are **EUR**, stored as integer cents. Left over measures cash flow for the selected period, rather than a bank-account balance:

```text
Left over = income − regular expenses − investments − emergency contributions
```

Investments and emergency contributions reduce available money without being counted as ordinary expenses. An expense marked **Taken from emergency fund** reduces the fund instead of regular cash flow, so the same money is not deducted twice. Existing fund balances carry across years and do not count as income or reduce Left over again. The monthly fund balance is cumulative through that month.

**Refunded** represents a full refund: the original transaction stays in history with zero impact on totals. A refunded expense previously paid from the emergency fund restores that money to the fund. Partial refunds and bank synchronization are not implemented.

## Receipts and backups

Attach JPG, PNG, WebP or GIF images: up to 8 photos per transaction, 5 MB per photo and 20 MB per upload. D1 holds account-scoped metadata; R2 holds the image bytes. Downloads require the owning account's session.

JSON backups include all transaction years, categories, flags, notes, accent colour and receipt bytes. Version 2 includes receipts; older version 1 backups are also accepted. Restore validates the entire file before replacing data. Current limits are 10,000 transactions and 20 MB per backup, including up to 10 MB of receipt photos. Account credentials are excluded.

## Development

Built with React, TypeScript, Vinext/Vite, Tailwind, Radix components, Drizzle ORM and Cloudflare Workers/D1/R2. The app retains the Sites scaffold's build integration; the checked-in binding configuration contains local resource names, not a live deployment identifier.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 5173 |
| `npm run db:setup` | Apply migrations to the local D1 database |
| `npm run admin:create -- --username admin --name Admin` | Optional offline first-admin bootstrap |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint checks |
| `npm run test:integration` | API integration checks against the running local server |
| `npm run test:accounts` | Setup, permissions and account lifecycle checks in an isolated temporary database |
| `npm run db:generate` | Generate a migration after changing the schema |
| `npm run build` | Create a production build in `dist` |
| `npm start` | Run that build locally, normally on port 8787 |

Integration checks create and clean up their own disposable local accounts. They cover authentication, account isolation, transaction and category operations, yearly inheritance, refunds, fund calculations, forward-fill replacement, receipts, exports and backup/restore. They do not reset your admin's password. `npm run test:accounts` starts its own temporary server and database and checks simultaneous setup, admin/user permissions, role changes, password resets, session revocation, deletion cleanup and concurrent protection of the final admin. It never touches existing accounts. For `test:integration`, the development server must be running, and the database must be initialized. To test another local port, set `TEST_URL` to `http://localhost:<port>`.

Key directories:

```text
app/                 Finance UI and account-scoped API routes
components/ui/       Shared UI primitives
lib/                 Validation, totals, auth and storage helpers
db/                  Drizzle schema and D1 access
drizzle/             Committed SQL migrations and schema snapshots
scripts/             Local setup, admin bootstrap, builds and integration checks
build/               Vite integration helpers
```

Passwords are hashed with bcrypt. Expiring sessions use hashed secrets and HttpOnly cookies, with SameSite protection and Secure cookies over HTTPS. User disabling and password resets revoke existing sessions. The offline admin bootstrap refuses to create another admin once one exists.

`npm start` is a local preview, not a public deployment. Running on a server requires configuring that environment's D1/R2 resources, applying migrations there, completing first-admin setup before giving others access, and serving over HTTPS. No bank connection, Google Sheets synchronization or public deployment is set up by the local commands.
