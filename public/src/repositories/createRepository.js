import { getProvider } from "../providers/providerFactory.js";

export function createRepository(storageKey) {
  const provider = getProvider();
  return {
    list() {
      return provider.getAll(storageKey);
    },
    get(id) {
      return provider.getById(storageKey, id);
    },
    create(data) {
      return provider.create(storageKey, data);
    },
    update(id, data) {
      return provider.update(storageKey, id, data);
    },
    remove(id) {
      return provider.delete(storageKey, id);
    },
    count() {
      return provider.count(storageKey);
    },
  };
}
