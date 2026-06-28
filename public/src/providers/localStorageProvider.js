function readValue(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return parsed;
  } catch (error) {
    console.warn(`Kon localStorage key ${key} niet lezen.`, error);
    return [];
  }
}

function writeValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `mws-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const localStorageProvider = {
  type: "localStorage",
  status: "active",

  getAll(key) {
    return ensureArray(readValue(key));
  },

  getById(key, id) {
    return this.getAll(key).find((record) => String(record.id) === String(id)) || null;
  },

  create(key, record) {
    const now = new Date().toISOString();
    const nextRecord = { ...record, id: record.id || createId(), createdAt: record.createdAt || now, updatedAt: now };
    const records = this.getAll(key);
    records.unshift(nextRecord);
    writeValue(key, records);
    return nextRecord;
  },

  update(key, id, updates) {
    const records = this.getAll(key);
    const index = records.findIndex((record) => String(record.id) === String(id));
    if (index < 0) return null;
    records[index] = { ...records[index], ...updates, updatedAt: new Date().toISOString() };
    writeValue(key, records);
    return records[index];
  },

  delete(key, id) {
    const records = this.getAll(key);
    const nextRecords = records.filter((record) => String(record.id) !== String(id));
    writeValue(key, nextRecords);
    return records.length !== nextRecords.length;
  },

  setAll(key, records) {
    writeValue(key, ensureArray(records));
    return this.getAll(key);
  },

  count(key) {
    return this.getAll(key).length;
  },
};
