#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const VIEWPORTS = Object.freeze({
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 1000 },
});
const REQUIRED_CHECKS = Object.freeze(["layout", "overflow", "typography", "interaction", "console", "forms", "visual_rubric"]);
const baseUrl = cleanUrl(process.env.FACTORY_BASE_URL || "");
const adminToken = String(process.env.FACTORY_ADMIN_JWT || "").trim();
const oidcAudience = "maxwebstudio-website-factory-browser-worker";
const outputRoot = path.resolve(process.env.FACTORY_BROWSER_OUTPUT_DIR || "artifacts/factory-browser-review");
const limit = Math.max(1, Math.min(10, Number(process.env.FACTORY_BROWSER_LIMIT || 3)));
let chrome = null;
let factoryAccessToken = adminToken;

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Website Factory browser-worker. Vereist FACTORY_BASE_URL en GitHub Actions OIDC; FACTORY_ADMIN_JWT is alleen een lokale fallback.");
    return;
  }
  if (!baseUrl) fail("FACTORY_BASE_URL ontbreekt.");
  if (!factoryAccessToken) factoryAccessToken = await requestGithubActionsOidcToken();
  if (typeof WebSocket !== "function") fail("Deze worker vereist Node.js 22 of hoger met WebSocket-ondersteuning.");
  await mkdir(outputRoot, { recursive: true });
  chrome = await startChrome();
  const run = {
    schemaVersion: "mws.browser-worker-run.v1",
    startedAt: new Date().toISOString(),
    baseUrl,
    jobs: [],
  };
  try {
    const queue = await factoryRequest("get_browser_review_queue", { limit });
    for (const queuedJob of queue.jobs || []) run.jobs.push(await reviewJob(queuedJob));
    run.finishedAt = new Date().toISOString();
    run.status = run.jobs.every((job) => job.status === "passed") ? "passed" : run.jobs.length ? "attention_required" : "idle";
    await writeJson(path.join(outputRoot, "run.json"), run);
    console.log(JSON.stringify({ status: run.status, count: run.jobs.length, output: path.join(outputRoot, "run.json") }));
    if (run.status === "attention_required") process.exitCode = 2;
  } finally {
    chrome.kill("SIGTERM");
  }
}

async function reviewJob(initialJob) {
  let job = initialJob;
  let artifactHash = String(job.artifactHash || "");
  const result = { jobId: job.id, previewUrl: absoluteUrl(job.previewUrl), attempts: [], status: "attention_required" };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (!/^[0-9a-f]{64}$/i.test(artifactHash)) throw new Error(`Build ${job.id} mist een geldige artifact-hash.`);
    const evidence = await inspectPreview({
      jobId: job.id,
      previewUrl: absoluteUrl(job.previewUrl),
      artifactHash,
      attempt,
    });
    const evidenceFile = path.join(outputRoot, safeName(job.id), `attempt-${attempt}`, "evidence.json");
    await writeJson(evidenceFile, evidence);
    const submission = await factoryRequest("submit_browser_review", { jobId: job.id, evidence });
    result.attempts.push({ attempt, evidenceFile, browserReview: submission.browserReview, repairs: submission.appliedRepairs || [] });
    if (submission.customerPreviewReady === true) {
      result.status = "passed";
      result.score = submission.browserReview?.score || 0;
      break;
    }
    if (!submission.repaired || !submission.nextArtifactHash) {
      result.status = "manual_review_required";
      break;
    }
    artifactHash = submission.nextArtifactHash;
    job = { ...job, ...(submission.buildJob || {}), previewUrl: submission.buildJob?.previewUrl || job.previewUrl };
  }
  return result;
}

async function inspectPreview({ jobId, previewUrl, artifactHash, attempt }) {
  const viewports = {};
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    const attemptDir = path.join(outputRoot, safeName(jobId), `attempt-${attempt}`);
    await mkdir(attemptDir, { recursive: true });
    const screenshotPath = path.join(attemptDir, `${name}.png`);
    viewports[name] = await inspectViewport({ name, viewport, previewUrl, screenshotPath, jobId, attempt });
  }
  return {
    schemaVersion: "mws.browser-review.v1",
    artifactHash,
    reviewedAt: new Date().toISOString(),
    provider: "max-webstudio-headless-chrome-v1",
    viewports,
  };
}

