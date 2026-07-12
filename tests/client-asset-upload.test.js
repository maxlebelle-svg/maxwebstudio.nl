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
    this.dataset = {};
    this.style = {};
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.files = [];
    this.value = "";
    this.queryMap = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  querySelector(selector) {
    return this.queryMap[selector] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  toggleAttribute(name, enabled) {
    if (enabled) this.attributes[name] = "";
    else delete this.attributes[name];
  }

  contains(value) {
    return value === this || this.children.includes(value);
  }

  closest() {
    return null;
  }

  focus() {
    this.focused = true;
  }

  click() {
    this.dispatchEvent(new Event("click", { cancelable: true }));
  }

  remove() {
    this.removed = true;
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

function makeHarness({ storageResponse, finalizeResponse } = {}) {
  const ids = [
    "relationship-asset-upload",
    "relationship-asset-files",
    "relationship-asset-dropzone",
    "relationship-asset-choose",
    "relationship-asset-selected-list",
    "relationship-asset-category",
    "relationship-asset-description",
    "relationship-asset-description-count",
    "relationship-asset-rights",
    "relationship-asset-submit",
    "relationship-asset-status",
    "relationship-asset-progress",
    "relationship-asset-progress-bar",
    "relationship-asset-progress-label",
    "relationship-asset-request-panel",
    "relationship-upload-list",
    "relationship-asset-files-error",
    "relationship-asset-category-error",
    "relationship-asset-description-error",
    "relationship-asset-rights-error",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const form = elements["relationship-asset-upload"];
  const input = elements["relationship-asset-files"];
  const category = elements["relationship-asset-category"];
  const description = elements["relationship-asset-description"];
  const rights = elements["relationship-asset-rights"];
  const submit = elements["relationship-asset-submit"];
  const status = elements["relationship-asset-status"];
  const progress = elements["relationship-asset-progress"];
  category.value = "logo";
  description.value = "Logo voor de website";
  rights.checked = true;

  const submitLabel = new FakeElement("submit-label");
  const submitLoading = new FakeElement("submit-loading");
  submit.queryMap["[data-upload-submit-label]"] = submitLabel;
  submit.queryMap["[data-upload-submit-loading]"] = submitLoading;
  const statusIcon = new FakeElement("status-icon");
  const statusTitle = new FakeElement("status-title");
  const statusMessage = new FakeElement("status-message");
  status.queryMap["[data-upload-status-icon]"] = statusIcon;
  status.queryMap["[data-upload-status-title]"] = statusTitle;
  status.queryMap["[data-upload-status-message]"] = statusMessage;
  const progressTrack = new FakeElement("progress-track");
  progress.queryMap["[role='progressbar']"] = progressTrack;

  form.resetCount = 0;
  form.reset = () => {
    form.resetCount += 1;
  };

  const calls = { prepare: 0, finalize: 0, storage: 0, list: 0, published: 0 };
  const uploadId = "11111111-1111-4111-8111-111111111111";
  const uploadUrl = `https://example.supabase.co/storage/v1/object/upload/sign/relationship-assets/customer/${uploadId}/logo.png?token=signed`;
  const fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === "/api/client-relationship-assets" && (!options.method || options.method === "GET")) {
      calls.list += 1;
      return new Response(JSON.stringify({ success: true, assets: [], requests: [] }), { status: 200 });
    }
    if (target === "/api/client-relationship-assets" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      if (payload.action === "prepare") {
        calls.prepare += 1;
        return new Response(JSON.stringify({
          success: true,
          uploadId,
          uploadUrl,
          uploadMethod: "PUT",
          uploadHeaders: { "x-upsert": "false" },
        }), { status: 200 });
      }
      if (payload.action === "finalize") {
        calls.finalize += 1;
        if (finalizeResponse) return finalizeResponse(payload);
        return new Response(JSON.stringify({
          success: true,
          asset: {
            id: uploadId,
            originalFilename: "FuelGo logo.png",
            mimeType: "image/png",
            sizeBytes: png.length,
            category: "logo",
            status: "new",
            downloadAvailable: true,
            previewAvailable: true,
          },
        }), { status: 201 });
      }
    }
    throw new Error(`Unexpected fetch ${options.method || "GET"} ${target}`);
  };

  class FakeXMLHttpRequest extends EventTarget {
    constructor() {
      super();
      this.upload = new EventTarget();
      this.status = 0;
      this.headers = {};
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name, value) {
      this.headers[name] = value;
    }

    send(body) {
      calls.storage += 1;
      this.body = body;
      const result = storageResponse ? storageResponse({ method: this.method, url: this.url, body }) : Promise.resolve(new Response("", { status: 200 }));
      Promise.resolve(result).then((response) => {
        this.status = response.status;
        return response.text();
      }).then((responseText) => {
        this.responseText = responseText;
        this.dispatchEvent(new Event("load"));
      }).catch(() => this.dispatchEvent(new Event("error")));
    }
  }

  const document = {
    body: new FakeElement("body"),
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return new FakeElement();
    },
  };
  const window = new EventTarget();
  window.location = { origin: "https://portal.example", hostname: "portal.example" };
  window.setTimeout = setTimeout;
  window.addEventListener("relationship-assets:updated", () => {
    calls.published += 1;
  });
  const localStorage = {
    getItem(key) {
      if (key === "maxwebstudioSupabaseAuthSession") return JSON.stringify({ access_token: "customer-token" });
      return null;
    },
  };
  const quietConsole = { error() {}, info() {}, warn() {}, log() {} };
  vm.runInNewContext(source, {
    console: quietConsole,
    CustomEvent,
    Event,
    File,
    FormData,
    Promise,
    Response,
    URL,
    XMLHttpRequest: FakeXMLHttpRequest,
    document,
    fetch,
    localStorage,
    setTimeout,
    window,
  });

  return { calls, elements, form, input, submit, status, statusTitle, statusMessage };
}

