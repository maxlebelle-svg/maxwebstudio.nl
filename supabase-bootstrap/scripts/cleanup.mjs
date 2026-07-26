#!/usr/bin/env node
import fs from 'node:fs';
import { assertDisposableWorkspace, assertLocalSentinel } from './guardrails.mjs';

assertLocalSentinel();
const index = process.argv.indexOf('--workspace');
const workspace = assertDisposableWorkspace(index >= 0 ? process.argv[index + 1] : '');
fs.rmSync(workspace, { recursive: true, force: true });
process.stdout.write(`removed ${workspace}\n`);