async function inspectViewport({ name, viewport, previewUrl, screenshotPath, jobId, attempt }) {
  const target = await createTarget();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const consoleErrors = [];
  let mainDocumentStatus = 0;
  client.on("Runtime.exceptionThrown", (params) => consoleErrors.push(params.exceptionDetails?.text || "Runtime exception"));
  client.on("Runtime.consoleAPICalled", (params) => {
    if (["error", "assert"].includes(params.type)) consoleErrors.push(params.args?.map((arg) => arg.value || arg.description || "").join(" ") || "Console error");
  });
  client.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") consoleErrors.push(params.entry.text || "Log error");
  });
  client.on("Network.responseReceived", (params) => {
    if (params.type === "Document" && params.response?.url === previewUrl) mainDocumentStatus = Number(params.response.status || 0);
  });
  try {
    await Promise.all([
      client.call("Page.enable"),
      client.call("Runtime.enable"),
      client.call("Log.enable"),
      client.call("Network.enable"),
    ]);
    await client.call("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: name === "mobile",
    });
    await client.call("Page.navigate", { url: previewUrl });
    await waitForReady(client);
    const audit = await evaluate(client, auditExpression());
    const shot = await client.call("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    await writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
    const score = visualScore(audit, consoleErrors, mainDocumentStatus);
    const statuses = {
      layout: audit.clippedElements.length === 0 && audit.overlapRisks.length === 0 && audit.brokenImages.length === 0,
      overflow: audit.horizontalOverflow === false && audit.overflowElements.length === 0,
      typography: audit.tinyText.length === 0,
      interaction: audit.missingTargets.length === 0 && audit.unnamedInteractive.length === 0,
      console: consoleErrors.length === 0 && (!mainDocumentStatus || mainDocumentStatus < 400),
      forms: audit.unlabeledControls.length === 0,
      visual_rubric: score >= 80,
    };
    const details = {
      layout: `${audit.clippedElements.length} afgekapte elementen; ${audit.overlapRisks.length} overlaprisico's; ${audit.brokenImages.length} ontbrekende afbeeldingen.`,
      overflow: audit.horizontalOverflow ? `Documentbreedte ${audit.scrollWidth}px bij viewport ${viewport.width}px.` : "Geen horizontale overflow.",
      typography: `${audit.tinyText.length} zichtbare tekstelementen kleiner dan 12px.`,
      interaction: `${audit.missingTargets.length} ontbrekende doelen; ${audit.unnamedInteractive.length} naamloze bedieningen.`,
      console: consoleErrors.length ? consoleErrors.slice(0, 5).join(" | ") : `Geen consolefouten; documentstatus ${mainDocumentStatus || 200}.`,
      forms: `${audit.unlabeledControls.length} formuliervelden zonder toegankelijke naam.`,
      visual_rubric: `Automatische visuele funderingsscore ${score}/100.`,
    };
    return {
      width: viewport.width,
      height: viewport.height,
      visualScore: score,
      screenshotRef: `artifact://factory-browser-review/${safeName(jobId)}/attempt-${attempt}/${name}.png`,
      checks: Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, { status: statuses[check] ? "passed" : "failed", details: details[check] }])),
    };
  } finally {
    client.close();
    await closeTarget(target.id).catch(() => null);
  }
}

function auditExpression() {
  return `(() => {
    const visible = (el) => { const s=getComputedStyle(el),r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0; };
    const label = (el) => el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.labels?.[0]?.innerText||el.title||el.innerText||el.value||'';
    const all=[...document.querySelectorAll('body *')].filter(visible);
    const overflowElements=all.filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+2||r.left<-2;}).slice(0,25).map(el=>el.tagName.toLowerCase()+'.'+String(el.className||'').split(' ').slice(0,2).join('.'));
    const clippedElements=all.filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return (s.overflow==='hidden'||s.overflowX==='hidden')&&el.scrollWidth>el.clientWidth+4&&r.width>20;}).slice(0,25).map(el=>el.tagName.toLowerCase());
    const overlapRisks=[...document.querySelectorAll('[style*="position: fixed"],.fixed,.sticky')].filter(visible).filter(el=>el.getBoundingClientRect().height>innerHeight*.45).map(el=>el.tagName.toLowerCase());
    const tinyText=all.filter(el=>el.children.length===0&&String(el.textContent||'').trim()&&parseFloat(getComputedStyle(el).fontSize)<12).slice(0,25).map(el=>String(el.textContent||'').trim().slice(0,40));
    const controls=[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);
    const unlabeledControls=controls.filter(el=>!label(el)).map(el=>el.name||el.id||el.tagName.toLowerCase());
    const interactive=[...document.querySelectorAll('a[href],button,[role=button]')].filter(visible);
    const unnamedInteractive=interactive.filter(el=>!label(el).trim()).map(el=>el.tagName.toLowerCase());
    const missingTargets=[...document.querySelectorAll('a[href^="#"]')].filter(el=>{const href=el.getAttribute('href');if(href==='#')return false;try{return !document.querySelector(href);}catch{return true;}}).map(el=>el.getAttribute('href'));
    const brokenImages=[...document.images].filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.currentSrc||img.src||'afbeelding').slice(0,25);
    const sections=document.querySelectorAll('main section,body>section').length;
    return {scrollWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,overflowElements,clippedElements,overlapRisks,tinyText,unlabeledControls,unnamedInteractive,missingTargets,brokenImages,sections,headings:document.querySelectorAll('h1,h2').length,images:[...document.images].filter(img=>img.naturalWidth>0).length,cta:interactive.length};
  })()`;
}

