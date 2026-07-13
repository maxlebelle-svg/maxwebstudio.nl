import { normalizeContentItem } from "./core.mjs";

export class LocalSocialStudioRepository {
  constructor(storage, keys) {
    this.storage = storage;
    this.keys = { ...keys };
  }

  read(key, fallback) {
    try {
      const rawValue = this.storage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : fallback;
    } catch (error) {
      console.warn("Social Studio opslag kon niet worden gelezen.", error);
      return fallback;
    }
  }

  write(key, value) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("Social Studio opslag kon niet worden bijgewerkt.", error);
      return false;
    }
  }

  remove(key) {
    this.storage.removeItem(key);
  }

  loadVariants(fallback = []) {
    const stored = this.read(this.keys.variants, fallback);
    return Array.isArray(stored) ? stored.map(normalizeContentItem) : [];
  }

  saveVariants(variants) {
    return this.write(this.keys.variants, variants.map(normalizeContentItem));
  }

  clearWorkspace() {
    [this.keys.draft, this.keys.variants, this.keys.context].forEach((key) => this.storage.removeItem(key));
  }
}
