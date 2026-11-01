#!/usr/bin/env node
// Cross-platform `test:e2e`: sets KUBOES_E2E=1 for the real-API tests.
// The e2e tests skip themselves when the Agnes env vars are missing.
import { spawnSync } from 'child_process';

const result = spawnSync('bun', ['test', 'kuboes', 'src'], {
  stdio: 'inherit',
  env: { ...process.env, KUBOES_E2E: '1' },
});

process.exit(result.status ?? 1);
