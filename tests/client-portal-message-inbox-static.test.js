const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("public/klantportaal.html", "utf8");
const css = fs.readFileSync("public/styles.css", "utf8");
const messageService = fs.readFileSync("public/src/services/clientPortalMessageContextService.js", "utf8");
const writeService = fs.readFileSync("public/src/services/clientPortalMessageWriteService.js", "utf8");
const adminData = fs.readFileSync("functions/admin-supabase-data.js", "utf8");
const adminHtml = fs.readFileSync("public/admin-klanten.html", "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

assert(html.includes('id="portal-message-threads"'), "Client inbox should render a conversation list");
assert(html.includes('data-message-filter="unread"'), "Client inbox should support unread filtering");
assert(html.includes('id="portal-message-conversation-id"'), "Composer should carry the active conversation id");
assert(html.includes('id="portal-message-context-type"'), "Composer should capture safe message context");
assert(html.includes('id="portal-message-active-title"'), "Active thread should have a dedicated heading");
assert(html.includes('id="portal-message-refresh"'), "Inbox should expose a safe refresh action");

assert(html.includes("function buildMessageThreads"), "Messages should be grouped into deterministic threads");
assert(html.includes("function isUnreadForCustomer"), "Unread should be recipient-aware for customer view");
assert(html.includes("meta.idempotencyKey === idempotencyKey"), "Duplicate detection should use idempotency metadata");
assert(html.includes("event.metaKey || event.ctrlKey"), "Composer should support Cmd/Ctrl+Enter send");
assert(html.includes("portalMessageSubmit.disabled"), "Composer should block duplicate submits");
assert(html.includes("portalMessageBody.style.height"), "Composer should autosize textarea");

assert(messageService.includes("conversationIdFor"), "Message context service should derive conversation ids");
assert(messageService.includes("metadataFor"), "Message context service should persist safe metadata");
assert(messageService.includes("idempotencyKey"), "Message context service should carry idempotency keys");
assert(messageService.includes('select: "*"'), "Existing read path remains backwards-compatible while metadata is used");

assert(writeService.includes("conversationIdFor"), "Fallback write path should preserve conversation ids");
assert(writeService.includes("clientWritePhase: \"sprint-6-communication-inbox\""), "Fallback metadata should identify Sprint 6 write flow");

assert(adminData.includes("body: cleanText(row.body)"), "Admin data mapping should read message body from client_portal_messages.body");
assert(adminData.includes("conversationId: cleanText(metadata.conversationId"), "Admin data mapping should expose conversation metadata");
assert(adminHtml.includes('data-customer-workspace-tab="messages"'), "Admin customer workspace should expose a messages tab");
assert(adminHtml.includes('id="customer-workspace-messages"'), "Admin customer workspace should render message threads");
assert(adminHtml.includes("loadClientPortalMessages"), "Admin workspace should load client portal messages from the shared module");
assert(adminHtml.includes("customerMessageThreads"), "Admin workspace should group messages by conversation");

assert(css.includes(".portal-message-thread-list"), "Thread list styling should exist");
assert(css.includes(".portal-message-thread-item"), "Thread item styling should exist");
assert(css.includes(".portal-message-thread-actions"), "Thread filters should be styled");
assert(css.includes("grid-template-columns: minmax(240px, 0.7fr) minmax(0, 1.25fr) minmax(320px, 0.75fr)"), "Desktop inbox should split list, conversation and composer");
assert(css.includes(".portal-message-workspace,\n  .portal-account-grid"), "Existing responsive collapse should still include message workspace");

inlineScripts.forEach((code) => new Function(code));

console.log("client portal message inbox static tests passed");