test("double submit creates one upload and stays disabled until finalize", async () => {
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
  await waitFor(() => harness.calls.finalize === 1 && harness.form.resetCount === 1, "Upload should finalize");
  assert.equal(harness.calls.prepare, 1);
  assert.equal(harness.calls.storage, 1);
  assert.equal(harness.calls.finalize, 1);
  assert.equal(harness.calls.list, 2);
  assert.equal(harness.calls.published, 3);
  assert.equal(harness.form.attributes["aria-busy"], "false");
  assert.equal(harness.submit.disabled, true, "No file remains after a successful reset");
  assert.equal(harness.statusTitle.textContent, "Bestand succesvol toegevoegd");
});

test("a failed binary upload keeps the File selection and does not reset the form", async () => {
  const harness = makeHarness({
    storageResponse: async () => {
      throw new TypeError("Load failed");
    },
  });
  await waitFor(() => harness.calls.list === 1, "Initial asset list should load");

  harness.input.files = [new File([png], "FuelGo logo.png", { type: "image/png" })];
  harness.input.dispatchEvent(new Event("change"));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));

  await waitFor(() => harness.calls.storage === 1 && harness.form.attributes["aria-busy"] === "false", "Failed upload should unlock");
  assert.equal(harness.calls.finalize, 0);
  assert.equal(harness.form.resetCount, 0);
  assert.equal(harness.elements["relationship-asset-selected-list"].children.length, 1);
  assert.equal(harness.status.dataset.state, "error");
  assert.equal(harness.statusMessage.textContent.includes("veilig worden opgeslagen"), true);
  assert.equal(harness.statusMessage.textContent.includes("Load failed"), false);
});

test("a lost finalize response keeps the selection and never leaks the technical error", async () => {
  const harness = makeHarness({
    finalizeResponse: async () => {
      throw new TypeError("socket closed");
    },
  });
  await waitFor(() => harness.calls.list === 1, "Initial asset list should load");

  harness.input.files = [new File([png], "FuelGo logo.png", { type: "image/png" })];
  harness.input.dispatchEvent(new Event("change"));
  harness.form.dispatchEvent(new Event("submit", { cancelable: true }));

  await waitFor(() => harness.calls.finalize === 1 && harness.form.attributes["aria-busy"] === "false", "Finalize failure should unlock");
  assert.equal(harness.form.resetCount, 0);
  assert.equal(harness.elements["relationship-asset-selected-list"].children.length, 1);
  assert.equal(harness.status.dataset.state, "error");
  assert.equal(harness.statusMessage.textContent.includes("ontvangen, maar kon nog niet worden verwerkt"), true);
  assert.equal(harness.statusMessage.textContent.includes("socket"), false);
});
