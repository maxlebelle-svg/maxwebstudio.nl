#!/usr/bin/env node
import path from 'node:path';
import { REMOTE_ENV_KEYS } from './guardrails.mjs';

export function selectRoot({ mode, env = process.env, repoRoot }) {
  if (env.F0F_LOCAL_ONLY !== '1') throw new Error('F0F_LOCAL_ONLY=1 is required');
  const present = REMOTE_ENV_KEYS.filter((key) => Boolean(env[key]));
  if (present.length) throw new Error(`remote environment variables are forbidden: ${present.join(', ')}`);
  if (!['bootstrap', 'existing'].includes(mode)) throw new Error('explicit --mode bootstrap or --mode existing is required');
  const root = path.resolve(repoRoot);
  return mode === 'bootstrap' ? path.join(root, 'supabase-bootstrap') : path.join(root, 'supabase');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modeIndex = process.argv.indexOf('--mode');
  const repoIndex = process.argv.indexOf('--repo-root');
  const selected = selectRoot({
    mode: modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined,
    repoRoot: repoIndex >= 0 ? process.argv[repoIndex + 1] : process.cwd()
  });
  process.stdout.write(`${selected}\n`);
}
