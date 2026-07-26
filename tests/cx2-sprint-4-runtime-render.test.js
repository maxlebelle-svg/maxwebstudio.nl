const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = process.cwd();
const html = fs.readFileSync(path.join(root, "public/klantportaal.html"), "utf8");
const sourceMatch = html.match(/function renderProjectCommandCenter\([\s\S]*?\n        }\n        function quoteUrl/);
assert(sourceMatch, "renderProjectCommandCenter source ontbreekt");
const renderSource = sourceMatch[0].replace(/\n        function quoteUrl$/, "");

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.dataset = {};
    this.textContent = "";
    this.className = "";
    this.parentElement = null;
  }
  append(...children) { children.forEach((child) => { child.parentElement = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function createHarness({ withProject = true } = {}) {
  const errors = [];
  const warnings = [];
  const document = { createElement: (tagName) => new Element(tagName) };
  const progressbar = new Element();
  const commandProgressBar = new Element("span");
  commandProgressBar.parentElement = progressbar;
  const elements = {
    commandCenterTitle: new Element(), commandCenterSubtitle: new Element(), commandSyncStatus: new Element(),
    commandNextTitle: new Element(), commandNextText: new Element(), commandNextActions: new Element(),
    commandProgressTitle: new Element(), commandProgressSubtitle: new Element(), commandProgressValue: new Element(),
    commandProgressBar, commandProgressSteps: new Element(), commandTimelineList: new Element(), commandCenter: new Element(),
  };
  let moduleCount = 0;
  const context = {
    document,
    console: { error: (...values) => errors.push(values), warn: (...values) => warnings.push(values) },
    ...elements,
    nextCustomerStep: () => ({ title: "Wij zijn aan zet", text: "Geen actie nodig.", label: "Open berichten", href: "#berichten" }),
    buildCustomerDashboardViewModel: () => ({
      greeting: "Welkom terug, Ziva 👋", context: "DCA ZIP Studio",
      project: { title: withProject ? "Website DCA ZIP Studio" : "Project wordt voorbereid", phase: withProject ? "development" : "Nog niet beschikbaar", progress: withProject ? { available: true, value: 45, label: "45%" } : { available: false, value: 0, label: "Nog niet beschikbaar" } },
      modules: ["website", "feedback", "messages", "files", "invoices", "domain", "business_email"].map((key) => ({ key })),
    }),
    latestDateLabel: () => "vandaag",
    renderCx2ModuleGrid: (model) => { moduleCount = model.modules.length; },
    createWebsiteAction: (label, href) => { const link = new Element("a"); link.textContent = label; link.href = href; return link; },
    labelForStatus: (value) => value,
    buildCommandTimeline: () => [],
    commandTimelineItem: ({ title, meta }) => { const item = new Element("article"); item.textContent = `${title} ${meta}`; return item; },
  };
  vm.createContext(context);
  vm.runInContext(`${renderSource}; globalThis.renderProjectCommandCenter = renderProjectCommandCenter;`, context);
  return { context, elements, progressbar, errors, warnings, getModuleCount: () => moduleCount };
}

function render(harness, overrides = {}) {
  harness.context.renderProjectCommandCenter({
    customer: {}, websites: [], projects: [], files: [], invoices: [], quotes: [],
    changeRequests: [], messages: [], notifications: [], subscriptions: [], previewVersions: [],
    ...overrides,
  });
}

test("renderProjectCommandCenter rendert normale projectdata zonder browserfout", () => {
  const harness = createHarness();
  assert.doesNotThrow(() => render(harness, { projects: [{ name: "Website DCA ZIP Studio", progress: 45 }] }));
  assert.equal(harness.getModuleCount(), 7);
  assert.equal(harness.elements.commandProgressTitle.textContent, "Website DCA ZIP Studio");
  assert.equal(harness.progressbar.getAttribute("aria-valuenow"), "45");
  assert.equal(harness.elements.commandProgressSteps.children[0].className, "journey-progress-message is-neutral");
  assert.equal(harness.errors.length, 0);
  assert.equal(harness.warnings.length, 0);
});

test("renderProjectCommandCenter blijft veilig bij partial data en lege timeline", () => {
  const harness = createHarness({ withProject: false });
  assert.doesNotThrow(() => render(harness));
  assert.equal(harness.getModuleCount(), 7);
  assert.equal(harness.elements.commandProgressValue.textContent, "Nog niet beschikbaar");
  assert.equal(harness.progressbar.getAttribute("role"), null);
  assert.match(harness.elements.commandTimelineList.children[0].textContent, /Nog geen activiteiten/);
  assert.equal(harness.errors.length, 0);
  assert.equal(harness.warnings.length, 0);
});

test("dashboardrenderer bevat geen onbereikbare message-helper of gevoelige output", () => {
  assert.doesNotMatch(renderSource, /\bmessage\s*\(/);
  assert.doesNotMatch(renderSource, /access_token|refresh_token|service[_-]?role|preview_token|recipient_email/i);
});
