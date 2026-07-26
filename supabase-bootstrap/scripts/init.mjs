#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertBaseline, assertDisposableWorkspace, assertLocalSentinel, BASELINE_FILE } from './guardrails.mjs';

assertLocalSentinel();
const index = process.argv.indexOf('--workspace');
const workspace = assertDisposableWorkspace(index >= 0 ? process.argv[index + 1] : '');
const bootstrapRoot = path.resolve(new URL('..', import.meta.url).pathname);
const repoRoot = path.resolve(bootstrapRoot, '..');
const source = path.resolve(repoRoot, 'supabase/migrations', BASELINE_FILE);
const bytes = assertBaseline(source);
const migrationDir = path.join(workspace, 'bootstrap-project', 'supabase', 'migrations');
fs.mkdirSync(migrationDir, { recursive: true });
if (fs.readdirSync(migrationDir).some((name) => name.endsWith('.sql'))) throw new Error('refusing to overwrite an existing migration fixture');
fs.copyFileSync(path.join(bootstrapRoot, 'supabase', 'config.toml'), path.join(workspace, 'bootstrap-project', 'supabase', 'config.toml'));
fs.writeFileSync(path.join(migrationDir, BASELINE_FILE), bytes, { flag: 'wx' });
process.stdout.write(`${migrationDir}\n`);