function visualScore(audit, consoleErrors, status) {
  let score = 100;
  if (audit.horizontalOverflow) score -= 25;
  score -= Math.min(20, audit.overflowElements.length * 4);
  score -= Math.min(15, audit.clippedElements.length * 3);
  score -= Math.min(20, audit.brokenImages.length * 5);
  score -= Math.min(10, audit.tinyText.length * 2);
  if (!audit.headings) score -= 15;
  if (!audit.sections) score -= 10;
  if (!audit.cta) score -= 15;
  if (!audit.images) score -= 5;
  if (consoleErrors.length || status >= 400) score -= 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function factoryRequest(action, payload = {}) {
  const response = await fetch(`${baseUrl}/.netlify/functions/website-factory`, {
    method: "POST",
    headers: { Authorization: `Bearer ${factoryAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`Factory gaf geen geldige JSON voor ${action}.`); }
  if (!response.ok || body.success === false) throw new Error(body.error || `Factory ${action} mislukte met status ${response.status}.`);
  return body;
}

async function requestGithubActionsOidcToken() {
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || "").trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || "").trim();
  if (!requestUrl || !requestToken) fail("GitHub Actions OIDC is niet beschikbaar en FACTORY_ADMIN_JWT ontbreekt.");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", oidcAudience);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !String(body.value || "").trim()) fail("GitHub Actions kon geen OIDC-token voor de Factory-worker uitgeven.");
  return String(body.value).trim();
}

async function startChrome() {
  const executable = await findChrome();
  const port = 12000 + Math.floor(Math.random() * 20000);
  const profile = path.join(outputRoot, `.chrome-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  const child = spawn(executable, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(-2000); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome stopte tijdens starten: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return Object.assign(child, { port, profile });
    } catch {}
    await delay(100);
  }
  child.kill("SIGTERM");
  throw new Error("Headless Chrome werd niet tijdig beschikbaar.");
}

async function findChrome() {
  const configured = String(process.env.CHROME_BIN || "").trim();
  const candidates = [configured, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch {}
  }
  throw new Error("Geen uitvoerbare Chrome/Chromium gevonden. Stel CHROME_BIN in.");
}

async function createTarget() {
  const response = await fetch(`http://127.0.0.1:${chrome.port}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  if (!response.ok) throw new Error("Chrome kon geen reviewtab openen.");
  return response.json();
}

async function closeTarget(id) {
  await fetch(`http://127.0.0.1:${chrome.port}/json/close/${encodeURIComponent(id)}`);
}

async function waitForReady(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(client, "document.readyState").catch(() => "loading");
    if (state === "complete") { await delay(500); return; }
    await delay(100);
  }
  throw new Error("Preview werd niet tijdig geladen.");
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser-evaluatie mislukte.");
  return result.result?.value;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.receive(JSON.parse(String(event.data))));
    socket.addEventListener("close", () => this.rejectPending(new Error("Chrome-verbinding gesloten.")));
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) {
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }
  receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "Chrome-opdracht mislukte."));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
  }
  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  close() { this.socket.close(); }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function absoluteUrl(value = "") { return new URL(String(value || ""), `${baseUrl}/`).toString(); }
function cleanUrl(value = "") { return String(value || "").trim().replace(/\/$/, ""); }
function safeName(value = "") { return String(value || "job").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "job"; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fail(message) { console.error(message); process.exit(1); }

await main();
