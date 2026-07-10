#!/usr/bin/env node

import readline from "node:readline/promises";

const DEFAULT_BASE_URL = "https://maxwebstudio.nl";

main().catch((error) => {
  console.error(`Token helper failed: ${safeMessage(error.message)}`);
  process.exitCode = 1;
});

async function main() {
  const config = await resolveAuthConfig();
  if (!config.supabaseUrl || !config.anonKey) {
    throw new Error("Supabase URL or anon key is missing. Set P0_SUPABASE_URL and P0_SUPABASE_ANON_KEY, or make client-auth-config reachable.");
  }

  const email = (process.env.P0_TOKEN_EMAIL || await ask("Test user e-mail: ")).trim();
  const password = process.env.P0_TOKEN_PASSWORD || await askSecret("Test user password: ");
  if (!email || !password) throw new Error("Test user e-mail and password are required.");

  const session = await signIn(config, email, password);
  const targetEnv = (process.env.P0_TOKEN_TARGET_ENV || "P0_<ROLE>_JWT").trim();
  const expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "unknown";

  console.log("P0 test token fetched.");
  console.log(`User: ${session.user?.email || email}`);
  console.log(`User id: ${session.user?.id || "unknown"}`);
  console.log(`Expires at: ${expiresAt}`);
  console.log(`Target env: ${targetEnv}`);

  if (process.env.P0_PRINT_TOKEN === "true") {
    console.log(`export ${targetEnv}="${session.access_token}"`);
  } else {
    console.log("Token: hidden. Set P0_PRINT_TOKEN=true to print a one-line export command intentionally.");
  }
}

async function resolveAuthConfig() {
  const envUrl = cleanUrl(process.env.P0_SUPABASE_URL || "");
  const envAnonKey = process.env.P0_SUPABASE_ANON_KEY || "";
  if (envUrl && envAnonKey) return { supabaseUrl: envUrl, anonKey: envAnonKey };

  const baseUrl = cleanUrl(process.env.P0_BASE_URL || DEFAULT_BASE_URL);
  const response = await fetch(`${baseUrl}/.netlify/functions/client-auth-config`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`client-auth-config returned status ${response.status}.`);
  const body = await response.json();
  return {
    supabaseUrl: cleanUrl(body.supabaseUrl || body.SUPABASE_URL || ""),
    anonKey: body.supabaseAnonKey || body.SUPABASE_ANON_KEY || "",
  };
}

async function signIn(config, email, password) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Supabase Auth rejected the login with status ${response.status}.`);
  }
  return body;
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function askSecret(question) {
  if (!process.stdin.isTTY) return ask(question);
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let value = "";
  return new Promise((resolve) => {
    const onData = (char) => {
      if (char === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    process.stdin.on("data", onData);
  });
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function safeMessage(message) {
  return String(message || "Unknown error")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
