const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/admin/ui/client-asset-upload.js"), "utf8");
const png = fs.readFileSync(path.join(root, "public/max-webstudio-logo-mollie-512.png"));

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement extends EventTarget {
  constructor(id = "") {
    super();
    this.id = id;
    this.attributes = {};
    this.children = [];
    this.classList = new FakeClassList();
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.files = [];
    this.value = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  contains(value) {
    return value === this || this.children.includes(value);
  }

  click() {
    this.dispatchEvent(new Event("click", { cancelable: true }));
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function makeHarness({ storageResponse, completeResponse } = {}) {
  const ids = [
    "relationship-asset-upload",
    "relationship-asset-files",
    "relationship-asset-dropzone",
    "relationship-asset-choose",
    "relationship-asset-selection",
    "relationship-asset-status",
    "relationship-upload-list",
    "relationship-asset-submit",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const form = elements["relationship-asset-upload"];
  const input = elements["relationship-asset-files"];
  const submit = elements["relationship-asset-submit"];
  form.elements = {
    category: { value: "logo" },
    description: { value: "Logo voor de website" },
    usageRightsConfirmed: { checked: true },
  };
  form.querySelector = () => submit;
  form.resetCount = 0;
  form.reset = () => {
    form.resetCount += 1;
  };

  const calls = { prepare: 0, complete: 0, cancel: 0, storage: 0, list: 0, published: 0 };
  const uploadId = "11111111-1111-4111-8111-111111111111";
  const fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === "/api/client-relationship-assets" && (!options.method || options.method === "GET")) {
      calls.list += 1;
      return new Response(JSON.stringify({ success: true, assets: [], requests: [] }), { status: 200 });
    }
    if (target === "/api/client-relationship-assets" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      calls[payload.action] += 1;
      if (payload.action === "prepare") {
        return new Response(JSON.stringify({ success: true, upload: { id: uploadId, url: "https://storage.test/upload" } }), { status: 200 });
      }
      if (payload.action === "complete") {
        if (completeResponse) return completeResponse(payload);
        return new Response(JSON.stringify({ success: true, asset: { id: uploadId, name: payload.name } }), { status: 201 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (target === "https://storage.test/upload" && options.method === "PUT") {
      calls.storage += 1;
      return storageResponse ? storageResponse(options) : new Response("", { status: 200 });
    }
    throw new Error(`Unexpected fetch ${options.method || "GET"} ${target}`);
  };

  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return new FakeElement();
    },
  };
  const window = new EventTarget();
  window.addEventListener("relationship-assets:loaded", () => {
    calls.published += 1;
  });
  const localStorage = {
    getItem(key) {
      if (key === "maxwebstudioSupabaseAuthSession") return JSON.stringify({ access_token: "customer-token" });
      return null;
    },
  };
  const quietConsole = { error() {}, warn() {}, log() {} };
  vm.runInNewContext(source, {
    console: quietConsole,
    CustomEvent,
    Event,
    File,
    FormData,
    Promise,
    document,
    fetch,
    localStorage,
    window,
  });

  return { calls, elements, form, input, submit };
}

test("double submit creates one upload and keeps the button disabled until completion", async () => {
  const storage = deferred();
  const harness = makeHarness({ storageResponse: () => storage.promise });
  await waitFor(() => harness.calls.list === 1, "Initial asset list should load");

  harness.input.files = [new File([png], "FuelGo logo.png", { type: "image/png" })];
  harness.input.dispatchEvent(new Event("change"));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));

  assert.equal(harness.submit.disabled, true);
  assert.equal(harness.form.attributes["aria-busy"], "true");
  await waitFor(() => harness.calls.storage === 1, "Binary storage upload should start");
  assert.equal(harness.calls.prepare, 1);

  storage.resolve(new Response("", { status: 200 }));
  await waitFor(() => harness.calls.complete === 1 && harness.submit.disabled === false, "Upload should complete");
  assert.equal(harness.calls.prepare, 1);
  assert.equal(harness.calls.storage, 1);
  assert.equal(harness.calls.complete, 1);
  assert.equal(harness.calls.list, 2);
  assert.equal(harness.calls.published, 3);
  assert.equal(harness.form.resetCount, 1);
  assert.equal(harness.elements["relationship-asset-status"].textContent.includes("direct in je bibliotheek"), true);
});

test("a failed binary read keeps the File selection and does not reset the form", async () => {
  const harness = makeHarness({
    storageResponse: async () => {
      throw new TypeError("Load failed");
    },
  });
  await waitFor(() => harness.calls.list === 1, "Initial asset list should load");

  harness.input.files = [new File([png], "FuelGo logo.png", { type: "image/png" })];
  harness.input.dispatchEvent(new Event("change"));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));

  await waitFor(() => harness.calls.cancel === 1 && harness.submit.disabled === false, "Failed upload should cancel and unlock");
  assert.equal(harness.form.resetCount, 0);
  assert.equal(harness.elements["relationship-asset-selection"].children.length, 1);
  assert.equal(harness.elements["relationship-asset-status"].textContent.includes("Open of download"), true);
  assert.equal(harness.elements["relationship-asset-status"].className.includes("error"), true);
});

test("a lost completion response never cancels a possibly committed asset", async () => {
  const harness = makeHarness({
    completeResponse: async () => {
      throw new TypeError("socket closed");
    },
  });
  await waitFor(() => harness.calls.list === 1, "Initial asset list should load");

  harness.input.files = [new File([png], "FuelGo logo.png", { type: "image/png" })];
  harness.input.dispatchEvent(new Event("change"));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));

  await waitFor(() => harness.calls.complete === 1 && harness.submit.disabled === false, "Completion failure should unlock");
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.form.resetCount, 0);
  assert.equal(harness.elements["relationship-asset-selection"].children.length, 1);
  assert.equal(harness.elements["relationship-asset-status"].textContent.includes("verbinding werd onderbroken"), true);
  assert.equal(harness.elements["relationship-asset-status"].textContent.includes("socket"), false);
});
