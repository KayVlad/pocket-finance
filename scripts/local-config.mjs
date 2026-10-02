import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const localState = path.join(projectRoot, '.wrangler/state');

export function ensureLocalConfig() {
  const runtime = path.join(projectRoot, '.sites-runtime');
  mkdirSync(runtime, {recursive: true});
  const config = path.join(runtime, 'local-db.json');
  writeFileSync(config, JSON.stringify({
    name: 'pocket-local',
    compatibility_date: '2026-05-15',
    d1_databases: [{
      binding: 'DB',
      database_name: 'site-creator-d1',
      database_id: '00000000-0000-4000-8000-000000000000',
      migrations_dir: '../drizzle',
    }],
    r2_buckets: [{binding: 'RECEIPTS', bucket_name: 'site-creator-r2'}],
  }, null, 2) + '\n');
  return config;
}

export const wranglerPath = path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
export const localEnvironment = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_WRITE_LOGS: 'false',
  CLOUDFLARE_CF_FETCH_ENABLED: 'false',
};
