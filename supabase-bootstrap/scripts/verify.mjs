#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { assertHistory, assertLocalDbUrl, assertLocalSentinel } from './guardrails.mjs';

assertLocalSentinel();
const urlIndex = process.argv.indexOf('--db-url');
const expectedIndex = process.argv.indexOf('--expected');
const dbUrl = assertLocalDbUrl(urlIndex >= 0 ? process.argv[urlIndex + 1] : '').toString();
const expected = (expectedIndex >= 0 ? process.argv[expectedIndex + 1] : '').split(',').filter(Boolean);
const json = execFileSync('psql', [dbUrl, '-AtX', '-c', "select coalesce(json_agg(x order by version),'[]'::json)::text from (select version,name from supabase_migrations.schema_migrations) x"], { encoding: 'utf8' }).trim();
const rows = JSON.parse(json);
assertHistory(rows, expected);
process.stdout.write(`${JSON.stringify(rows)}\n`);
