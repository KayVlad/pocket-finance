// Applies migrations only to this checkout's local database. No cloud login needed.
import {spawnSync} from 'node:child_process';
import {ensureLocalConfig, localEnvironment, localState, projectRoot, wranglerPath} from './local-config.mjs';

const result = spawnSync(process.execPath, [
  wranglerPath, 'd1', 'migrations', 'apply', 'DB',
  '--config', ensureLocalConfig(), '--local', '--persist-to', localState,
], {cwd: projectRoot, stdio: 'inherit', env: localEnvironment});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
